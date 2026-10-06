vi.mock("@/lib/xero-requests", async () => {
  const { XeroRateLimitError, xeroRetryAfter } = await import("@/lib/xero-rate-limit")
  return {
    xeroFetch: async (url: string, init: RequestInit) => {
      const response = await fetch(url, init)
      if (response.status === 429) throw new XeroRateLimitError(xeroRetryAfter(response.headers?.get("Retry-After") ?? null))
      return response
    },
    cachedXeroJson: async (_tenant: string, _key: string, load: () => Promise<unknown>) => load(),
  }
})
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const state = vi.hoisted(() => ({
  existingInvoiceId: null as string | null,
  existingInvoiceNumber: null as string | null,
  importedStatus: null as string | null,
  saved: null as Record<string, unknown> | null,
  productionDetails: "To manufacture and install the new site graphics package",
  productionContact: "Store manager",
  items: [{ id: "item-1", name: "Graphics", qty: 1, mode: "buy", unit_price: 100, sort: 0 }] as Array<Record<string, unknown>>,
  inserted: [] as Array<Record<string, unknown>>,
  invoiceStatus: "DRAFT",
  invoiceUpdatedAt: "2026-09-24T00:00:00Z",
  invoiceLines: [] as Array<Record<string, unknown>>,
}))
const contactId = "11111111-1111-4111-8111-111111111111"

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) } }),
}))

vi.mock("@/lib/xero", () => ({
  XERO_API: "https://xero.test",
  xeroHeaders: () => ({}),
  getValidXero: async () => ({ accessToken: "token", tenantId: "tenant" }),
  xeroAdmin: () => ({
    from: (table: string) => {
      if (table === "users") return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: "rodier_admin" } }) }) }) }
      if (table === "costing_jobs") return {
        select: () => {
          const query = {
            eq: () => query,
            neq: () => query,
            limit: async () => ({ data: [], error: null }),
            single: async () => ({ data: {
          id: "job-1", title: "Original quote title", production_title: "New site - Graphics package",
          details: "Original quote scope", production_details: state.productionDetails,
          contact_name: "Original quote contact", production_contact_name: state.productionContact,
          is_template: false, status: "in_progress", xero_quote_id: null,
          xero_invoice_id: state.existingInvoiceId, xero_invoice_number: state.existingInvoiceNumber, xero_invoice_import_status: state.importedStatus,
          clients: { name: "Mcdonalds" }, stores: { name: "Hewletts Road" },
            }, error: null }),
          }
          return query
        },
        update: (payload: Record<string, unknown>) => {
          state.saved = payload
          const query = {
            eq: () => query,
            is: () => query,
            select: () => query,
            maybeSingle: async () => ({ data: { id: "job-1" }, error: null }),
          }
          return query
        },
      }
      if (table === "costing_items") return {
        select: () => ({ eq: () => ({ order: async () => ({ data: state.items, error: null }) }) }),
        insert: (rows: Array<Record<string, unknown>>) => {
          state.inserted = rows
          return { select: async () => ({ data: rows.map((_, index) => ({ id: `imported-${index}` })), error: null }) }
        },
        delete: () => ({ in: async () => ({ error: null }) }),
      }
      if (table === "costing_lines") return { select: () => ({ eq: async () => ({ data: [], error: null }) }) }
      throw new Error(`Unexpected table ${table}`)
    },
  }),
}))

import { GET, POST } from "./route"

