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

type XeroRow = Record<string, unknown>

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

  // First use Xero's exact Reference match when it is preserved from the quote.
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

  // Xero does not expose a direct QuoteID -> InvoiceID link in the Accounting API.
  // If the invoice reference was edited, inspect recent sales invoices and match on
  // contact + total + line descriptions from the source quote. We only accept a
  // clear best match to avoid attaching the wrong invoice.
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

export async function syncLinkedQuoteToJob(job: CostingJobRow): Promise<SyncResult> {
  if (!job.xero_quote_id) return { ok: false, jobId: job.id, error: "No Xero quote ID" }

  const xero = await getValidXero()
  if (!xero) return { ok: false, jobId: job.id, error: "Xero is not connected" }

  try {
    const quoteResult = await xeroJson(`${XERO_API}/Quotes/${job.xero_quote_id}`, xero.accessToken, xero.tenantId)
    const quote = quoteResult?.Quotes?.[0] as XeroRow | undefined
    if (!quote) return { ok: false, jobId: job.id, error: "Quote not found in Xero" }

    const xeroStatus = String(quote.Status || "").toUpperCase()
    const updates: Record<string, unknown> = {
      xero_quote_number: quote.QuoteNumber || job.xero_quote_number || null,
      updated_at: new Date().toISOString(),
    }

    let invoiceNumber = job.xero_invoice_number
    let changedToJob = false

    if (xeroStatus === "ACCEPTED") {
      updates.status = "approved"
    } else if (xeroStatus === "INVOICED") {
      const invoice = await findInvoiceForQuote(quote, xero.accessToken, xero.tenantId)

      if (invoice?.InvoiceNumber) {
        invoiceNumber = String(invoice.InvoiceNumber)
        updates.xero_invoice_number = invoiceNumber
        updates.job_number = invoiceNumber
        updates.status = "in_progress"

        const dueDate = String(invoice.DueDateString || invoice.DueDate || "").slice(0, 10)
        if (dueDate) updates.completion_date = dueDate

        changedToJob = job.status !== "in_progress" || job.xero_invoice_number !== invoiceNumber
      } else {
        // Do not turn an RPM quote into a production job until we have positively
        // identified the Xero invoice that supplies its job number.
        updates.status = "approved"
      }
    } else {
      updates.status = "quoted"
    }

    const admin = xeroAdmin()
    const { error: saveError } = await admin.from("costing_jobs").update(updates).eq("id", job.id)
    if (saveError) throw saveError

    return {
      ok: true,
      jobId: job.id,
      xeroStatus,
      invoiceNumber,
      changedToJob,
      ...(
        xeroStatus === "INVOICED" && !invoiceNumber
          ? { error: "Xero marks this quote as invoiced, but RPM could not safely identify the invoice yet." }
          : {}
      ),
    }
  } catch (error) {
    return { ok: false, jobId: job.id, error: error instanceof Error ? error.message : "Xero sync failed" }
  }
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
