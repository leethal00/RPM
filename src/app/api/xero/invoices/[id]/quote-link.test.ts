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

const mocks = vi.hoisted(() => ({
  signedIn: true, role: "rodier_admin", preview: vi.fn(), link: vi.fn(),
}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mocks.signedIn ? { id: "user" } : null } }) } }),
}))
vi.mock("@/lib/xero-job-sync", async (original) => ({
  ...await original<typeof import("@/lib/xero-job-sync")>(),
  previewQuoteInvoiceLink: mocks.preview, linkQuoteToInvoice: mocks.link,
}))
vi.mock("@/lib/xero", () => ({
  getValidXero: async () => ({ accessToken: "token", tenantId: "tenant" }),
  xeroAdmin: () => ({ from: (table: string) => {
    if (table === "users") return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: mocks.role } }) }) }) }
    if (table === "costing_jobs") return { select: () => ({ eq: () => ({ single: async () => ({ data: {
      id: "job", title: "KFC Speakerposts", status: "quoted", xero_quote_id: "quote", xero_quote_number: "QU-3509",
      xero_invoice_id: null, xero_invoice_number: null, clients: { name: "Searchfield" },
    } }) }) }) }
    if (table === "costing_items") return { select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }
    if (table === "costing_lines") return { select: () => ({ eq: async () => ({ data: [] }) }) }
    throw new Error(`Unexpected table ${table}`)
  } }),
}))
import { GET, POST } from "./route"
const invoice = { InvoiceID: "invoice", InvoiceNumber: "INV-7602", Status: "DRAFT", Type: "ACCREC", Contact: { Name: "Searchfield" }, Reference: "KFC Speakerposts PO#RH083221", DateString: "2026-11-30T00:00:00", DueDateString: "2026-12-20T00:00:00", CurrencyCode: "NZD", Total: 10184.69 }
const context = () => ({ params: Promise.resolve({ id: "job" }) })
const request = () => new NextRequest("http://localhost/api/xero/invoices/job", { method: "POST", body: JSON.stringify({ action: "link", invoiceNumber: "INV-7602", expectedInvoiceId: "invoice" }) })
beforeEach(() => {
  vi.clearAllMocks(); mocks.signedIn = true; mocks.role = "rodier_admin"
  mocks.preview.mockResolvedValue({ invoice }); mocks.link.mockResolvedValue({ invoice, changedToJob: true })
})

describe("quote invoice linking API", () => {
  it("returns the reference, total and dates for review without linking", async () => {
    const response = await GET(new NextRequest("http://localhost/api/xero/invoices/job?number=INV-7602"), context())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ invoice: { invoiceId: "invoice", reference: invoice.Reference, total: 10184.69, date: "2026-11-30", dueDate: "2026-12-20" }, proposedLines: [] })
    expect(mocks.link).not.toHaveBeenCalled()
  })
  it("passes the reviewed identity to the validated quote-link operation", async () => {
    const response = await POST(request(), context())
    expect(response.status).toBe(200)
    expect(mocks.link).toHaveBeenCalledWith(expect.objectContaining({ id: "job", xero_quote_id: "quote" }), "INV-7602", "invoice")
    expect(await response.json()).toMatchObject({ changedToJob: true, invoice: { invoiceNumber: "INV-7602" } })
  })
  it("returns validation failures without reporting a successful link", async () => {
    mocks.link.mockRejectedValueOnce(new Error("This invoice does not match the linked quote."))
    const response = await POST(request(), context())
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "This invoice does not match the linked quote." })
  })
  it("requires sign-in", async () => {
    mocks.signedIn = false
    expect((await POST(request(), context())).status).toBe(401)
    expect(mocks.link).not.toHaveBeenCalled()
  })
  it("requires staff administration permission", async () => {
    mocks.role = "installer"
    expect((await POST(request(), context())).status).toBe(403)
    expect(mocks.link).not.toHaveBeenCalled()
  })
})
