import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  jobs: [] as Record<string, unknown>[],
  writes: [] as Record<string, unknown>[],
  conflict: false,
  raced: false,
  dbError: false,
}))

vi.mock("@/lib/xero", () => ({
  XERO_API: "https://xero.test",
  xeroHeaders: () => ({}),
  getValidXero: async () => ({ accessToken: "token", tenantId: "tenant" }),
  xeroAdmin: () => ({ from: () => {
    let update: Record<string, unknown> | undefined
    const filters: Array<(row: Record<string, unknown>) => boolean> = []
    const builder = {
      select: () => builder,
      update: (value: Record<string, unknown>) => { update = value; return builder },
      eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return builder },
      is: (key: string, value: unknown) => { filters.push((row) => (row[key] ?? null) === value); return builder },
      in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return builder },
      not: (key: string) => { filters.push((row) => row[key] != null); return builder },
      order: () => builder,
      range: () => builder,
      or: () => builder,
      neq: () => builder,
      limit: async () => ({ data: state.conflict ? [{ id: "other-job" }] : [], error: null }),
      then: (resolve: (value: unknown) => void) => {
        if (state.dbError) return resolve({ error: new Error("Database unavailable") })
        const rows = state.jobs.filter((row) => filters.every((filter) => filter(row)))
        if (update) {
          if (state.raced) return resolve({ data: [], error: null })
          for (const row of rows) { state.writes.push(update); Object.assign(row, update) }
        }
        return resolve({ data: rows, error: null })
      },
    }
    return builder
  } }),
}))

import { invoiceMatchesQuote, syncLinkedQuoteToJob, syncOpenQuotesForInvoices, xeroDate, type XeroRow } from "./xero-job-sync"

// Observed RPM identity before repair. Xero now calls this stable QuoteID QU-3504.
const job = {
  id: "a6f1d66f-152d-447c-9630-1b831a2bbd1d", title: "Ray White Acrylic letterset", status: "quoted",
  reference: "Ray White Pakuranga", xero_quote_id: "4417050a-f9ab-48a1-9efa-c880e35a7343",
  xero_quote_number: "QU-3499", xero_invoice_id: null, xero_invoice_number: null, job_number: null,
}
const line = { Description: "Ray White Acrylic letterset\nQty: 1\nSize: 2580x457x90mm\nDetails: Individual fabricated acrylic letters (face and sides) formed from 4.5mm opal, CNC cut 20mm FPVC back, supplied with paper plot for installation setout. No allowance for LED's or vinyl.\nEx-factory", Quantity: 1, UnitAmount: 3221.08 }
const quote: XeroRow = {
  QuoteID: job.xero_quote_id, QuoteNumber: "QU-3499", Status: "SENT", Reference: job.title,
  Total: 3704.24, CurrencyCode: "NZD", Contact: { ContactID: "1de999d6-0132-44bd-95da-6aeafe6e12b3" }, LineItems: [line],
}
const invoice: XeroRow = {
  InvoiceID: "0553d40f-e7cd-46f9-a2d1-38be6429c357", InvoiceNumber: "INV-7599", Type: "ACCREC", Status: "DRAFT",
  Reference: "Ray White Acrylic letterset PO#RWPAK294703", Total: 3934.24, CurrencyCode: "NZD",
  Contact: { ContactID: "1de999d6-0132-44bd-95da-6aeafe6e12b3" }, LineItems: [{ ...line, UnitAmount: 3421.08 }], DueDateString: "2026-11-20T00:00:00",
}

function mockXero(quotes: XeroRow[] = [quote], pages: XeroRow[][] = [[invoice]]) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input)
    if (url.pathname.startsWith("/Quotes/")) {
      return { ok: true, text: async () => JSON.stringify({ Quotes: quotes.filter((q) => url.pathname.endsWith(String(q.QuoteID))) }) }
    }
    if (url.pathname === "/Invoices") {
      return { ok: true, text: async () => JSON.stringify({ Invoices: pages[Number(url.searchParams.get("page")) - 1] || [] }) }
    }
    throw new Error(`Unexpected URL ${url}`)
  }))
}

beforeEach(() => {
  state.jobs = [{ ...job }]; state.writes = []; state.conflict = false; state.raced = false; state.dbError = false
  mockXero()
})

