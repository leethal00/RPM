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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const state = vi.hoisted(() => ({
    quoteId: null as string | null,
    details: null as string | null,
    contact: null as string | null,
    store: null as { name: string } | null,
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
                select: () => ({ eq: () => ({ single: async () => ({ data: {
                    id: "job-1", title: " University of Otago - Plinth ",
                    reference: "2500mm high plinth sign", details: state.details,
                    contact_name: state.contact, xero_quote_id: state.quoteId,
                    clients: { name: "Brand Partners" }, stores: state.store,
                }, error: null }) }) }),
                update: () => ({ eq: async () => ({ error: null }) }),
            }
            if (table === "costing_items") return { select: () => ({ eq: () => ({ order: async () => ({ data: [
                { id: "heading", name: "Signage", sign_code: "__RPM_SECTION_HEADING__" },
                { id: "build", name: "Plinth", mode: "build", qty: 1, build_qty: 2, unit_price: 0,
                    size: "800x2500mm", details: "Plinth: Fabricated sign", delivery: "Deliver to site" },
                { id: "buy", name: "Travel", mode: "buy", qty: 3, unit_price: 15 },
                { id: "note", name: "Installation excluded", sign_code: "__RPM_NOTE__" },
            ], error: null }) }) }) }
            if (table === "costing_lines") return { select: () => ({ eq: async () => ({ data: [
                { item_id: "build", qty: 2, unit_cost: 100, markup: 0.5, unit_sell_override: null },
                { item_id: "build", qty: 1, unit_cost: 10, markup: 0, unit_sell_override: 25 },
            ], error: null }) }) }
            throw new Error(`Unexpected table ${table}`)
        },
    }),
}))

import { POST as send } from "./[id]/send/route"
import { POST as update } from "./[id]/update/route"

const title = "University of Otago - Plinth"
const details = "To design and manufacture a 2500mm high plinth sign."

describe.each([
    { name: "new quote push", handler: send, quoteId: null },
    { name: "existing quote update", handler: update, quoteId: "quote-1" },
])("$name formatting", ({ handler, quoteId }) => {
    beforeEach(() => {
        state.quoteId = quoteId
        state.details = ` ${details} `
        state.contact = " Devan Rowe "
        state.store = null
        vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
            let body: unknown
            if (input.startsWith("https://xero.test/Contacts?")) {
                body = { Contacts: [{ ContactID: "contact-1", Name: "Brand Partners Campus" }] }
            } else if (input === "https://xero.test/Quotes" && init?.method === "POST") {
                body = { Quotes: [{ QuoteID: "quote-1", QuoteNumber: "QU-001" }] }
            } else if (input.startsWith("https://xero.test/Quotes")) {
                body = { Quotes: [{ QuoteID: "quote-1", Status: "DRAFT", Terms: "Standard terms",
                    DateString: "2026-09-01", ExpiryDateString: "2026-10-01",
                    LineItems: [{ Description: "Brand Partners:\nOld details" }],
                }] }
            } else throw new Error(`Unexpected request ${input}`)
            return { ok: true, text: async () => JSON.stringify(body) }
        }))
    })

    afterEach(() => vi.unstubAllGlobals())

    async function pushQuote() {
        const response = await handler(new NextRequest("http://localhost/api/xero/quotes/job-1", { method: "POST" }), {
            params: Promise.resolve({ id: "job-1" }),
        })
        expect(response.status).toBe(200)
        const calls = vi.mocked(fetch).mock.calls.filter(([url, init]) => url === "https://xero.test/Quotes" && init?.method === "POST")
        expect(calls).toHaveLength(1)
        const quote = JSON.parse(String(calls[0][1]?.body)).Quotes[0]
        expect(quote.Reference).toBe(title)
        expect(quote.Contact).toEqual({ ContactID: "contact-1" })
        if (quoteId) expect(quote.QuoteID).toBe(quoteId)
        expect(quote.LineItems.slice(1)).toEqual([
            { Description: "--" },
            { Description: "1. SIGNAGE" },
            { Description: "Plinth\nQty: 2\nSize: 800x2500mm\nDetails: Fabricated sign\nDeliver to site",
                Quantity: 1, UnitAmount: 325, AccountCode: "200", TaxType: "OUTPUT2" },
            { Description: "Travel\nQty: 3", Quantity: 3, UnitAmount: 15, AccountCode: "250", TaxType: "OUTPUT2" },
            { Description: "Installation excluded" },
        ])
        return quote.LineItems[0]
    }

    it("uses the job title, Details and Quote Contact in that order", async () => {
        expect(await pushQuote()).toEqual({ Description: `${title}\n${details}\nContact: Devan Rowe` })
    })

    it("does not prepend the customer or site when a store is present", async () => {
        state.store = { name: "Campus" }
        expect(await pushQuote()).toEqual({ Description: `${title}\n${details}\nContact: Devan Rowe` })
    })

    it.each([null, "", "   "])("omits an absent or blank contact (%s)", async (contact) => {
        state.contact = contact
        expect(await pushQuote()).toEqual({ Description: `${title}\n${details}` })
    })

    it.each([null, "", "   "])("does not substitute reference or duplicate title for empty Details (%s)", async (emptyDetails) => {
        state.details = emptyDetails
        expect(await pushQuote()).toEqual({ Description: `${title}\nContact: Devan Rowe` })
    })

    it("preserves multiline Details", async () => {
        state.details = `${details}\nInstall on site.`
        expect(await pushQuote()).toEqual({ Description: `${title}\n${details}\nInstall on site.\nContact: Devan Rowe` })
    })
})
