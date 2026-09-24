import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const state = vi.hoisted(() => ({
  existingInvoiceId: null as string | null,
  existingInvoiceNumber: null as string | null,
  saved: null as Record<string, unknown> | null,
  productionDetails: "To manufacture and install the new site graphics package",
  productionContact: "Store manager",
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
        select: () => ({ eq: () => ({ single: async () => ({ data: {
          id: "job-1", title: "Original quote title", production_title: "New site - Graphics package",
          details: "Original quote scope", production_details: state.productionDetails,
          contact_name: "Original quote contact", production_contact_name: state.productionContact,
          is_template: false, status: "in_progress", xero_quote_id: null,
          xero_invoice_id: state.existingInvoiceId, xero_invoice_number: state.existingInvoiceNumber,
          clients: { name: "Mcdonalds" }, stores: { name: "Hewletts Road" },
        }, error: null }) }) }),
        update: (payload: Record<string, unknown>) => {
          state.saved = payload
          return { eq: () => ({ is: () => ({ is: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: "job-1" }, error: null }) }) }) }) }) }
        },
      }
      if (table === "costing_items") return { select: () => ({ eq: () => ({ order: async () => ({ data: [{ id: "item-1", name: "Graphics", qty: 1, mode: "buy", unit_price: 100, sort: 0 }], error: null }) }) }) }
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
    state.saved = null
    state.productionDetails = "To manufacture and install the new site graphics package"
    state.productionContact = "Store manager"
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => ({
      ok: true,
      text: async () => JSON.stringify(input.endsWith("/Contacts/" + contactId)
        ? { Contacts: [{ ContactID: contactId, Name: "Mcdonalds Hewletts Road" }] }
        : init?.method === "POST"
          ? { Invoices: [{ InvoiceID: "invoice-1", InvoiceNumber: "INV-9000", Type: "ACCREC", Status: "DRAFT" }] }
          : state.existingInvoiceId
            ? { Invoices: [{ InvoiceID: "invoice-1", InvoiceNumber: "INV-9000", Type: "ACCREC", Status: "DRAFT", UpdatedDateUTC: "2026-09-24T00:00:00Z" }] }
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
})