describe("conservative Xero quote matching", () => {
  it.each(["DRAFT", "SENT", "ACCEPTED", "INVOICED"])("matches the Ray White draft invoice while the quote is %s", (status) => {
    expect(invoiceMatchesQuote(invoice, { ...quote, Status: status })).toBe(true)
  })
  it.each(["DRAFT", "SUBMITTED", "AUTHORISED", "PAID"])("supports %s sales invoices", (status) => {
    expect(invoiceMatchesQuote({ ...invoice, Status: status }, quote)).toBe(true)
  })
  it.each(["DELETED", "VOIDED", "UNKNOWN"])("rejects %s invoices", (status) => {
    expect(invoiceMatchesQuote({ ...invoice, Status: status }, quote)).toBe(false)
  })
  it("rejects bills, mismatched or absent customers, and currencies", () => {
    for (const change of [{ Type: "ACCPAY" }, { Contact: {} }, { Contact: { ContactID: "another" } }, { CurrencyCode: "AUD" }, { InvoiceID: null }]) {
      expect(invoiceMatchesQuote({ ...invoice, ...change }, quote)).toBe(false)
    }
  })
  it("does not link solely on customer and total, or a shared intro line", () => {
    expect(invoiceMatchesQuote({ ...invoice, Reference: "Unrelated", Total: quote.Total }, quote)).toBe(false)
    expect(invoiceMatchesQuote({ ...invoice, LineItems: [{ Description: "Same client intro" }] }, { ...quote, LineItems: [{ Description: "Same client intro" }] })).toBe(false)
  })
  it("does not treat longer job titles as a reference match", () => {
    expect(invoiceMatchesQuote({ ...invoice, Reference: job.title + " replacement" }, quote)).toBe(false)
    expect(invoiceMatchesQuote({ ...invoice, Reference: job.title + " for another branch" }, quote)).toBe(false)
  })
  it("uses complete quote number tokens, not prefixes", () => {
    expect(invoiceMatchesQuote({ ...invoice, Reference: "Quote QU-3499", LineItems: [] }, quote)).toBe(true)
    expect(invoiceMatchesQuote({ ...invoice, Reference: "QU-34990" }, quote)).toBe(false)
    expect(invoiceMatchesQuote({ ...invoice, Reference: "QU-3499 QU-3500" }, quote)).toBe(false)
  })
  it("retains exact-reference and total matching but not missing-money matches", () => {
    expect(invoiceMatchesQuote({ ...invoice, Reference: quote.Reference, Total: quote.Total, LineItems: [] }, quote)).toBe(true)
    expect(invoiceMatchesQuote({ ...invoice, Total: null, LineItems: [] }, { ...quote, Total: null })).toBe(false)
  })
})

