import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const state = vi.hoisted(() => ({
  existingInvoiceId: null as string | null,
  saved: null as Record<string, unknown> | null,
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
          id: "job-1", title: "New signs", reference: null, details: null, contact_name: null,
          is_template: false, status: "in_progress", xero_quote_id: null,
          xero_invoice_id: state.existingInvoiceId, xero_invoice_number: null,
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

import { POST } from "./route"

describe("RPM-first Xero invoice creation", () => {
  beforeEach(() => {
    state.existingInvoiceId = null
    state.saved = null
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => ({
      ok: true,
      text: async () => JSON.stringify(input.endsWith("/Contacts/" + contactId)
        ? { Contacts: [{ ContactID: contactId, Name: "Mcdonalds Hewletts Road" }] }
        : init?.method === "POST"
          ? { Invoices: [{ InvoiceID: "invoice-1", InvoiceNumber: "INV-9000", Type: "ACCREC", Status: "DRAFT" }] }
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
      LineItems: expect.arrayContaining([expect.objectContaining({ Description: expect.stringContaining("Graphics"), Quantity: 1, UnitAmount: 100 })]),
    })
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
