import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SWRConfig } from "swr"
import userEvent from "@testing-library/user-event"
import QuotesPage from "./page"

const state = vi.hoisted(() => ({
    clientId: null as string | null,
    requests: [] as URL[],
    push: vi.fn(),
    fail: false,
    manyOptions: false,
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock("@/lib/customer-filter", () => ({ useCustomerFilter: () => ({
    clientId: state.clientId, isAdmin: true,
    customers: [{ id: "client-a", name: "Alpha" }, { id: "client-b", name: "Beta" }],
}) }))
vi.mock("@/components/dashboard-layout", () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock("@/components/costing/xero-connect", () => ({ XeroConnect: () => null }))
vi.mock("@/components/costing-job-form", () => ({ CostingJobForm: () => <div>Quote form</div> }))
vi.mock("@/lib/supabase/client", async () => {
    const { createClient } = await import("@supabase/supabase-js")
    const client = createClient("https://quotes.test", "test-key", {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: async (input) => {
            const url = new URL(String(input))
            state.requests.push(url)
            if (state.fail) return new Response(JSON.stringify({ message: "Unavailable" }), { status: 400 })
            if (!url.searchParams.get("select")?.startsWith("*")) {
                const option = { store_id: "wellington", stores: { name: "Wellington" }, quoted_by_name: "Jo", xero_quote_number: "QU-2" }
                const rows = state.manyOptions && url.searchParams.get("offset") === "0" ? Array.from({ length: 500 }, () => option) : [option, { store_id: "missing", stores: { name: "Missing" }, quoted_by_name: null, xero_quote_number: null }, { store_id: null, stores: null, quoted_by_name: "Sam", xero_quote_number: "QU-100" }]
                return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } })
            }
            const empty = url.searchParams.get("store_id") === "eq.missing"
            const approved = url.searchParams.get("status")?.includes("approved")
            const declined = url.searchParams.get("status") === "in.(cancelled)"
            const rows = empty ? [] : [{ id: "quote-1", title: "Shop signs", status: declined ? "cancelled" : approved ? "in_progress" : "quote", client_id: "client-a", clients: { name: "Alpha" }, stores: { name: "Auckland" }, quoted_by_name: "Sam", xero_quote_number: "QU-100", reference: "Ref 1" }]
            return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json", "Content-Range": `0-0/${empty ? 0 : 41}` } })
        } },
    })
    return { createClient: () => client }
})

function page() {
    return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}><QuotesPage /></SWRConfig>
}
function lastQuery() { return state.requests.filter(url => url.searchParams.get("select")?.startsWith("*")).at(-1)!.searchParams }
async function choose(label: string, option: string) {
    await waitFor(() => expect(screen.getByRole("combobox", { name: label })).not.toBeDisabled())
    fireEvent.click(screen.getByRole("combobox", { name: label }))
    fireEvent.click(await screen.findByRole("option", { name: option }))
}

beforeEach(() => {
    state.clientId = null
    state.requests = []
    state.fail = false
    state.manyOptions = false
    state.push.mockClear()
    Element.prototype.scrollIntoView = vi.fn()
    Element.prototype.hasPointerCapture = vi.fn(() => false)
    Element.prototype.releasePointerCapture = vi.fn()
})
afterEach(cleanup)

