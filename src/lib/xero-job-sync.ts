import { getValidXero, xeroAdmin, XERO_API, xeroHeaders } from "@/lib/xero"
import { cachedXeroJson, xeroFetch, type XeroActivity } from "./xero-requests"
import { XeroRateLimitError } from "./xero-rate-limit"

type CostingJobRow = {
  id: string
  title: string
  status: string
  reference?: string | null
  xero_quote_id: string | null
  xero_quote_number: string | null
  xero_invoice_id?: string | null
  xero_invoice_number: string | null
  job_number: string | null
}

type SyncResult = {
  ok: boolean
  jobId: string
  xeroStatus?: string
  invoiceNumber?: string | null
  changedToJob?: boolean
  warning?: string
  error?: string
  retryAfter?: number
}

export type XeroRow = Record<string, unknown>
type Connection = { accessToken: string; tenantId: string; activity?: XeroActivity }
type LinkedQuote = { job: CostingJobRow; quote: XeroRow }
const JOB_FIELDS = "id,title,status,reference,xero_quote_id,xero_quote_number,xero_invoice_id,xero_invoice_number,job_number"
const OPEN_STATUSES = ["quoted", "approved"]
const INVOICE_STATUSES = ["DRAFT", "SUBMITTED", "AUTHORISED", "PAID"]
const QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "INVOICED"]

async function xeroJson(path: string, xero: Connection) {
  const response = await xeroFetch(`${XERO_API}${path}`, {
    headers: xeroHeaders(xero.accessToken, xero.tenantId), cache: "no-store",
  }, xero.tenantId, xero.activity || "quote-check")
  const text = await response.text()
  const body = text ? JSON.parse(text) : {}
  if (!response.ok) throw new Error(body?.Message || body?.Detail || `Xero API error ${response.status}`)
  return body
}

function normaliseText(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ")
}

function contactId(row: XeroRow) {
  return String((row.Contact as XeroRow | undefined)?.ContactID || "").toLowerCase()
}

function isSalesInvoice(row: XeroRow) {
  return row.Type === "ACCREC" && !!row.InvoiceID && !!row.InvoiceNumber
    && INVOICE_STATUSES.includes(String(row.Status).toUpperCase())
}

function sameMoney(a: unknown, b: unknown) {
  if (a == null || b == null || a === "" || b === "") return false
  return Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= 0.02
}

function descriptions(row: XeroRow) {
  // Ignore headings and introductory notes: these are commonly reused across jobs.
  return (Array.isArray(row.LineItems) ? row.LineItems as XeroRow[] : [])
    .filter((line) => Number(line.Quantity) > 0 && Number(line.LineAmount ?? line.UnitAmount) > 0)
    .map((line) => normaliseText(line.Description)).filter(Boolean)
}

