import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { CustomerFilterProvider, useCustomerFilter } from "./customer-filter"

const state = vi.hoisted(() => ({ clientQuery: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/quoting", useSearchParams: () => new URLSearchParams("client=selected") }))
vi.mock("@/lib/hooks/use-current-member", () => ({ useCurrentMember: () => ({ data: { user: { id: "admin" }, profile: { role: "super_admin" } }, isLoading: false }) }))
const client = { from: () => ({ select: () => ({ order: state.clientQuery }) }) }
vi.mock("@/lib/supabase/client", () => ({ createClient: () => client }))
afterEach(cleanup)

function Scope() {
    const { clientId, initialised, customers } = useCustomerFilter()
    return <div>{initialised ? "Ready" : "Loading"} / {clientId} / {customers.length} choices</div>
}

it("makes the selected scope ready while dropdown choices are still pending", async () => {
    state.clientQuery.mockReturnValue(new Promise(() => {}))
    render(<CustomerFilterProvider><Scope /></CustomerFilterProvider>)
    await waitFor(() => expect(screen.getByText("Ready / selected / 0 choices")).toBeVisible())
})
