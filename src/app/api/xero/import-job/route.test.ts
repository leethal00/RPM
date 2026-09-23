import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const state = vi.hoisted(() => ({ inserted: null as Record<string, unknown> | null }))

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
                    state.inserted = payload
                    return { select: () => ({ single: async () => ({ data: { id: "job-1" }, error: null }) }) }
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

import { POST } from "./route"

describe("Xero invoice import", () => {
    beforeEach(() => {
        state.inserted = null
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            text: async () => JSON.stringify({ Invoices: [{
                InvoiceID: "xero-invoice-1", InvoiceNumber: "INV-7566", Type: "ACCREC", Status: "DRAFT", LineItems: [],
            }] }),
        })))
    })

    it("links the selected site and the existing Xero InvoiceID without changing Xero", async () => {
        const request = new NextRequest("http://localhost/api/xero/import-job", {
            method: "POST",
            body: JSON.stringify({ invoiceNumber: "INV-7566", invoiceId: "xero-invoice-1", clientId: "client-1", storeId: "site-1" }),
        })
        const response = await POST(request)

        expect(response.status).toBe(200)
        expect(state.inserted).toMatchObject({
            job_number: "INV-7566",
            xero_invoice_id: "xero-invoice-1",
            xero_invoice_number: "INV-7566",
            client_id: "client-1",
            store_id: "site-1",
        })
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
        expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBeUndefined()
    })
})
