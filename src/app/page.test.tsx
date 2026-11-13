import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import MapPage from "./page"

const state = vi.hoisted(() => ({ failSites: false, failDetails: true, selects: [] as string[] }))
vi.mock("@/components/dashboard-layout", () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock("next/dynamic", () => ({ default: () => ({ stores }: { stores: { name: string }[] }) => <div aria-label="Map pins">{stores.map(site => site.name).join(",")}</div> }))
vi.mock("@/components/store-list", () => ({ StoreList: ({ searchTerm, onSearchChange }: { searchTerm: string; onSearchChange: (value: string) => void }) => <input aria-label="Search sites" value={searchTerm} onChange={event => onSearchChange(event.target.value)} /> }))
vi.mock("@/lib/customer-filter", () => ({ useCustomerFilter: () => ({ clientId: null, isAdmin: true, customers: [{ id: "mcd", name: "McDonald’s" }] }) }))
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: () => {
    let base = false
    const query = {
        select: (columns: string) => { state.selects.push(columns); base = columns === "*"; return query },
        in: () => query,
        then: (resolve: (value: unknown) => void) => Promise.resolve(base
            ? { data: state.failSites ? null : [{ id: "site", client_id: "mcd", name: "Palmerston North", lat: -40.35, lng: 175.61 }], error: state.failSites ? new Error("Unavailable") : null }
            : { data: [], error: state.failDetails ? new Error("Details timed out") : null }).then(resolve),
    }
    return query
} }) }))

beforeEach(() => { state.failSites = false; state.failDetails = true; state.selects = [] })
afterEach(cleanup)
function openMap() {
    return render(<SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false, dedupingInterval: 0 }}><MapPage /></SWRConfig>)
}

it("keeps site pins and customer search working when related details fail", async () => {
    openMap()
    expect(await screen.findByText("Palmerston North")).toBeVisible()
    expect(await screen.findByText(/Site locations are available/)).toBeVisible()
    expect(state.selects.some(columns => columns.includes("clients:clients!stores_client_id_fkey(name)"))).toBe(true)
    fireEvent.change(screen.getByLabelText("Search sites"), { target: { value: "mcdonalds" } })
    expect(screen.getByLabelText("Map pins")).toHaveTextContent("Palmerston North")
    fireEvent.change(screen.getByLabelText("Search sites"), { target: { value: "Timezone" } })
    expect(screen.getByLabelText("Map pins")).toBeEmptyDOMElement()
})

it("shows a retryable error instead of presenting a failed query as zero sites", async () => {
    state.failSites = true
    openMap()
    expect(await screen.findByRole("alert")).toHaveTextContent("Sites could not load")
    state.failSites = false
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Palmerston North")).toBeVisible()
})
