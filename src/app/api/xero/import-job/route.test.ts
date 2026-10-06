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
    status: "AUTHORISED",
    job: null as Record<string, unknown> | null,
    lines: [] as Record<string, unknown>[],
    importStatus: null as string | null,
    customers: [] as Array<{ id: string; name: string }>,
    createdCustomer: null as Record<string, unknown> | null,
    detailLines: true,
    site: { id: "site-1", client_id: "client-1" } as { id: string; client_id: string } | null,
    sites: null as Array<{ id: string; client_id: string }> | null,
    linkedSites: [] as Array<{ job_id: string; store_id: string; sort: number }>,
    linksError: false,
    deletedJob: false,
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
                select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }), in: async () => ({ data: [], error: null }) }),
                insert: (payload: Record<string, unknown>) => {
                    state.job = payload
                    return { select: () => ({ single: async () => ({ data: { id: "job-1" }, error: null }) }) }
                },
                update: (payload: { xero_invoice_import_status: string }) => ({
                    eq: async () => { state.importStatus = payload.xero_invoice_import_status; return { error: null } },
                }),
                delete: () => ({ eq: async () => { state.deletedJob = true; return { error: null } } }),
            }
            if (table === "costing_job_sites") return {
                insert: async (rows: typeof state.linkedSites) => {
                    state.linkedSites = rows
                    return { error: state.linksError ? new Error("Could not save sites") : null }
                },
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
                select: () => ({ eq: (_column: string, id: string) => ({ maybeSingle: async () => ({ data: state.sites ? state.sites.find((site) => site.id === id) || null : state.site, error: null }) }) }),
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
        state.site = { id: "site-1", client_id: "client-1" }
        state.sites = null
        state.linkedSites = []
        state.linksError = false
        state.deletedJob = false
        vi.stubGlobal("fetch", vi.fn(async (input: string) => ({
            ok: true,
            text: async () => JSON.stringify({ Invoices: [{
                InvoiceID: "xero-invoice-1", InvoiceNumber: invoiceNumber, Type: "ACCREC", Status: state.status,
                Reference: "Gateway signs", DateString: "2026-09-21T00:00:00", Total: 1115.5, Contact: { Name: "Brave Design", ContactID: "contact-1" },
                ...(input.includes("/Invoices?") && state.detailLines ? { LineItems: [
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
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
        expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("InvoiceNumbers=INV-7564&page=1&pageSize=100&unitdp=4")
    })

    it("fetches a batch in one call, restores requested order and reports missing invoices", async () => {
        const line = { Description: "Sign", Quantity: 1, UnitAmount: 10 }
        vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ Invoices: [
            { InvoiceID: "two", InvoiceNumber: "INV-2", Type: "ACCREC", Status: "DRAFT", LineItems: [line] },
            { InvoiceID: "one", InvoiceNumber: "INV-1", Type: "ACCREC", Status: "PAID", LineItems: [line] },
        ] })))
        const response = await GET(new NextRequest("http://localhost/api/xero/import-job?invoice=INV-1,INV-2,INV-3,INV-1"))
        const body = await response.json()
        expect(body.invoices.map((invoice: { invoiceNumber: string }) => invoice.invoiceNumber)).toEqual(["INV-1", "INV-2"])
        expect(body.warnings).toEqual(["INV-3 was not found in Xero."])
        expect(fetch).toHaveBeenCalledTimes(1)
        expect(state.job).toBeNull()
    })

    it("rejects oversized batches before contacting Xero", async () => {
        const response = await GET(new NextRequest(`http://localhost/api/xero/import-job?invoice=${Array.from({ length: 41 }, (_, index) => `INV-${index}`).join(",")}`))
        expect(response.status).toBe(400)
        expect(fetch).not.toHaveBeenCalled()
    })

    it("rejects a changed invoice identity before creating any job", async () => {
        const response = await POST(new NextRequest(url, { method: "POST", body: JSON.stringify({ invoiceNumber, invoiceId: "stale-id" }) }))
        expect(response.status).toBe(409)
        expect(state.job).toBeNull()
    })

    it.each(["GET", "POST"])("returns Xero's wait time for a throttled %s without creating a job", async (method) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Too many requests", { status: 429, headers: { "Retry-After": "120" } })))
        const response = method === "GET" ? await GET(new NextRequest(url)) : await POST(new NextRequest(url, {
            method: "POST", body: JSON.stringify({ invoiceNumber, clientId: "client-1", storeIds: ["site-1"] }),
        }))
        expect(response.status).toBe(429)
        expect(response.headers.get("Retry-After")).toBe("120")
        expect(await response.json()).toMatchObject({ retryAfter: 120, error: expect.stringContaining("Xero is temporarily limiting requests") })
        expect(fetch).toHaveBeenCalledTimes(1)
        expect(state.job).toBeNull()
        expect(state.createdCustomer).toBeNull()
        expect(state.lines).toEqual([])
    })

    it("handles an empty throttled invoice detail response with a fallback wait", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 429 }))
        const response = await GET(new NextRequest(url))
        expect(response.status).toBe(429)
        expect(response.headers.get("Retry-After")).toBe("60")
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
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
        expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBeUndefined()
    })

    it("keeps a completion date chosen in RPM", async () => {
        const response = await POST(new NextRequest(url, {
            method: "POST",
            body: JSON.stringify({ invoiceNumber, completionDate: "2026-10-02" }),
        }))
        expect(response.status).toBe(200)
        expect(state.job?.completion_date).toBe("2026-10-02")
    })

    it.each(["DRAFT", "AUTHORISED", "PAID"])("saves every site once, preserves selection order and one invoice job for %s", async (status) => {
        state.status = status
        state.sites = [{ id: "timaru", client_id: "mcd" }, { id: "dunedin", client_id: "mcd" }]
        const response = await POST(new NextRequest(url, { method: "POST", body: JSON.stringify({
            invoiceNumber, clientId: "coates", storeIds: ["timaru", "dunedin", "timaru"], showAllSites: true, visibleToClient: true,
        }) }))
        expect(response.status).toBe(200)
        expect(state.job).toMatchObject({ client_id: "coates", store_id: "timaru", visible_to_client: true })
        expect(state.linkedSites).toEqual([
            { job_id: "job-1", store_id: "timaru", sort: 0 }, { job_id: "job-1", store_id: "dunedin", sort: 1 },
        ])
        expect(state.lines.every((line) => line.job_id === "job-1")).toBe(true)
    })

    it("rejects the entire import if any additional site is missing", async () => {
        state.sites = [{ id: "site-1", client_id: "client-1" }]
        const response = await POST(new NextRequest(url, { method: "POST", body: JSON.stringify({ invoiceNumber, clientId: "client-1", storeIds: ["site-1", "missing"] }) }))
        expect(response.status).toBe(400)
        expect(state.job).toBeNull()
        expect(state.linkedSites).toEqual([])
    })

    it("removes the new job if saving its site associations fails", async () => {
        state.linksError = true
        const response = await POST(new NextRequest(url, { method: "POST", body: JSON.stringify({ invoiceNumber, clientId: "client-1", storeIds: ["site-1", "site-2"] }) }))
        expect(response.status).toBe(500)
        expect(state.deletedJob).toBe(true)
        expect(state.lines).toEqual([])
    })

    it("keeps an unlinked job internal by default", async () => {
        const response = await POST(new NextRequest(url, { method: "POST", body: JSON.stringify({ invoiceNumber, storeIds: [] }) }))
        expect(response.status).toBe(200)
        expect(state.job).toMatchObject({ store_id: null, visible_to_client: false })
        expect(state.linkedSites).toEqual([])
    })

    it.each(["DRAFT", "AUTHORISED", "PAID"])("preserves a cross-client site and job customer for %s invoices", async (status) => {
        state.status = status
        state.site = { id: "mcd-site", client_id: "mcd-client" }
        const response = await POST(new NextRequest(url, {
            method: "POST",
            body: JSON.stringify({ invoiceNumber, clientId: "coates-client", storeId: "mcd-site", showAllSites: true }),
        }))
        expect(response.status).toBe(200)
        expect(state.job).toMatchObject({ client_id: "coates-client", store_id: "mcd-site" })
    })

    it("keeps the client restriction unless the override is explicitly enabled", async () => {
        const response = await POST(new NextRequest(url, {
            method: "POST",
            body: JSON.stringify({ invoiceNumber, clientId: "other-client", storeId: "site-1" }),
        }))
        expect(response.status).toBe(400)
        expect(state.job).toBeNull()
    })

    it("resolves the Xero customer independently of an overridden site", async () => {
        state.customers = [{ id: "existing-client-1", name: "Brave Design" }]
        const response = await POST(new NextRequest(url, {
            method: "POST", body: JSON.stringify({ invoiceNumber, storeId: "site-1", showAllSites: true }),
        }))
        expect(response.status).toBe(200)
        expect(state.job).toMatchObject({ client_id: "existing-client-1", store_id: "site-1" })
    })

    it("rejects a missing site even with the override", async () => {
        state.site = null
        const response = await POST(new NextRequest(url, {
            method: "POST", body: JSON.stringify({ invoiceNumber, clientId: "client-1", storeId: "deleted-site", showAllSites: true }),
        }))
        expect(response.status).toBe(400)
        expect(state.job).toBeNull()
        expect(state.createdCustomer).toBeNull()
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
