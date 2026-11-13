import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useCurrentMember } from "./use-current-member"
import { Providers } from "@/components/providers"

const state = vi.hoisted(() => ({
    claims: vi.fn(), profile: vi.fn(), actor: "first",
    authEvent: null as null | ((event: string) => void),
}))
vi.mock("@/lib/customer-filter", () => ({ CustomerFilterProvider: ({ children }: { children: React.ReactNode }) => children }))
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({
    auth: {
        getClaims: state.claims,
        onAuthStateChange: (callback: (event: string) => void) => { state.authEvent = callback; return { data: { subscription: { unsubscribe: vi.fn() } } } },
    },
    from: () => ({ select: () => ({ eq: () => ({ single: state.profile }) }) }),
}) }))
beforeEach(() => {
    state.actor = "first"
    state.claims.mockReset().mockImplementation(async () => ({ data: { claims: { sub: state.actor, email: `${state.actor}@rpm.test` } }, error: null }))
    state.profile.mockReset().mockImplementation(async () => ({ data: { id: state.actor, name: state.actor }, error: null }))
})
afterEach(cleanup)
function Member({ label }: { label: string }) {
    const { data } = useCurrentMember()
    return <div data-testid={label}>{data?.profile?.name ?? "No member"}</div>
}

it("shares verification and profile loading, and reuses it when the sidebar remounts", async () => {
    const cache = new Map()
    const view = (sidebar: boolean) => <SWRConfig value={{ provider: () => cache }}><Member label="customer" />{sidebar && <Member label="sidebar" />}</SWRConfig>
    const { rerender } = render(view(true))
    await waitFor(() => expect(screen.getByTestId("sidebar")).toHaveTextContent("first"))
    rerender(view(false))
    rerender(view(true))
    expect(screen.getByTestId("sidebar")).toHaveTextContent("first")
    expect(state.claims).toHaveBeenCalledOnce()
    expect(state.profile).toHaveBeenCalledOnce()
})

it("clears cached identity on sign-out and loads the new identity after sign-in", async () => {
    render(<SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}><Providers><Member label="sidebar" /></Providers></SWRConfig>)
    await waitFor(() => expect(screen.getByTestId("sidebar")).toHaveTextContent("first"))
    act(() => state.authEvent?.("SIGNED_OUT"))
    await waitFor(() => expect(screen.getByTestId("sidebar")).toHaveTextContent("No member"))
    state.actor = "second"
    act(() => state.authEvent?.("SIGNED_IN"))
    await waitFor(() => expect(screen.getByTestId("sidebar")).toHaveTextContent("second"))
})
