import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({ wait: 0, gateError: false, records: [] as Record<string, unknown>[], caches: new Map<string, { payload: unknown; expires_at: string }>() }))
vi.mock("./xero", () => ({ xeroAdmin: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === "xero_request_gate") return { data: state.wait, error: state.gateError ? { message: "offline" } : null }
        state.records.push(args); return { error: null }
    },
    from: () => {
        let tenant = "", key = ""
        const query = { select: () => query, eq: (column: string, value: string) => { if (column === "tenant_id") tenant = value; else key = value; return query },
            maybeSingle: async () => ({ data: state.caches.get(`${tenant}:${key}`), error: null }),
            upsert: async (row: { tenant_id: string; cache_key: string; payload: unknown; expires_at: string }) => { state.caches.set(`${row.tenant_id}:${row.cache_key}`, row); return { error: null } },
        }
        return query
    },
}) }))
import { cachedXeroJson, xeroFetch } from "./xero-requests"
beforeEach(() => { state.wait = 0; state.gateError = false; state.records = []; state.caches.clear(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { headers: { "X-DayLimit-Remaining": "120", "X-MinLimit-Remaining": "50" } }))) })
afterEach(() => vi.unstubAllGlobals())
describe("shared Xero request budget", () => {
    it("records the activity, allowance and endpoint without headers or customer data", async () => {
        await xeroFetch("https://xero.test/Quotes/4417050a-f9ab-48a1-9efa-c880e35a7343?Name=private", { headers: { Authorization: "private-token" } }, "tenant", "quote-check")
        expect(state.records).toEqual([expect.objectContaining({ p_resource: "/Quotes/:id", p_activity: "quote-check", p_day: 120, p_minute: 50, p_status: 200 })])
        expect(JSON.stringify(state.records)).not.toContain("private")
    })
    it("prevents outbound calls during shared cooldown or background reserve", async () => {
        state.wait = 123
        await expect(xeroFetch("https://xero.test/Invoices", {}, "tenant", "background")).rejects.toMatchObject({ retryAfter: 123 })
        expect(fetch).not.toHaveBeenCalled()
    })
    it("records and propagates the exact daily limit and Retry-After from Xero", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response("not JSON", { status: 429, headers: { "Retry-After": "43200", "X-Rate-Limit-Problem": "day", "X-DayLimit-Remaining": "0" } }))
        await expect(xeroFetch("https://xero.test/Invoices", {}, "tenant", "import")).rejects.toMatchObject({ retryAfter: 43200 })
        expect(state.records[0]).toMatchObject({ p_retry: 43200, p_problem: "day", p_day: 0, p_minute: null })
    })
    it("pauses background calls during a tracking outage while allowing staff requests", async () => {
        state.gateError = true
        await expect(xeroFetch("https://xero.test/Quotes", {}, "tenant", "background")).rejects.toThrow("paused")
        expect(fetch).not.toHaveBeenCalled()
        await xeroFetch("https://xero.test/Invoices", {}, "tenant", "import")
        expect(fetch).toHaveBeenCalledTimes(1)
    })
    it("records a failed network call and preserves the error", async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"))
        await expect(xeroFetch("https://xero.test/Invoices", {}, "tenant", "import")).rejects.toThrow("network down")
        expect(state.records[0]).toMatchObject({ p_status: 0, p_day: null })
    })
})
describe("shared tenant cache", () => {
    it("reuses fresh data, isolates tenants and refreshes expired entries", async () => {
        const load = vi.fn().mockResolvedValue([{ QuoteID: "one" }])
        await cachedXeroJson("one", "quotes:contact", load)
        await cachedXeroJson("one", "quotes:contact", load)
        expect(load).toHaveBeenCalledTimes(1)
        await cachedXeroJson("two", "quotes:contact", load)
        expect(load).toHaveBeenCalledTimes(2)
        state.caches.get("one:quotes:contact")!.expires_at = "2000-01-01"
        await cachedXeroJson("one", "quotes:contact", load)
        expect(load).toHaveBeenCalledTimes(3)
    })
    it("does not cache errors", async () => {
        await expect(cachedXeroJson("one", "quotes:contact", async () => { throw new Error("failed") })).rejects.toThrow("failed")
        expect(state.caches.size).toBe(0)
    })
})
