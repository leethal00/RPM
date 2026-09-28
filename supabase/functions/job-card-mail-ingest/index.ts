import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import PostalMime from "postal-mime";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
const enc = new TextEncoder();
const dec = new TextDecoder();

// Scanners often label PDFs as application/octet-stream. Check the bytes instead
// of trusting the email's MIME header or the filename extension.
function supportedContentType(bytes: Uint8Array): string | null {
  const start = dec.decode(bytes.slice(0, 1024));
  if (start.includes("%PDF-")) return "application/pdf";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return "image/png";
  return null;
}

function quoteImap(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function concat(a: Uint8Array, b: Uint8Array) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0); out.set(b, a.length); return out;
}

class ImapConnection {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buffer = new Uint8Array(0);

  constructor(private conn: Deno.TlsConn) {
    this.reader = conn.readable.getReader();
    this.writer = conn.writable.getWriter();
  }

  async write(line: string) { await this.writer.write(enc.encode(line.endsWith("\r\n") ? line : `${line}\r\n`)); }

  private async fill(timeoutMs = 10000) {
    const chunk = await Promise.race([
      this.reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("IMAP read timed out")), timeoutMs)),
    ]);
    if (chunk.done) throw new Error("IMAP connection closed");
    if (chunk.value) this.buffer = concat(this.buffer, chunk.value);
  }

  async readLine(timeoutMs = 10000): Promise<string> {
    const started = Date.now();
    while (true) {
      for (let i = 0; i < this.buffer.length - 1; i++) {
        if (this.buffer[i] === 13 && this.buffer[i + 1] === 10) {
          const line = dec.decode(this.buffer.slice(0, i));
          this.buffer = this.buffer.slice(i + 2);
          return line;
        }
      }
      const left = timeoutMs - (Date.now() - started);
      if (left <= 0) throw new Error("Timed out waiting for IMAP line");
      await this.fill(left);
    }
  }

  async readExactly(length: number, timeoutMs = 15000): Promise<Uint8Array> {
    const started = Date.now();
    while (this.buffer.length < length) {
      const left = timeoutMs - (Date.now() - started);
      if (left <= 0) throw new Error(`Timed out waiting for ${length} IMAP literal bytes`);
      await this.fill(left);
    }
    const out = this.buffer.slice(0, length);
    this.buffer = this.buffer.slice(length);
    return out;
  }

  async response(tag: string, timeoutMs = 15000) {
    const lines: string[] = [];
    const literals: Uint8Array[] = [];
    const started = Date.now();
    while (true) {
      const left = timeoutMs - (Date.now() - started);
      if (left <= 0) throw new Error(`Timed out waiting for ${tag}`);
      const line = await this.readLine(left);
      lines.push(line);
      const literal = line.match(/\{(\d+)\}$/);
      if (literal) literals.push(await this.readExactly(Number(literal[1]), left));
      if (line.startsWith(`${tag} `)) return { lines, literals, final: line };
    }
  }

  close() {
    try { this.writer.releaseLock(); } catch {}
    try { this.reader.releaseLock(); } catch {}
    try { this.conn.close(); } catch {}
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return json({ ok: false, stage: "auth", error: "Unauthorized" }, 200);

  const host = Deno.env.get("RPM_JOBCARDS_IMAP_HOST");
  const port = Number(Deno.env.get("RPM_JOBCARDS_IMAP_PORT") || "993");
  const mailboxUser = Deno.env.get("RPM_JOBCARDS_IMAP_USER");
  const mailboxPass = Deno.env.get("RPM_JOBCARDS_IMAP_PASSWORD");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!host || !mailboxUser || !mailboxPass || !supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ ok: false, stage: "config", error: "Missing required configuration" }, 200);
  }

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ ok: false, stage: "auth", error: "Unauthorized" }, 200);

  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let socket: ImapConnection | null = null;
  let stage = "connect";

  try {
    const conn = await Promise.race([
      Deno.connectTls({ hostname: host, port }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("TLS connect timed out")), 10000)),
    ]);
    socket = new ImapConnection(conn);

    stage = "greeting";
    const greeting = await socket.readLine(5000);
    if (!/^\* OK/i.test(greeting)) throw new Error(`Unexpected IMAP greeting: ${greeting}`);

    stage = "login";
    await socket.write(`a1 LOGIN ${quoteImap(mailboxUser)} ${quoteImap(mailboxPass)}`);
    const login = await socket.response("a1", 10000);
    if (!/^a1 OK/i.test(login.final)) throw new Error(login.final);

    stage = "select";
    await socket.write("a2 SELECT INBOX");
    const select = await socket.response("a2", 10000);
    if (!/^a2 OK/i.test(select.final)) throw new Error(select.final);

    stage = "search";
    await socket.write("a3 UID SEARCH UNSEEN");
    const search = await socket.response("a3", 10000);
    if (!/^a3 OK/i.test(search.final)) throw new Error(search.final);
    const searchLine = search.lines.find((line) => /^\* SEARCH/i.test(line)) || "* SEARCH";
    const uidText = searchLine.replace(/^\* SEARCH\s*/i, "").trim();
    const uids = uidText ? uidText.split(/\s+/).map(Number).filter(Number.isFinite) : [];

    const results: Array<Record<string, unknown>> = [];
    let tagNo = 4;

    for (const uid of uids.slice(0, 10)) {
      stage = `fetch-${uid}`;
      const fetchTag = `a${tagNo++}`;
      await socket.write(`${fetchTag} UID FETCH ${uid} (BODY.PEEK[])`);
      const fetched = await socket.response(fetchTag, 20000);
      if (!new RegExp(`^${fetchTag} OK`, "i").test(fetched.final)) throw new Error(fetched.final);
      const rawMessage = fetched.literals[0];
      if (!rawMessage) throw new Error(`No RFC822 message body returned for UID ${uid}`);

      const parsed = await new PostalMime().parse(rawMessage);
      const baseMessageId = parsed.messageId || `uid-${uid}`;
      const attachments = (parsed.attachments || []).map((attachment) => {
        const bytes = attachment.content instanceof Uint8Array ? attachment.content : new Uint8Array(attachment.content as ArrayBuffer);
        return { attachment, bytes, contentType: supportedContentType(bytes) };
      }).filter((item) => item.contentType !== null);

      if (!attachments.length) {
        const { data: existing } = await sb.from("job_card_scans").select("id").eq("source_message_id", baseMessageId).maybeSingle();
        if (!existing) {
          const { error } = await sb.from("job_card_scans").insert({
            source_message_id: baseMessageId,
            source_email: parsed.from?.address || null,
            subject: parsed.subject || null,
            received_at: new Date().toISOString(),
            status: "review_required",
            review_notes: "Email received without a supported PDF/JPG/PNG attachment; email retained in mailbox",
          });
          if (error) throw error;
        }
        const seenTag = `a${tagNo++}`;
        await socket.write(`${seenTag} UID STORE ${uid} +FLAGS (\\Seen)`);
        await socket.response(seenTag, 10000);
        results.push({ uid, imported: 0, retained: true, review_required: true });
        continue;
      }

      let imported = 0;
      for (let i = 0; i < attachments.length; i++) {
        const { attachment: a, bytes, contentType } = attachments[i];
        const sourceMessageId = attachments.length > 1 ? `${baseMessageId}#${i + 1}` : baseMessageId;
        const { data: existing } = await sb.from("job_card_scans").select("id,storage_path,status").eq("source_message_id", sourceMessageId).maybeSingle();
        if (existing?.storage_path || existing?.status === "processed" || existing?.status === "deleted") continue;

        const fileName = a.filename || `job-card-${uid}-${i + 1}`;
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
        const safeMessage = sourceMessageId.replace(/[^a-zA-Z0-9_-]+/g, "_");
        const storagePath = `${new Date().toISOString().slice(0, 10)}/${safeMessage}/${i + 1}-${safeName}`;
        const upload = await sb.storage.from("job-card-scans").upload(storagePath, bytes, { contentType: contentType!, upsert: false });
        if (upload.error) throw upload.error;

        const record = {
          source_message_id: sourceMessageId,
          source_email: parsed.from?.address || null,
          subject: parsed.subject || null,
          attachment_name: fileName,
          mime_type: contentType,
          storage_path: storagePath,
          status: "review_required",
          review_notes: null,
        };
        const saved = existing
          ? await sb.from("job_card_scans").update(record).eq("id", existing.id)
          : await sb.from("job_card_scans").insert({ ...record, received_at: new Date().toISOString() });
        if (saved.error) throw saved.error;
        imported++;
      }

      // The attachment is safely stored in Supabase, so remove the source email from the dedicated mailbox.
      const deleteTag = `a${tagNo++}`;
      await socket.write(`${deleteTag} UID STORE ${uid} +FLAGS (\\Seen \\Deleted)`);
      const deleted = await socket.response(deleteTag, 10000);
      if (!new RegExp(`^${deleteTag} OK`, "i").test(deleted.final)) throw new Error(deleted.final);

      results.push({ uid, imported, deleted_from_mailbox: true });
    }

    if (uids.length) {
      stage = "expunge";
      const expungeTag = `a${tagNo++}`;
      await socket.write(`${expungeTag} EXPUNGE`);
      const expunged = await socket.response(expungeTag, 10000);
      if (!new RegExp(`^${expungeTag} OK`, "i").test(expunged.final)) throw new Error(expunged.final);
    }

    stage = "logout";
    const logoutTag = `a${tagNo++}`;
    await socket.write(`${logoutTag} LOGOUT`);
    try { await socket.response(logoutTag, 3000); } catch {}
    socket.close();

    return json({ ok: true, stage: "done", checked: Math.min(uids.length, 10), unread_found: uids.length, results });
  } catch (error) {
    socket?.close();
    return json({ ok: false, stage, error: error instanceof Error ? error.message : String(error) }, 200);
  }
});
