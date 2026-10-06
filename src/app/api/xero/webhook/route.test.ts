import { createHmac } from "crypto"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
type Pending = { tenant_id: string; cache_key: string; payload: { resourceId: string; queueToken?: string }; expires_at: string }
const state = vi.hoisted(() => ({ pending: new Map<string, Pending>(), callbacks: [] as (() => Promise<void>)[], blocked: false, failQueue: false, newer: false }))
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: (callback: () => Promise<void>) => { state.callbacks.push(callback) } }))
vi.mock("@/lib/xero", () => ({
    XERO_API: "https://xero.test", xeroHeaders: () => ({}), getValidXero: async () => ({ accessToken: "secret", tenantId: "tenant" }),
    xeroAdmin: () => ({ from: () => {
        let deleting = false
        const filters: ((row: Pending) => boolean)[] = []
        const query = { select: () => query, delete: () => { deleting = true; return query },
            eq: (key: keyof Pending | "payload->>queueToken", value: string) => { filters.push((row) => key === "payload->>queueToken" ? row.payload.queueToken === value : row[key] === value); return query },
            like: () => query, order: () => query,
            limit: async () => ({ data: structuredClone([...state.pending.values()].filter((row) => filters.every((filter) => filter(row)))), error: null }),
            upsert: async (rows: Pending[]) => { if (state.failQueue) return { error: new Error("offline") }; for (const row of rows) state.pending.set(row.cache_key, row); return { error: null } },
            then: (resolve: (value: unknown) => void) => { if (deleting) for (const [key, row] of state.pending) if (filters.every((filter) => filter(row))) state.pending.delete(key); resolve({ error: null }) },
        }
        return query
    } }),
}))
vi.mock("@/lib/xero-requests", async () => {
    const { XeroRateLimitError } = await import("@/lib/xero-rate-limit")
    return { xeroFetch: async (url: string, init: RequestInit) => { if (state.blocked) throw new XeroRateLimitError(60); return fetch(url, init) } }
})
vi.mock("@/lib/xero-job-sync", () => ({ syncOpenQuotesForInvoices: async () => {
    if (state.newer) for (const row of state.pending.values()) row.payload.queueToken = "newer-event"
    return []
} }))
import { POST } from "./route"
function request(events = [{ tenantId: "tenant", resourceId: "invoice-one", eventCategory: "INVOICE" }], valid = true) {
    const body = JSON.stringify({ events })
    return new NextRequest("http://localhost/api/xero/webhook", { method: "POST", body,
        headers: { "x-xero-signature": valid ? createHmac("sha256", "test-key").update(body).digest("base64") : "invalid" },
    })
}
beforeEach(() => {
    state.pending.clear(); state.callbacks = []; state.blocked = false; state.failQueue = false; state.newer = false
    vi.stubEnv("XERO_WEBHOOK_KEY", "test-key")
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Invoices: [{ InvoiceID: "invoice-one", Type: "ACCREC" }] }))))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe("durable Xero invoice notifications", () => {
    it("rejects unsigned events before queueing or fetching", async () => {
        expect((await POST(request(undefined, false))).status).toBe(401)
        expect(state.pending.size).toBe(0)
        expect(fetch).not.toHaveBeenCalled()
    })
    it("queues before acknowledging, deduplicates events and clears successful work", async () => {
        const event = { tenantId: "tenant", resourceId: "invoice-one", eventCategory: "INVOICE" }
        expect((await POST(request([event, event, { ...event, tenantId: "other" }]))).status).toBe(200)
        expect(state.pending.size).toBe(1)
        expect(fetch).not.toHaveBeenCalled()
        await state.callbacks[0]()
        expect(fetch).toHaveBeenCalledTimes(1)
        expect(state.pending.size).toBe(0)
    })
    it("retains paused work and retries it on the next notification", async () => {
        state.blocked = true
        await POST(request())
        await state.callbacks[0]()
        expect(fetch).not.toHaveBeenCalled()
        expect(state.pending.size).toBe(1)
        state.blocked = false
        await POST(request([{ tenantId: "tenant", resourceId: "invoice-two", eventCategory: "INVOICE" }]))
        await state.callbacks[1]()
        expect(fetch).toHaveBeenCalledTimes(2)
        expect(state.pending.size).toBe(0)
    })
    it("asks Xero to retry when durable queue storage fails", async () => {
        state.failQueue = true
        expect((await POST(request())).status).toBe(503)
        expect(state.callbacks).toHaveLength(0)
    })
    it("does not discard a newer notification when an older worker completes", async () => {
        state.newer = true
        await POST(request())
        await state.callbacks[0]()
        expect(state.pending.size).toBe(1)
    })
})