describe("RPM-first Xero invoice creation", () => {
  beforeEach(() => {
    state.existingInvoiceId = null
    state.existingInvoiceNumber = null
    state.importedStatus = null
    state.saved = null
    state.productionDetails = "To manufacture and install the new site graphics package"
    state.productionContact = "Store manager"
    state.items = [{ id: "item-1", name: "Graphics", qty: 1, mode: "buy", unit_price: 100, sort: 0 }]
    state.inserted = []
    state.invoiceStatus = "DRAFT"
    state.invoiceUpdatedAt = "2026-09-24T00:00:00Z"
    state.invoiceLines = []
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => ({
      ok: true,
      text: async () => JSON.stringify(input.endsWith("/Contacts/" + contactId)
        ? { Contacts: [{ ContactID: contactId, Name: "Mcdonalds Hewletts Road" }] }
        : init?.method === "POST"
          ? { Invoices: [{ InvoiceID: "invoice-1", InvoiceNumber: "INV-9000", Type: "ACCREC", Status: "DRAFT" }] }
          : state.existingInvoiceId || state.existingInvoiceNumber
            ? { Invoices: [{ InvoiceID: "invoice-1", InvoiceNumber: "INV-9000", Type: "ACCREC", Status: state.invoiceStatus, UpdatedDateUTC: state.invoiceUpdatedAt, LineItems: state.invoiceLines }] }
            : { Invoices: [] }),
    })))
  })

  it("creates one draft with RPM item lines and saves its Xero identity", async () => {
    const request = new NextRequest("http://localhost/api/xero/invoices/job-1", {
      method: "POST", body: JSON.stringify({ action: "create", contactId }),
    })
    const response = await POST(request, { params: Promise.resolve({ id: "job-1" }) })
    expect(response.status).toBe(200)
    expect(state.saved).toMatchObject({ xero_invoice_id: "invoice-1", xero_invoice_number: "INV-9000", job_number: "INV-9000" })
    const call = vi.mocked(fetch).mock.calls.find(([url, init]) => url === "https://xero.test/Invoices" && init?.method === "POST")
    expect(call).toBeDefined()
    expect((call?.[1]?.headers as Record<string, string>)["Idempotency-Key"]).toBe("rpm-job-invoice-job-1")
    expect(JSON.parse(String(call?.[1]?.body)).Invoices[0]).toMatchObject({
      Type: "ACCREC", Status: "DRAFT", Contact: { ContactID: contactId },
      Reference: "New site - Graphics package",
      LineItems: expect.arrayContaining([expect.objectContaining({ Description: expect.stringContaining("Graphics"), Quantity: 1, UnitAmount: 100 })]),
    })
    const invoice = JSON.parse(String(call?.[1]?.body)).Invoices[0]
    expect(invoice.LineItems[0].Description).toBe("Mcdonalds Hewletts Road\nTo manufacture and install the new site graphics package\nContact: Store manager")
    expect(invoice.LineItems[0].Description).not.toContain(invoice.Reference)
  })

  it("does not repeat the title in the first line when the job scope is empty", async () => {
    state.productionDetails = ""
    const request = new NextRequest("http://localhost/api/xero/invoices/job-1", {
      method: "POST", body: JSON.stringify({ action: "create", contactId }),
    })
    const response = await POST(request, { params: Promise.resolve({ id: "job-1" }) })
    expect(response.status).toBe(200)
    const call = vi.mocked(fetch).mock.calls.find(([url, init]) => url === "https://xero.test/Invoices" && init?.method === "POST")
    const invoice = JSON.parse(String(call?.[1]?.body)).Invoices[0]
    expect(invoice.Reference).toBe("New site - Graphics package")
    expect(invoice.LineItems[0].Description).toBe("Mcdonalds Hewletts Road\nContact: Store manager")
  })

  it("previews the production scope for a linked invoice", async () => {
    state.existingInvoiceId = "invoice-1"
    state.existingInvoiceNumber = "INV-9000"
    const request = new NextRequest("http://localhost/api/xero/invoices/job-1")
    const response = await GET(request, { params: Promise.resolve({ id: "job-1" }) })
    expect(response.status).toBe(200)
    const preview = await response.json()
    expect(preview.invoice.invoiceNumber).toBe("INV-9000")
    expect(preview.proposedLines[0].Description).toBe("Mcdonalds Hewletts Road\nTo manufacture and install the new site graphics package\nContact: Store manager")
    expect(preview.proposedLines[0].Description).not.toContain("New site - Graphics package")
  })

  it("updates the reference and scope while retaining the linked invoice identity", async () => {
    state.existingInvoiceId = "invoice-1"
    state.existingInvoiceNumber = "INV-9000"
    const request = new NextRequest("http://localhost/api/xero/invoices/job-1", {
      method: "POST", body: JSON.stringify({ action: "push", expectedUpdatedAt: "2026-09-24T00:00:00Z" }),
    })
    const response = await POST(request, { params: Promise.resolve({ id: "job-1" }) })
    expect(response.status).toBe(200)
    const call = vi.mocked(fetch).mock.calls.find(([url, init]) => url === "https://xero.test/Invoices" && init?.method === "POST")
    const update = JSON.parse(String(call?.[1]?.body)).Invoices[0]
    expect(update).toEqual({
      InvoiceID: "invoice-1",
      Reference: "New site - Graphics package",
      LineItems: expect.arrayContaining([
        { Description: "Mcdonalds Hewletts Road\nTo manufacture and install the new site graphics package\nContact: Store manager" },
      ]),
    })
    expect(update).not.toHaveProperty("InvoiceNumber")
    expect(update).not.toHaveProperty("Contact")
  })

  it("does not create another invoice for a linked job", async () => {
    state.existingInvoiceId = "invoice-1"
    const request = new NextRequest("http://localhost/api/xero/invoices/job-1", {
      method: "POST", body: JSON.stringify({ action: "create", contactId }),
    })
    const response = await POST(request, { params: Promise.resolve({ id: "job-1" }) })
    expect(response.status).toBe(409)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it("never pushes sales changes for an imported approved invoice", async () => {
    state.existingInvoiceId = "invoice-1"
    state.existingInvoiceNumber = "INV-9000"
    state.importedStatus = "AUTHORISED"
    const response = await POST(new NextRequest("http://localhost/api/xero/invoices/job-1", {
      method: "POST", body: JSON.stringify({ action: "push", expectedUpdatedAt: "2026-09-24T00:00:00Z" }),
    }), { params: Promise.resolve({ id: "job-1" }) })
    expect(response.status).toBe(409)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it("imports reviewed linked invoice lines into an empty RPM job", async () => {
    state.existingInvoiceId = null
    state.existingInvoiceNumber = "INV-9000"
    state.items = []
    state.invoiceStatus = "AUTHORISED"
    state.invoiceLines = [
      { LineItemID: "line-1", Description: "Survey:\nInspect the existing pylon", Quantity: 1, UnitAmount: 280, LineAmount: 280 },
      { Description: "INSTALLATION", Quantity: null, UnitAmount: null, LineAmount: null },
    ]
    const context = { params: Promise.resolve({ id: "job-1" }) }
    const previewResponse = await GET(new NextRequest("http://localhost/api/xero/invoices/job-1?importLines=1"), context)
    expect(previewResponse.status).toBe(200)
    const preview = await previewResponse.json()
    expect(preview.rpmItemCount).toBe(0)
    expect(preview.invoice.lines).toHaveLength(2)

    const response = await POST(new NextRequest("http://localhost/api/xero/invoices/job-1", {
      method: "POST", body: JSON.stringify({ action: "import-lines", expectedInvoiceId: preview.invoice.invoiceId, expectedUpdatedAt: preview.invoice.updatedAt }),
    }), context)
    expect(response.status).toBe(200)
    expect((await response.json()).imported).toBe(2)
    expect(state.inserted).toMatchObject([
      { job_id: "job-1", name: "Survey", details: "Inspect the existing pylon", qty: 1, unit_price: 280, xero_imported_line: true, xero_line_item_id: "line-1", sort: 0 },
      { job_id: "job-1", name: "INSTALLATION", qty: 1, unit_price: 0, xero_imported_line: true, sort: 1 },
    ])
    expect(state.saved).toEqual({ xero_invoice_id: "invoice-1", xero_invoice_import_status: "AUTHORISED" })
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true)
  })

  it("does not import over existing RPM items or a changed Xero invoice", async () => {
    state.existingInvoiceId = "invoice-1"
    state.existingInvoiceNumber = "INV-9000"
    state.invoiceLines = [{ Description: "Survey", Quantity: 1, UnitAmount: 280 }]
    const context = { params: Promise.resolve({ id: "job-1" }) }
    const request = () => new NextRequest("http://localhost/api/xero/invoices/job-1", {
      method: "POST", body: JSON.stringify({ action: "import-lines", expectedInvoiceId: "invoice-1", expectedUpdatedAt: "2026-09-24T00:00:00Z" }),
    })
    expect((await POST(request(), context)).status).toBe(409)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()

    state.items = []
    state.invoiceUpdatedAt = "2026-09-24T01:00:00Z"
    expect((await POST(request(), context)).status).toBe(409)
    expect(state.inserted).toEqual([])
  })
})

