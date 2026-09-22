import { getValidXero, xeroAdmin, XERO_API, xeroHeaders } from "@/lib/xero"

type CostingJobRow = {
  id: string
  title: string
  status: string
  reference?: string | null
  xero_quote_id: string | null
  xero_quote_number: string | null
  xero_invoice_number: string | null
  job_number: string | null
}

type SyncResult = {
  ok: boolean
  jobId: string
  xeroStatus?: string
  invoiceNumber?: string | null
  changedToJob?: boolean
  error?: string
}

export type XeroRow = Record<string, unknown>

async function xeroJson(url: string, accessToken: string, tenantId: string) {
  const response = await fetch(url, { headers: xeroHeaders(accessToken, tenantId), cache: "no-store" })
  const text = await response.text()
  const body = text ? JSON.parse(text) : {}
  if (!response.ok) throw new Error(body?.Message || body?.Detail || `Xero API error ${response.status}`)
  return body
}

function normaliseText(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ")
}

function numeric(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function contactId(row: XeroRow) {
  const contact = row.Contact as Record<string, unknown> | undefined
  return String(contact?.ContactID || "")
}

function lineDescriptions(row: XeroRow) {
  const lines = Array.isArray(row.LineItems) ? row.LineItems as Array<Record<string, unknown>> : []
  return lines.map((line) => normaliseText(line.Description)).filter(Boolean)
}

function sameMoney(a: unknown, b: unknown) {
  const x = numeric(a)
  const y = numeric(b)
  return x != null && y != null && Math.abs(x - y) <= 0.02
}

function invoiceScore(invoice: XeroRow, quote: XeroRow) {
  if (String(invoice.Type || "").toUpperCase() !== "ACCREC") return -1

  const quoteContact = contactId(quote)
  const invoiceContact = contactId(invoice)
  if (quoteContact && invoiceContact && quoteContact !== invoiceContact) return -1

  let score = 0
  if (quoteContact && invoiceContact === quoteContact) score += 6
  if (sameMoney(invoice.Total, quote.Total)) score += 6

  const quoteRef = normaliseText(quote.Reference)
  const invoiceRef = normaliseText(invoice.Reference)
  if (quoteRef && invoiceRef === quoteRef) score += 10

  const qLines = lineDescriptions(quote)
  const iLines = new Set(lineDescriptions(invoice))
  const matchingLines = qLines.filter((description) => iLines.has(description)).length
  if (matchingLines) score += Math.min(8, matchingLines * 3)

  return score
}

async function findInvoiceForQuote(quote: XeroRow, accessToken: string, tenantId: string) {
  const reference = String(quote.Reference || "").trim()

  if (reference) {
    const where = encodeURIComponent(`Reference=="${reference.replaceAll('"', '\\"')}"`)
    const exactResult = await xeroJson(
      `${XERO_API}/Invoices?where=${where}&order=Date%20DESC`,
      accessToken,
      tenantId,
    )
    const exact = ((exactResult?.Invoices || []) as XeroRow[])
      .find((row) => String(row.Type || "").toUpperCase() === "ACCREC")
    if (exact?.InvoiceNumber) return exact
  }

  const recentResult = await xeroJson(
    `${XERO_API}/Invoices?page=1&order=Date%20DESC`,
    accessToken,
    tenantId,
  )
  const recent = ((recentResult?.Invoices || []) as XeroRow[])
    .filter((row) => String(row.Type || "").toUpperCase() === "ACCREC")

  const scored = recent
    .map((invoice) => ({ invoice, score: invoiceScore(invoice, quote) }))
    .filter(({ score }) => score >= 12)
    .sort((a, b) => b.score - a.score)

  if (!scored.length) return null
  if (scored.length > 1 && scored[0].score === scored[1].score) return null
  return scored[0].invoice
}

async function activateJobFromInvoice(job: CostingJobRow, quote: XeroRow, invoice: XeroRow): Promise<SyncResult> {
  const invoiceNumber = String(invoice.InvoiceNumber || "").trim()
  if (!invoiceNumber) return { ok: false, jobId: job.id, error: "Matched Xero invoice has no invoice number" }

  const updates: Record<string, unknown> = {
    xero_quote_number: quote.QuoteNumber || job.xero_quote_number || null,
    xero_invoice_number: invoiceNumber,
    job_number: invoiceNumber,
    status: "in_progress",
    updated_at: new Date().toISOString(),
  }

  const dueDate = String(invoice.DueDateString || invoice.DueDate || "").slice(0, 10)
  if (dueDate) updates.completion_date = dueDate

  const admin = xeroAdmin()
  const { error } = await admin.from("costing_jobs").update(updates).eq("id", job.id)
  if (error) throw error

  return {
    ok: true,
    jobId: job.id,
    xeroStatus: String(quote.Status || "").toUpperCase(),
    invoiceNumber,
    changedToJob: job.status !== "in_progress" || job.xero_invoice_number !== invoiceNumber,
  }
}

export async function syncLinkedQuoteToJob(job: CostingJobRow): Promise<SyncResult> {
  if (!job.xero_quote_id) return { ok: false, jobId: job.id, error: "No Xero quote ID" }

  const xero = await getValidXero()
  if (!xero) return { ok: false, jobId: job.id, error: "Xero is not connected" }

  try {
    const quoteResult = await xeroJson(`${XERO_API}/Quotes/${job.xero_quote_id}`, xero.accessToken, xero.tenantId)
    const quote = quoteResult?.Quotes?.[0] as XeroRow | undefined
    if (!quote) return { ok: false, jobId: job.id, error: "Quote not found in Xero" }

    const xeroStatus = String(quote.Status || "").toUpperCase()
    if (xeroStatus === "INVOICED") {
      const invoice = await findInvoiceForQuote(quote, xero.accessToken, xero.tenantId)
      if (invoice?.InvoiceNumber) return activateJobFromInvoice(job, quote, invoice)
    }

    const updates: Record<string, unknown> = {
      xero_quote_number: quote.QuoteNumber || job.xero_quote_number || null,
      updated_at: new Date().toISOString(),
      status: xeroStatus === "ACCEPTED" || xeroStatus === "INVOICED" ? "approved" : "quoted",
    }

    const admin = xeroAdmin()
    const { error: saveError } = await admin.from("costing_jobs").update(updates).eq("id", job.id)
    if (saveError) throw saveError

    return {
      ok: true,
      jobId: job.id,
      xeroStatus,
      invoiceNumber: job.xero_invoice_number,
      changedToJob: false,
      ...(xeroStatus === "INVOICED"
        ? { error: "Xero marks this quote as invoiced, but RPM could not safely identify the invoice yet." }
        : {}),
    }
  } catch (error) {
    return { ok: false, jobId: job.id, error: error instanceof Error ? error.message : "Xero sync failed" }
  }
}

// Event-driven webhook matching: Xero gives RPM the invoice ID, not the originating QuoteID.
// On an invoice webhook, compare that invoice against currently open RPM-linked Xero quotes.
// This only runs when Xero tells us an invoice changed, so there is no idle polling.
export async function syncOpenQuotesForInvoices(invoices: XeroRow[]) {
  const salesInvoices = invoices.filter(
    (invoice) => String(invoice.Type || "").toUpperCase() === "ACCREC" && invoice.InvoiceNumber
  )
  if (!salesInvoices.length) return [] as SyncResult[]

  const xero = await getValidXero()
  if (!xero) throw new Error("Xero is not connected")

  const admin = xeroAdmin()
  const { data, error } = await admin
    .from("costing_jobs")
    .select("id,title,status,reference,xero_quote_id,xero_quote_number,xero_invoice_number,job_number")
    .in("status", ["quoted", "approved"])
    .not("xero_quote_id", "is", null)

  if (error) throw error
  const jobs = (data || []) as CostingJobRow[]
  if (!jobs.length) return [] as SyncResult[]

  const quoteRows: Array<{ job: CostingJobRow; quote: XeroRow }> = []
  for (const job of jobs) {
    try {
      const result = await xeroJson(`${XERO_API}/Quotes/${job.xero_quote_id}`, xero.accessToken, xero.tenantId)
      const quote = result?.Quotes?.[0] as XeroRow | undefined
      if (quote && String(quote.Status || "").toUpperCase() === "INVOICED") quoteRows.push({ job, quote })
    } catch (lookupError) {
      console.error("Xero webhook quote lookup failed", job.xero_quote_id, lookupError)
    }
  }

  const results: SyncResult[] = []
  const claimedJobs = new Set<string>()

  for (const invoice of salesInvoices) {
    const scored = quoteRows
      .filter(({ job }) => !claimedJobs.has(job.id))
      .map(({ job, quote }) => ({ job, quote, score: invoiceScore(invoice, quote) }))
      .filter(({ score }) => score >= 12)
      .sort((a, b) => b.score - a.score)

    if (!scored.length) continue
    if (scored.length > 1 && scored[0].score === scored[1].score) continue

    const best = scored[0]
    const result = await activateJobFromInvoice(best.job, best.quote, invoice)
    claimedJobs.add(best.job.id)
    results.push(result)
  }

  return results
}

export async function syncOpenQuotesForReferences(references: string[]) {
  const unique = Array.from(new Set(references.map((value) => value.trim()).filter(Boolean)))
  if (!unique.length) return [] as SyncResult[]

  const admin = xeroAdmin()
  const { data, error } = await admin
    .from("costing_jobs")
    .select("id,title,status,reference,xero_quote_id,xero_quote_number,xero_invoice_number,job_number")
    .in("status", ["quoted", "approved"])
    .not("xero_quote_id", "is", null)
    .in("reference", unique)

  if (error) throw error
  const jobs = (data || []) as CostingJobRow[]
  const results: SyncResult[] = []
  for (const job of jobs) results.push(await syncLinkedQuoteToJob(job))
  return results
}