describe("manual Check Xero and webhook linkback", () => {
  it("links QU-3499 to INV-7599 and saves both identifiers without changing sales values", async () => {
    expect(await syncLinkedQuoteToJob({ ...job })).toMatchObject({ ok: true, changedToJob: true, invoiceNumber: "INV-7599" })
    expect(state.writes).toHaveLength(1)
    expect(state.writes[0]).toMatchObject({ xero_quote_number: "QU-3499", xero_invoice_id: invoice.InvoiceID, xero_invoice_number: "INV-7599", job_number: "INV-7599", status: "in_progress", completion_date: "2026-11-20" })
    expect(state.writes[0]).not.toHaveProperty("xero_invoice_import_status")
    expect(state.writes[0]).not.toHaveProperty("xero_invoice_synced_at")
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method)).toBe(true)
  })
  it("refreshes the stale QU-3499 label using the actual QU-3504 identity and links INV-7599", async () => {
    mockXero([{ ...quote, QuoteNumber: "QU-3504", Status: "INVOICED", Total: 3934.24, LineItems: [{ ...line, UnitAmount: 3421.08 }] }])
    expect(await syncLinkedQuoteToJob({ ...job })).toMatchObject({ ok: true, invoiceNumber: "INV-7599" })
    expect(state.writes[0]).toMatchObject({ xero_quote_number: "QU-3504", xero_invoice_id: invoice.InvoiceID })
    expect(state.jobs[0].xero_quote_id).toBe(job.xero_quote_id)
  })
  it("webhook detects drafts before the quote status changes and is repeat-safe", async () => {
    expect(await syncOpenQuotesForInvoices([invoice, invoice])).toHaveLength(1)
    expect(await syncOpenQuotesForInvoices([invoice])).toHaveLength(0)
    expect(state.writes).toHaveLength(1)
  })
  it("searches beyond the first page and scopes discovery to the customer", async () => {
    mockXero([quote], [Array.from({ length: 100 }, (_, i) => ({ ...invoice, InvoiceID: `other-${i}`, Reference: "Other" })), [invoice]])
    expect(await syncLinkedQuoteToJob({ ...job })).toMatchObject({ ok: true, changedToJob: true })
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url))).filter((url) => url.pathname === "/Invoices")
    expect(urls.map((url) => url.searchParams.get("page"))).toEqual(["1", "2"])
    expect(urls.every((url) => url.searchParams.get("ContactIDs") === "1de999d6-0132-44bd-95da-6aeafe6e12b3")).toBe(true)
  })
  it("refuses multiple candidate invoices, including ones outside the webhook batch", async () => {
    mockXero([quote], [[invoice, { ...invoice, InvoiceID: "another", InvoiceNumber: "INV-7600" }]])
    expect(await syncLinkedQuoteToJob({ ...job })).toMatchObject({ ok: false, error: expect.stringContaining("Multiple") })
    expect(await syncOpenQuotesForInvoices([invoice])).toMatchObject([{ ok: false }])
    expect(state.writes).toEqual([])
  })
  it("refuses one invoice matching two RPM quotes in manual and webhook paths", async () => {
    state.jobs.push({ ...job, id: "job-2", xero_quote_id: "quote-2", xero_quote_number: "QU-3500" })
    mockXero([quote, { ...quote, QuoteID: "quote-2", QuoteNumber: "QU-3500" }])
    expect(await syncLinkedQuoteToJob({ ...job })).toMatchObject({ ok: false })
    expect(await syncOpenQuotesForInvoices([invoice])).toEqual([])
    expect(state.writes).toEqual([])
  })
  it("does not greedily assign two invoices in one batch to a single job", async () => {
    expect(await syncOpenQuotesForInvoices([invoice, { ...invoice, InvoiceID: "another", InvoiceNumber: "INV-7600" }])).toEqual([])
    expect(state.writes).toEqual([])
  })
  it("refuses an invoice already linked to another RPM job", async () => {
    state.conflict = true
    expect(await syncLinkedQuoteToJob({ ...job })).toMatchObject({ ok: false, error: expect.stringContaining("already linked") })
    expect(state.writes).toEqual([])
  })
  it("does not overwrite a concurrent link or status change", async () => {
    state.raced = true
    expect(await syncLinkedQuoteToJob({ ...job })).toMatchObject({ ok: false, error: expect.stringContaining("changed during sync") })
    expect(state.writes).toEqual([])
  })
  it.each(["in_progress", "complete", "invoiced", "cancelled"])("preserves %s job status", async (status) => {
    expect(await syncLinkedQuoteToJob({ ...job, status })).toMatchObject({ ok: true, changedToJob: false })
    expect(fetch).not.toHaveBeenCalled()
    expect(state.writes).toEqual([])
  })
  it("preserves existing ID and legacy number-only mappings", async () => {
    await syncLinkedQuoteToJob({ ...job, xero_invoice_id: "existing" } as Parameters<typeof syncLinkedQuoteToJob>[0])
    await syncLinkedQuoteToJob({ ...job, xero_invoice_number: "INV-123" })
    expect(fetch).not.toHaveBeenCalled()
    expect(state.writes).toEqual([])
  })
  it.each([["SENT", "quoted"], ["ACCEPTED", "approved"], ["INVOICED", "approved"]])("preserves %s status sync when no invoice matches", async (status, rpmStatus) => {
    mockXero([{ ...quote, Status: status }], [[]])
    expect(await syncLinkedQuoteToJob({ ...job })).toMatchObject({ ok: true, warning: expect.stringContaining("No matching"), changedToJob: false })
    expect(state.writes[0]).toMatchObject({ status: rpmStatus })
    expect(state.writes[0]).not.toHaveProperty("xero_invoice_id")
  })
  it("fails closed when another quote lookup fails", async () => {
    state.jobs.push({ ...job, id: "job-2", xero_quote_id: "missing" })
    expect(await syncLinkedQuoteToJob({ ...job })).toMatchObject({ ok: false })
    expect(state.writes).toEqual([])
  })
  it("propagates Xero and database errors without claiming success", async () => {
    state.dbError = true
    expect(await syncLinkedQuoteToJob({ ...job })).toMatchObject({ ok: false })
    state.dbError = false
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, text: async () => '{"Message":"Rate limited"}' })))
    expect(await syncLinkedQuoteToJob({ ...job })).toMatchObject({ ok: false, error: "Rate limited" })
    expect(state.writes).toEqual([])
  })
})

describe("Xero date parsing", () => {
  it("accepts ISO and Xero /Date()/ dates without writing malformed dates", () => {
    expect(xeroDate("2026-11-20T00:00:00")).toBe("2026-11-20")
    expect(xeroDate(`/Date(${Date.UTC(2026, 10, 20)}+0000)/`)).toBe("2026-11-20")
    expect(xeroDate("invalid")).toBeNull()
    expect(xeroDate(null)).toBeNull()
  })
})
