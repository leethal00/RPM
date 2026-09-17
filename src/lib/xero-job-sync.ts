import { getValidXero, xeroAdmin, XERO_API, xeroHeaders } from "@/lib/xero"

type CostingJobRow = {
  id: string
  title: string
  status: string
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

async function xeroJson(url: string, accessToken: string, tenantId: string) {
  const response = await fetch(url, { headers: xeroHeaders(accessToken, tenantId), cache: "no-store" })
  const text = await response.text()
  const body = text ? JSON.parse(text) : {}
  if (!response.ok) throw new Error(body?.Message || body?.Detail || `Xero API error ${response.status}`)
  return body
}

export async function syncLinkedQuoteToJob(job: CostingJobRow): Promise<SyncResult> {
  if (!job.xero_quote_id) return { ok: false, jobId: job.id, error: "No Xero quote ID" }

  const xero = await getValidXero()
  if (!xero) return { ok: false, jobId: job.id, error: "Xero is not connected" }

  try {
    const quoteResult = await xeroJson(`${XERO_API}/Quotes/${job.xero_quote_id}`, xero.accessToken, xero.tenantId)
    const quote = quoteResult?.Quotes?.[0]
    if (!quote) return { ok: false, jobId: job.id, error: "Quote not found in Xero" }

    const xeroStatus = String(quote.Status || "").toUpperCase()
    const updates: Record<string, unknown> = {
      xero_quote_number: quote.QuoteNumber || job.xero_quote_number || null,
      updated_at: new Date().toISOString(),
    }

    if (xeroStatus === "ACCEPTED") updates.status = "approved"
    else if (xeroStatus === "INVOICED") updates.status = "in_progress"
    else updates.status = "quoted"

    let invoiceNumber = job.xero_invoice_number
    let changedToJob = false

    if (xeroStatus === "INVOICED") {
      const reference = String(quote.Reference || "").trim()
      if (reference) {
        const where = encodeURIComponent(`Reference==\"${reference.replaceAll('"', '\\"')}\"`)
        const invoiceResult = await xeroJson(`${XERO_API}/Invoices?where=${where}&order=Date%20DESC`, xero.accessToken, xero.tenantId)
        const invoices = (invoiceResult?.Invoices || []) as Array<Record<string, unknown>>
        const invoice = invoices.find((row) => String(row.Type || "").toUpperCase() === "ACCREC") || invoices[0]
        if (invoice?.InvoiceNumber) {
          invoiceNumber = String(invoice.InvoiceNumber)
          updates.xero_invoice_number = invoiceNumber
          updates.job_number = invoiceNumber
          updates.status = "in_progress"
          const dueDate = String(invoice.DueDateString || invoice.DueDate || "").slice(0, 10)
          if (dueDate) updates.completion_date = dueDate
          changedToJob = job.status !== "in_progress" || job.xero_invoice_number !== invoiceNumber
        }
      }
    }

    const admin = xeroAdmin()
    const { error: saveError } = await admin.from("costing_jobs").update(updates).eq("id", job.id)
    if (saveError) throw saveError

    return { ok: true, jobId: job.id, xeroStatus, invoiceNumber, changedToJob }
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
    .select("id,title,status,xero_quote_id,xero_quote_number,xero_invoice_number,job_number")
    .in("status", ["quoted", "approved"])
    .not("xero_quote_id", "is", null)
    .in("title", unique)

  if (error) throw error
  const jobs = (data || []) as CostingJobRow[]
  const results: SyncResult[] = []
  for (const job of jobs) results.push(await syncLinkedQuoteToJob(job))
  return results
}