describe("Quotes column filters", () => {
    it("combines client, site, person, Xero, status and search in the paginated server query", async () => {
        render(page())
        await screen.findByText("Shop signs")
        expect(lastQuery().get("limit")).toBe("20")
        await choose("Filter by client", "Beta")
        await choose("Filter by site", "Wellington")
        await choose("Filter by quoted by", "Jo")
        await choose("Filter by Xero quote number", "QU-2")
        fireEvent.change(screen.getByPlaceholderText("Search quote, reference or Xero quote #…"), { target: { value: "sign" } })
        await choose("Filter by status", "Pending")
        await waitFor(() => expect(lastQuery().getAll("status")).toEqual(["in.(quote,quoted)", "eq.quoted"]))
        expect(lastQuery().get("client_id")).toBe("eq.client-b")
        expect(lastQuery().get("store_id")).toBe("eq.wellington")
        expect(lastQuery().get("quoted_by_name")).toBe("eq.Jo")
        expect(lastQuery().get("xero_quote_number")).toBe("eq.QU-2")
        expect(lastQuery().get("or")).toContain("title.ilike.%sign%")
        expect(lastQuery().get("is_template")).toBe("eq.false")
    })

    it("resets page on filter changes and keeps controls available with no matches", async () => {
        render(page())
        await screen.findByText("Page 1 of 3")
        const pagination = screen.getByText("Page 1 of 3").parentElement!
        fireEvent.click(pagination.querySelectorAll("button")[2])
        await waitFor(() => expect(lastQuery().get("offset")).toBe("20"))
        await choose("Filter by site", "Missing")
        await screen.findByText("No quotes match these filters.")
        expect(lastQuery().get("offset")).toBe("0")
        expect(screen.getByLabelText("Filter by site")).toHaveTextContent("Missing")
        fireEvent.click(screen.getByRole("button", { name: "Clear filters" }))
        await screen.findByText("Shop signs")
        await waitFor(() => expect(lastQuery().has("store_id")).toBe(false))
        expect(lastQuery().get("select")).not.toContain("!inner")
    })

    it("filters ad-hoc quotes using NULL and clears status when changing tabs", async () => {
        render(page())
        await screen.findByText("Shop signs")
        await choose("Filter by client", "Ad-hoc / No client")
        await choose("Filter by status", "Draft Quote")
        await waitFor(() => expect(lastQuery().getAll("status")).toContain("eq.quote"))
        await screen.findByText("Shop signs")
        await userEvent.click(screen.getByRole("tab", { name: "Approved" }))
        await waitFor(() => expect(lastQuery().getAll("status")).toEqual(["in.(approved,in_progress,complete,invoiced)"]))
        expect(lastQuery().get("client_id")).toBe("is.null")
        await choose("Filter by status", "Accepted")
        await waitFor(() => expect(lastQuery().getAll("status")).toContain("eq.approved"))
    })

    it("separates declined records, resets pagination and status, and preserves search and client scope", async () => {
        render(page())
        await screen.findByText("Shop signs")
        expect(screen.getAllByRole("tab")).toHaveLength(3)
        expect(screen.getByRole("tab", { name: "Active" })).toHaveAttribute("aria-selected", "true")
        await choose("Filter by client", "Beta")
        fireEvent.change(screen.getByPlaceholderText("Search quote, reference or Xero quote #…"), { target: { value: "sign" } })
        await choose("Filter by status", "Pending")
        const pagination = (await screen.findByText("Page 1 of 3")).parentElement!
        fireEvent.click(pagination.querySelectorAll("button")[2])
        await waitFor(() => expect(lastQuery().get("offset")).toBe("20"))
        await userEvent.click(screen.getByRole("tab", { name: "Declined" }))
        await waitFor(() => expect(lastQuery().getAll("status")).toEqual(["in.(cancelled)"]))
        expect(lastQuery().get("offset")).toBe("0")
        expect(lastQuery().get("client_id")).toBe("eq.client-b")
        expect(lastQuery().get("or")).toContain("title.ilike.%sign%")
        await waitFor(() => expect(screen.getByText("Cancelled")).toBeInTheDocument())
        expect(screen.queryByTitle("Delete quote")).not.toBeInTheDocument()
        fireEvent.click(screen.getByText("Shop signs"))
        expect(state.push).toHaveBeenCalledWith("/quoting/jobs/quote-1")
        expect(state.requests.filter(url => !url.searchParams.get("select")?.startsWith("*")).at(-1)!.searchParams.get("status")).toBe("in.(cancelled)")
        await userEvent.click(screen.getByRole("tab", { name: "Active" }))
        await waitFor(() => expect(lastQuery().getAll("status")).toEqual(["in.(quote,quoted)"]))
    })

    it("respects global customer scope and resets local filters and pagination on scope change", async () => {
        const rendered = render(page())
        await screen.findByText("Page 1 of 3")
        await choose("Filter by client", "Beta")
        await screen.findByText("Shop signs")
        const pagination = screen.getByText("Page 1 of 3").parentElement!
        fireEvent.click(pagination.querySelectorAll("button")[2])
        await waitFor(() => expect(lastQuery().get("offset")).toBe("20"))
        state.clientId = "client-a"
        rendered.rerender(page())
        await waitFor(() => expect(lastQuery().get("client_id")).toBe("eq.client-a"))
        expect(lastQuery().get("offset")).toBe("0")
        expect(screen.queryByRole("combobox", { name: "Filter by client" })).not.toBeInTheDocument()
    })

    it("preserves row navigation, new quote and delete confirmation without accidental navigation", async () => {
        render(page())
        fireEvent.click(await screen.findByText("Shop signs"))
        expect(state.push).toHaveBeenCalledWith("/quoting/quote-1")
        state.push.mockClear()
        fireEvent.click(screen.getByTitle("Delete quote"))
        expect(await screen.findByText("Delete this quote?")).toBeInTheDocument()
        expect(state.push).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
        fireEvent.click(screen.getByRole("button", { name: "New quote" }))
        expect(await screen.findByText("Quote form")).toBeInTheDocument()
    })

    it("shows a recoverable error instead of claiming no results", async () => {
        state.fail = true
        render(page())
        expect(await screen.findByRole("alert")).toHaveTextContent("Could not load quotes")
        state.fail = false
        fireEvent.click(screen.getByRole("button", { name: "Try again" }))
        await screen.findByText("Shop signs")
    })

    it("loads choices beyond the first 500 quotes and filters missing values exactly", async () => {
        state.manyOptions = true
        render(page())
        await screen.findByText("Shop signs")
        await choose("Filter by site", "No site")
        await choose("Filter by quoted by", "Not recorded")
        await choose("Filter by Xero quote number", "No Xero number")
        await waitFor(() => expect(lastQuery().get("xero_quote_number")).toBe("is.null"))
        expect(lastQuery().get("store_id")).toBe("is.null")
        expect(lastQuery().get("quoted_by_name")).toBe("is.null")
        expect(state.requests.some(url => url.searchParams.get("limit") === "500" && url.searchParams.get("offset") === "500")).toBe(true)
        expect(screen.getAllByRole("textbox")).toHaveLength(1)
    })
})
