import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import StoresListPage from "./page"

const state = vi.hoisted(() => ({ failFallback: false, queries: [] as { table: string; columns: string; filters: string[] }[] }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/dashboard-layout", () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock("@/components/customer-filter-dropdown", () => ({ CustomerFilterDropdown: () => null }))
vi.mock("@/components/site-form", () => ({ SiteForm: () => null }))
vi.mock("@/lib/customer-filter", () => ({ useCustomerFilter: () => ({ clientId: null, isAdmin: true, role: "super_admin" }) }))
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: (table: string) => {
    const call = { table, columns: "", filters: [] as string[] }
    state.queries.push(call)
    const query = {
        select: (columns: string) => { call.columns = columns; return query },
        or: (filter: string) => { call.filters.push(filter); return query },
        eq: () => query, is: () => query, order: () => query, range: () => query,
        then: (resolve: (value: unknown) => void) => Promise.resolve(table !== "stores"
            ? { data: [], error: null }
            : call.columns.includes("assets") || state.failFallback
                ? { data: null, error: new Error("Query failed") }
                : { data: [], count: 0, error: null }).then(resolve),
    }
    return query
} }) }))

beforeEach(() => { state.failFallback = false; state.queries = [] })
afterEach(cleanup)
function openPortfolio() {
    render(<SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false, dedupingInterval: 0 }}><StoresListPage /></SWRConfig>)
}

it("preserves the search on the plain-site fallback when related data fails", async () => {
    openPortfolio()
    fireEvent.change(screen.getByPlaceholderText("Search sites, addresses, managers…"), { target: { value: "palmerston" } })
    await waitFor(() => expect(state.queries.some(query => query.columns === "*" && query.filters.some(filter => filter.includes("%palmerston%")))).toBe(true))
    expect(await screen.findByText(/Site records loaded, but brands/)).toBeVisible()
})

it("exposes an error when both the joined query and fallback fail", async () => {
    state.failFallback = true
    openPortfolio()
    expect(await screen.findByRole("alert")).toHaveTextContent("Sites could not load")
})
