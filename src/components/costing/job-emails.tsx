"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Download, Loader2, Mail, MailPlus, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"

const BUCKET = "quote-job-emails"
const MAX_SIZE = 50 * 1024 * 1024

type SavedEmail = {
  id: string
  sender: string
  subject: string
  received_on: string
  body: string | null
  file_name: string | null
  storage_path: string | null
  created_at: string
  users: { name: string | null; email: string | null } | null
}

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

export function JobEmails({ jobId }: { jobId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const fileInput = useRef<HTMLInputElement>(null)
  const [emails, setEmails] = useState<SavedEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [sender, setSender] = useState("")
  const [subject, setSubject] = useState("")
  const [receivedOn, setReceivedOn] = useState(localDate)
  const [body, setBody] = useState("")
  const [file, setFile] = useState<File | null>(null)

  const loadEmails = useCallback(async () => {
    const { data, error } = await supabase
      .from("costing_job_emails")
      .select("id,sender,subject,received_on,body,file_name,storage_path,created_at,users:saved_by(name,email)")
      .eq("job_id", jobId)
      .order("received_on", { ascending: false })
      .order("created_at", { ascending: false })
    setLoading(false)
    if (error) {
      toast.error(`Could not load emails: ${error.message}`)
      return
    }
    setEmails((data || []) as SavedEmail[])
  }, [jobId, supabase])

  useEffect(() => { void Promise.resolve().then(loadEmails) }, [loadEmails])

  function chooseFile(selected?: File) {
    if (!selected) return
    const extension = selected.name.split(".").pop()?.toLowerCase()
    if (!selected.size || selected.size > MAX_SIZE || !["eml", "msg"].includes(extension || "")) {
      setFile(null)
      if (fileInput.current) fileInput.current.value = ""
      toast.error("Choose an .eml or .msg file up to 50 MB.")
      return
    }
    setFile(selected)
    if (!subject.trim()) setSubject(selected.name.replace(/\.(eml|msg)$/i, ""))
  }

  function resetForm() {
    setSender("")
    setSubject("")
    setReceivedOn(localDate())
    setBody("")
    setFile(null)
    if (fileInput.current) fileInput.current.value = ""
    setFormOpen(false)
  }

  async function saveEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    if (!sender.trim() || !subject.trim() || !receivedOn) return toast.error("Add the sender, subject and received date.")
    if (!body.trim() && !file) return toast.error("Paste the email text or attach the original email file.")
    setSaving(true)
    let storagePath: string | null = null
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error("Sign in to save client emails.")
      if (file) {
        const extension = file.name.split(".").pop()!.toLowerCase()
        storagePath = `${jobId}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
          contentType: file.type || (extension === "eml" ? "message/rfc822" : "application/octet-stream"),
          upsert: false,
        })
        if (uploadError) throw uploadError
      }
      const { error: recordError } = await supabase.from("costing_job_emails").insert({
        job_id: jobId,
        sender: sender.trim(),
        subject: subject.trim(),
        received_on: receivedOn,
        body: body.trim() || null,
        file_name: file?.name || null,
        storage_path: storagePath,
        saved_by: user.id,
      })
      if (recordError) {
        if (storagePath) await supabase.storage.from(BUCKET).remove([storagePath])
        throw recordError
      }
      toast.success("Client email saved")
      resetForm()
      await loadEmails()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the email.")
    } finally {
      setSaving(false)
    }
  }

  async function downloadOriginal(email: SavedEmail) {
    if (!email.storage_path || !email.file_name) return
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(
        email.storage_path, 60, { download: email.file_name },
      )
      if (error || !data?.signedUrl) throw error || new Error("Could not download this email.")
      const anchor = document.createElement("a")
      anchor.href = data.signedUrl
      anchor.download = email.file_name
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download this email.")
    }
  }

  async function deleteEmail(email: SavedEmail) {
    if (!window.confirm(`Delete “${email.subject}” from this quote or job? This cannot be undone.`)) return
    setDeletingId(email.id)
    try {
      if (email.storage_path) {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove([email.storage_path])
        if (storageError) throw storageError
      }
      const { error: recordError } = await supabase.from("costing_job_emails").delete().eq("id", email.id).eq("job_id", jobId)
      if (recordError) throw recordError
      setEmails(current => current.filter(item => item.id !== email.id))
      toast.success("Client email deleted")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the email.")
      await loadEmails()
    } finally {
      setDeletingId(null)
    }
  }

  return <div className="space-y-4 pt-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold">Client emails</h2>
        <p className="mt-1 text-xs text-muted-foreground">Keep client correspondence with this quote or job. Paste the email, attach the original .eml or .msg file, or both.</p>
      </div>
      {!formOpen && <Button size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}><MailPlus className="size-4" /> Save email</Button>}
    </div>

    {formOpen && <form onSubmit={event => void saveEmail(event)} className="space-y-4 rounded-lg border bg-muted/15 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="client-email-sender">From</Label><Input id="client-email-sender" value={sender} onChange={event => setSender(event.target.value)} placeholder="Client name or email address" maxLength={320} required /></div>
        <div className="space-y-1.5"><Label htmlFor="client-email-date">Received date</Label><Input id="client-email-date" type="date" value={receivedOn} onChange={event => setReceivedOn(event.target.value)} required /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="client-email-subject">Subject</Label><Input id="client-email-subject" value={subject} onChange={event => setSubject(event.target.value)} placeholder="Email subject" maxLength={500} required /></div>
      <div className="space-y-1.5"><Label htmlFor="client-email-body">Email text</Label><Textarea id="client-email-body" value={body} onChange={event => setBody(event.target.value)} placeholder="Paste the client's message here" className="min-h-40" /></div>
      <div
        onDragEnter={event => { event.preventDefault(); setDragging(true) }}
        onDragOver={event => event.preventDefault()}
        onDragLeave={event => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
        onDrop={event => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]) }}
        className={`rounded-lg border border-dashed px-4 py-3 ${dragging ? "border-primary bg-primary/5" : "border-border"}`}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm"><Upload className="size-4 text-muted-foreground" /><span>Drop an original email file here or</span><Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>Browse files</Button></div>
        <p className="mt-1 text-xs text-muted-foreground">.eml or .msg, up to 50 MB {file && `· Selected: ${file.name}`}</p>
        <input ref={fileInput} type="file" accept=".eml,.msg" className="sr-only" aria-label="Original email file" onChange={event => chooseFile(event.target.files?.[0])} />
        {file && <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = "" }}>Remove file</Button>}
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={resetForm} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? <><Loader2 className="mr-2 size-4 animate-spin" />Saving…</> : "Save email"}</Button></div>
    </form>}

    {loading ? <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading emails…</div>
      : emails.length === 0 ? <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">No client emails saved yet.</p>
      : <div className="overflow-hidden rounded-lg border divide-y">
        {emails.map(email => <details key={email.id} className="group px-4 py-3 open:bg-muted/10">
          <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
            <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{email.subject}</span><span className="block text-xs text-muted-foreground">From {email.sender} · {new Date(`${email.received_on}T00:00:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })} · Saved by {email.users?.name || email.users?.email || "Unknown"}</span></span>
            <span className="shrink-0 text-xs text-muted-foreground group-open:hidden">Open</span>
          </summary>
          <div className="ml-7 space-y-3 pt-3">
            {email.body && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{email.body}</p>}
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {email.storage_path && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void downloadOriginal(email)}><Download className="size-3.5" /> Download original{email.file_name ? ` (${email.file_name})` : ""}</Button>}
              <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" disabled={deletingId === email.id} onClick={() => void deleteEmail(email)}><Trash2 className="size-3.5" /> Delete</Button>
            </div>
          </div>
        </details>)}
      </div>}
  </div>
}
