import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const state = vi.hoisted(() => ({
    status: "AUTHORISED",
    job: null as Record<string, unknown> | null,
    lines: [] as Record<string, unknown>[],
    importStatus: null as string | null,
    customers: [] as Array<{ id: string; name: string }>,
    createdCustomer: null as Record<string, unknown> | null,
    detailLines: true,
}))

vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) } }),
}))

vi.mock("@/lib/xero", () => ({
    XERO_API: "https://xero.test",
    xeroHeaders: () => ({}),
    getValidXero: async () => ({ accessToken: "token", tenantId: "tenant" }),
    xeroAdmin: () => ({
        from: (table: string) => {
            if (table === "costing_jobs") return {
                select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
                insert: (payload: Record<string, unknown>) => {
                    state.job = payload
                    return { select: () => ({ single: async () => ({ data: { id: "job-1" }, error: null }) }) }
                },
                update: (payload: { xero_invoice_import_status: string }) => ({
                    eq: async () => { state.importStatus = payload.xero_invoice_import_status; return { error: null } },
                }),
            }
            if (table === "costing_items") return {
                insert: async (payload: Record<string, unknown>[]) => { state.lines = payload; return { error: null } },
            }
            if (table === "clients") return {
                select: async () => ({ data: state.customers, error: null }),
                insert: (payload: Record<string, unknown>) => {
                    state.createdCustomer = payload
                    return { select: () => ({ single: async () => ({ data: { id: "new-client-1" }, error: null }) }) }
                },
            }
            if (table === "stores") return {
                select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "site-1", client_id: "client-1" }, error: null }) }) }),
            }
            if (table === "users") return {
                select: () => ({ eq: () => ({ single: async () => ({ data: { role: "rodier_admin" } }) }) }),
            }
            throw new Error(`Unexpected table ${table}`)
        },
    }),
}))

import { GET, POST } from "./route"

const invoiceNumber = "INV-7564"
const url = `http://localhost/api/xero/import-job?invoice=${invoiceNumber}`

describe("Xero invoice import", () => {
    beforeEach(() => {
        state.status = "AUTHORISED"
        state.job = null
        state.lines = []
        state.importStatus = null
        state.customers = []
        state.createdCustomer = null
        state.detailLines = true
        vi.stubGlobal("fetch", vi.fn(async (input: string) => ({
            ok: true,
            text: async () => JSON.stringify({ Invoices: [{
                InvoiceID: "xero-invoice-1", InvoiceNumber: invoiceNumber, Type: "ACCREC", Status: state.status,
                Reference: "Gateway signs", DateString: "2026-09-21T00:00:00", Total: 1115.5, Contact: { Name: "Brave Design", ContactID: "contact-1" },
                ...(input.includes("/Invoices/xero-invoice-1") && state.detailLines ? { LineItems: [
                    { LineItemID: "line-1", Description: "Gateway Plinth Signs\nFabricated steel", Quantity: 2, UnitAmount: 485, LineAmount: 970 },
                    { LineItemID: "line-2", Description: "Discounted fitting", Quantity: 1, UnitAmount: 150, LineAmount: 145.5 },
                ] } : {}),
            }] }),
        })))
    })

    it("previews an approved invoice and its original sales lines", async () => {
        const response = await GET(new NextRequest(url))
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.invoice).toMatchObject({ invoiceNumber, status: "AUTHORISED", date: "2026-09-21T00:00:00", total: 1115.5 })
        expect(body.invoice.lines).toHaveLength(2)
        expect(body.invoice.lines[1].lineAmount).toBe(145.5)
        expect(body.invoice.contactName).toBe("Brave Design")
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
        expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain("/Invoices/xero-invoice-1?unitdp=4")
    })

    it("imports approved lines for BOMs and never writes to Xero", async () => {
        const request = new NextRequest(url, {
            method: "POST",
            body: JSON.stringify({ invoiceNumber, invoiceId: "xero-invoice-1", clientId: "client-1", storeId: "site-1" }),
        })
        const response = await POST(request)

        expect(response.status).toBe(200)
        expect(state.job).toMatchObject({
            job_number: invoiceNumber,
            xero_invoice_id: "xero-invoice-1",
            xero_invoice_number: invoiceNumber,
            client_id: "client-1",
            store_id: "site-1",
            completion_date: "2026-09-21",
        })
        expect(state.lines).toMatchObject([
            { job_id: "job-1", name: "Gateway Plinth Signs", details: "Fabricated steel", qty: 2, unit_price: 485, xero_imported_line: true, xero_line_item_id: "line-1", xero_line_amount: 970 },
            { job_id: "job-1", name: "Discounted fitting", qty: 1, unit_price: 150, xero_imported_line: true, xero_line_amount: 145.5 },
        ])
        expect(state.importStatus).toBe("AUTHORISED")
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
        expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBeUndefined()
        expect(vi.mocked(fetch).mock.calls[1][1]?.method).toBeUndefined()
    })

    it("keeps a completion date chosen in RPM", async () => {
        const response = await POST(new NextRequest(url, {
            method: "POST",
            body: JSON.stringify({ invoiceNumber, completionDate: "2026-10-02" }),
        }))
        expect(response.status).toBe(200)
        expect(state.job?.completion_date).toBe("2026-10-02")
    })

    it("retains the existing draft import path", async () => {
        state.status = "DRAFT"
        const response = await POST(new NextRequest(url, { method: "POST", body: JSON.stringify({ invoiceNumber }) }))
        expect(response.status).toBe(200)
        expect(state.importStatus).toBe("DRAFT")
    })

    it("rejects a submitted invoice", async () => {
        state.status = "SUBMITTED"
        const response = await POST(new NextRequest(url, { method: "POST", body: JSON.stringify({ invoiceNumber }) }))
        expect(response.status).toBe(400)
        expect(state.job).toBeNull()
    })

    it("links an existing RPM customer matching the Xero contact", async () => {
        state.customers = [{ id: "existing-client-1", name: "brave design" }]
        const response = await POST(new NextRequest(url, { method: "POST", body: JSON.stringify({ invoiceNumber }) }))
        expect(response.status).toBe(200)
        expect(state.job?.client_id).toBe("existing-client-1")
        expect(state.createdCustomer).toBeNull()
    })

    it("creates the Xero customer in RPM when no match exists", async () => {
        const response = await POST(new NextRequest(url, { method: "POST", body: JSON.stringify({ invoiceNumber }) }))
        expect(response.status).toBe(200)
        expect(state.createdCustomer).toMatchObject({ name: "Brave Design", active: true })
        expect(state.job?.client_id).toBe("new-client-1")
    })

    it("blocks an invoice whose detail response has no lines", async () => {
        state.detailLines = false
        const response = await POST(new NextRequest(url, { method: "POST", body: JSON.stringify({ invoiceNumber }) }))
        expect(response.status).toBe(409)
        expect(state.job).toBeNull()
    })
})