function referenceMatches(invoice: unknown, quote: unknown) {
  const invoiceRef = normaliseText(invoice)
  const quoteRef = normaliseText(quote)
  if (!quoteRef) return false
  // Xero users commonly append a purchase order to the copied quote reference.
  // Only recognise a delimited PO suffix, never a general title substring.
  return invoiceRef === quoteRef
    || invoiceRef.replace(/\s+(?:[-–|]\s*)?po\s*(?:#|:|no\.?\s).*$/, "").trim() === quoteRef
}

export function invoiceMatchesQuote(invoice: XeroRow, quote: XeroRow) {
  if (!isSalesInvoice(invoice) || !QUOTE_STATUSES.includes(String(quote.Status).toUpperCase())) return false
  if (!contactId(quote) || contactId(invoice) !== contactId(quote)) return false
  if (invoice.CurrencyCode && quote.CurrencyCode && invoice.CurrencyCode !== quote.CurrencyCode) return false

  const quoteNumber = normaliseText(quote.QuoteNumber)
  const referencedNumbers = normaliseText(invoice.Reference).match(/\bqu-\d+\b/g) || []
  if (quoteNumber && referencedNumbers.length) return referencedNumbers.length === 1 && referencedNumbers[0] === quoteNumber

  if (!referenceMatches(invoice.Reference, quote.Reference)) return false
  const quoteLines = descriptions(quote).sort()
  const invoiceLines = descriptions(invoice).sort()
  const sameLines = quoteLines.length > 0 && quoteLines.length === invoiceLines.length
    && quoteLines.every((line, index) => line === invoiceLines[index])
  // Price changes are allowed when the copied sales descriptions and reference agree.
  // Customer + amount alone (the old score threshold) is never sufficient.
  return sameLines || sameMoney(invoice.Total, quote.Total)
}

export function xeroDate(value: unknown): string | null {
  const text = String(value || "")
  // DateString is a calendar date, not a local timestamp to shift into UTC.
  const iso = /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(text) ? text.slice(0, 10) : null
  if (iso) {
    const parsed = new Date(iso + "T00:00:00Z")
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null
  }
  const legacy = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(text)
  const date = legacy ? new Date(Number(legacy[1])) : new Date(NaN)
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null
}

async function openJobs() {
  const rows: CostingJobRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await xeroAdmin().from("costing_jobs").select(JOB_FIELDS)
      .in("status", OPEN_STATUSES).not("xero_quote_id", "is", null).is("xero_invoice_id", null)
      .is("xero_invoice_number", null).order("id").range(from, from + 999)
    if (error) throw error
    rows.push(...(data || []) as CostingJobRow[])
    if (!data || data.length < 1000) return rows
  }
}

async function quoteForJob(job: CostingJobRow, xero: Connection) {
  const result = await xeroJson(`/Quotes/${encodeURIComponent(job.xero_quote_id!)}`, xero)
  const quote = result?.Quotes?.[0] as XeroRow | undefined
  if (!quote || quote.QuoteID !== job.xero_quote_id) throw new Error("Quote not found in Xero")
  return quote
}

async function linkedQuotes(xero: Connection, contacts: string[], known?: LinkedQuote, fresh: boolean | "refresh" = true) {
  const jobs = await openJobs()
  if (known && !jobs.some((job) => job.id === known.job.id)) jobs.push(known.job)
  const rows: LinkedQuote[] = []
  for (const contact of new Set(contacts)) {
    const load = async () => {
      const quotes: XeroRow[] = []
      for (let page = 1; page <= 20; page++) {
        const params = new URLSearchParams({ ContactID: contact, page: String(page) })
        const result = await xeroJson(`/Quotes?${params}`, xero)
        const batch = (result?.Quotes || []) as XeroRow[]
        if (batch.some((quote) => contactId(quote) !== contact)) throw new Error("Xero returned quotes for another customer.")
        quotes.push(...batch)
        if (batch.length < 100) return quotes
      }
      throw new Error("Too many customer quotes to safely check all matches. Link the invoice explicitly.")
    }
    const quotes = fresh === true ? await load() : await cachedXeroJson(xero.tenantId, `quotes:${contact}`, load, 300, fresh === "refresh")
    for (const job of jobs) {
      const quote = quotes.find((quote) => quote.QuoteID === job.xero_quote_id)
      if (quote) rows.push({ job, quote })
    }
  }
  return rows
}

async function invoicesForContact(quote: XeroRow, xero: Connection) {
  if (!contactId(quote)) return []
  const rows = new Map<string, XeroRow>()
  // Paginated invoice responses include LineItems. Search the customer's invoices,
  // not just the newest page across the whole Xero organisation.
  for (let page = 1; page <= 20; page++) {
    const params = new URLSearchParams({ ContactIDs: contactId(quote), page: String(page),
      pageSize: "100", order: "UpdatedDateUTC DESC", where: 'Type=="ACCREC"' })
    const result = await xeroJson(`/Invoices?${params}`, xero)
    const invoices = (result?.Invoices || []) as XeroRow[]
    for (const invoice of invoices) if (isSalesInvoice(invoice)) rows.set(String(invoice.InvoiceID), invoice)
    if (invoices.length < 100) return [...rows.values()]
  }
  throw new Error("Too many Xero invoices to safely check all matches. Link the invoice explicitly from the job.")
}

async function saveUnlinkedJob(job: CostingJobRow, updates: Record<string, unknown>) {
  // The unique InvoiceID index plus this compare-and-set protect against repeated
  // webhooks, concurrent checks, and a job being completed or linked during lookup.
  const { data, error } = await xeroAdmin().from("costing_jobs").update(updates)
    .eq("id", job.id).eq("status", job.status).eq("xero_quote_id", job.xero_quote_id)
    .is("xero_invoice_id", null).is("xero_invoice_number", null).select("id")
  if (error) throw error
  if (!data?.length) throw new Error("This RPM record changed during sync. Refresh it and check again.")
}

async function activateJobFromInvoice(job: CostingJobRow, quote: XeroRow, invoice: XeroRow): Promise<SyncResult> {
  const invoiceId = String(invoice.InvoiceID)
  const invoiceNumber = String(invoice.InvoiceNumber)
  const { data: existing, error } = await xeroAdmin().from("costing_jobs").select("id")
    .or(`xero_invoice_id.eq.${JSON.stringify(invoiceId)},xero_invoice_number.eq.${JSON.stringify(invoiceNumber)}`)
    .neq("id", job.id).limit(1)
  if (error) throw error
  if (existing?.length) throw new Error("This Xero invoice is already linked to another RPM job.")

  const now = new Date().toISOString()
  const dueDate = xeroDate(invoice.DueDateString || invoice.DueDate)
  await saveUnlinkedJob(job, {
    xero_quote_number: quote.QuoteNumber || job.xero_quote_number,
    xero_invoice_id: invoiceId, xero_invoice_number: invoiceNumber,
    job_number: invoiceNumber, status: "in_progress", updated_at: now,
    ...(dueDate ? { completion_date: dueDate } : {}),
  })
  return { ok: true, jobId: job.id, xeroStatus: String(quote.Status), invoiceNumber, changedToJob: true }
}

async function uniqueInvoice(quote: XeroRow, xero: Connection) {
  const matches = (await invoicesForContact(quote, xero)).filter((invoice) => invoiceMatchesQuote(invoice, quote))
  if (matches.length > 1) throw new Error("Multiple Xero invoices match this quote. No link was changed; link the intended invoice explicitly.")
  return matches[0] || null
}

// Explicit selection resolves repeat-order ambiguity, but still validates the
// customer and quote match. Only RPM's link is written; Xero is read-only here.
export async function previewQuoteInvoiceLink(job: CostingJobRow, number: string) {
  if (!job.xero_quote_id || !OPEN_STATUSES.includes(job.status)) throw new Error("Only an open Xero quote can be linked here.")
  if (job.xero_invoice_id || job.xero_invoice_number) throw new Error("This RPM record is already linked to an invoice. Refresh it before continuing.")
  if (!number.trim()) throw new Error("Enter a Xero invoice number.")
  const xero = await getValidXero()
  if (!xero) throw new Error("Xero is not connected")
  const quote = await quoteForJob(job, xero)
  const result = await xeroJson(`/Invoices/${encodeURIComponent(number.trim())}`, xero)
  const invoice = result?.Invoices?.[0] as XeroRow | undefined
  if (!invoice || invoice.InvoiceNumber !== number.trim()) throw new Error("The Xero invoice number did not match.")
  if (!invoiceMatchesQuote(invoice, quote)) throw new Error("This invoice does not match the linked Xero quote's customer and quote details.")
  return { quote, invoice }
}

export async function linkQuoteToInvoice(job: CostingJobRow, number: string, expectedInvoiceId: string) {
  if (!expectedInvoiceId) throw new Error("Find and review the invoice before linking it.")
  const { quote, invoice } = await previewQuoteInvoiceLink(job, number)
  if (invoice.InvoiceID !== expectedInvoiceId) throw new Error("The invoice changed since the preview. Find and review it again.")
  const result = await activateJobFromInvoice(job, quote, invoice)
  return { ...result, invoice }
}

export async function syncLinkedQuoteToJob(job: CostingJobRow): Promise<SyncResult> {
  if (!job.xero_quote_id) return { ok: false, jobId: job.id, error: "No Xero quote ID" }
  if (job.xero_invoice_id || job.xero_invoice_number || !OPEN_STATUSES.includes(job.status)) {
    return { ok: true, jobId: job.id, invoiceNumber: job.xero_invoice_number, changedToJob: false }
  }
  try {
    const xero = await getValidXero()
    if (!xero) throw new Error("Xero is not connected")
    const quote = await quoteForJob(job, xero)
    const xeroStatus = String(quote.Status || "").toUpperCase()
    // Invoice creation and quote status changes need not be visible at the same time.
    // A draft invoice is linkable; it does not need approval or an INVOICED quote.
    const invoice = QUOTE_STATUSES.includes(xeroStatus) ? await uniqueInvoice(quote, xero) : null
    if (invoice) {
      const matches = (await linkedQuotes(xero, [contactId(quote)], { job, quote })).filter((row) => invoiceMatchesQuote(invoice, row.quote))
      if (matches.length !== 1 || matches[0].job.id !== job.id) throw new Error("This invoice matches multiple RPM quotes. No link was changed.")
      return await activateJobFromInvoice(job, matches[0].quote, invoice)
    }
    await saveUnlinkedJob(job, {
      xero_quote_number: quote.QuoteNumber || job.xero_quote_number,
      updated_at: new Date().toISOString(),
      status: xeroStatus === "ACCEPTED" || xeroStatus === "INVOICED" ? "approved" : "quoted",
    })
    return { ok: true, jobId: job.id, xeroStatus, invoiceNumber: null, changedToJob: false,
      warning: "No matching Xero invoice was found. The quote status was checked; no invoice link was changed." }
  } catch (error) {
    return { ok: false, jobId: job.id, error: error instanceof Error ? error.message : "Xero sync failed", ...(error instanceof XeroRateLimitError ? { retryAfter: error.retryAfter } : {}) }
  }
}

export async function syncOpenQuotesForInvoices(invoices: XeroRow[]) {
  const salesInvoices = [...new Map(invoices.filter(isSalesInvoice).map((row) => [String(row.InvoiceID), row])).values()]
  if (!salesInvoices.length) return [] as SyncResult[]
  const connection = await getValidXero()
  if (!connection) throw new Error("Xero is not connected")
  // No open linked quotes means invoice notifications require no further Xero reads.
  if (!(await openJobs()).length) return [] as SyncResult[]
  const xero: Connection = { ...connection, activity: "background" }
  const contacts = salesInvoices.map(contactId).filter(Boolean)
  let quotes = await linkedQuotes(xero, contacts, undefined, false)
  // A cached miss must not discard a notification after a quote was edited in
  // Xero. Refresh the affected customers once before deciding there is no match.
  const missedContacts = [...new Set(salesInvoices.filter((invoice) => !quotes.some((row) => invoiceMatchesQuote(invoice, row.quote))).map(contactId).filter(Boolean))]
  if (missedContacts.length) {
    const refreshed = await linkedQuotes(xero, missedContacts, undefined, "refresh")
    quotes = [...quotes.filter((row) => !missedContacts.includes(contactId(row.quote))), ...refreshed]
  }
  const results: SyncResult[] = []
  // Resolve the entire batch before writes so order cannot break ambiguity ties.
  const matches = salesInvoices.map((invoice) => ({ invoice, quotes: quotes.filter((row) => invoiceMatchesQuote(invoice, row.quote)) }))
  const checkedQuotes = new Map<string, Promise<LinkedQuote[]>>()
  const checkedInvoices = new Map<string, Promise<XeroRow[]>>()
  for (const match of matches) {
    if (match.quotes.length !== 1) continue
    const { job } = match.quotes[0]
    if (matches.filter((other) => other.quotes.some((row) => row.job.id === job.id)).length !== 1) continue
    try {
      // Cached data is candidate discovery only. Recheck all customer quotes
      // freshly before writing so edits or repeat orders cannot hide ambiguity.
      const contact = contactId(match.invoice)
      if (!checkedQuotes.has(contact)) checkedQuotes.set(contact, linkedQuotes(xero, [contact]))
      const freshMatches = (await checkedQuotes.get(contact)!).filter((row) => invoiceMatchesQuote(match.invoice, row.quote))
      if (freshMatches.length !== 1 || freshMatches[0].job.id !== job.id) continue
      const freshQuote = freshMatches[0].quote
      // Check for competing invoices outside this webhook batch as well.
      if (!checkedInvoices.has(contact)) checkedInvoices.set(contact, invoicesForContact(freshQuote, xero))
      const candidates = (await checkedInvoices.get(contact)!).filter((row) => invoiceMatchesQuote(row, freshQuote))
      if (candidates.length > 1) throw new Error("Multiple Xero invoices match this quote. No link was changed; link the intended invoice explicitly.")
      const invoice = candidates[0]
      if (!invoice || invoice.InvoiceID !== match.invoice.InvoiceID) continue
      results.push(await activateJobFromInvoice(job, freshQuote, invoice))
    } catch (error) {
      results.push({ ok: false, jobId: job.id, error: error instanceof Error ? error.message : "Xero sync failed" })
    }
  }
  return results
}

export async function syncOpenQuotesForReferences(references: string[]) {
  const unique = new Set(references.map(normaliseText).filter(Boolean))
  if (!unique.size) return [] as SyncResult[]
  const jobs = (await openJobs()).filter((job) => unique.has(normaliseText(job.reference)) || unique.has(normaliseText(job.title)))
  const results: SyncResult[] = []
  for (const job of jobs) results.push(await syncLinkedQuoteToJob(job))
  return results
}
