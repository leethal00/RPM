import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import LeadsPage from "./page"

const state = vi.hoisted(() => ({ failItems: false, pendingItems: false, pendingOptions: true, requests: [] as string[] }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/dashboard-layout", () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock("@/lib/hooks/use-current-member", () => ({ useCurrentMember: () => ({ data: undefined, isLoading: true }) }))
vi.mock("@/lib/supabase/client", async () => {
    const { createClient } = await import("@supabase/supabase-js")
    const client = createClient("https://leads.test", "test-key", {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: async (input, init) => {
            const url = new URL(String(input))
            const table = url.pathname.split("/").at(-1)!
            state.requests.push(table)
            if (init?.method === "DELETE") return Response.json({ id: "lead-1" })
            if (table !== "internal_work_items") {
                if (state.pendingOptions) return await new Promise<Response>(() => {})
                return Response.json([])
            }
            if (state.pendingItems) return await new Promise<Response>(() => {})
            if (state.failItems) return Response.json({ message: "Unavailable" }, { status: 400 })
            return Response.json([{ id: "lead-1", title: "Follow up site", description: "Call customer", client_id: null, store_id: null, assigned_to: null, priority: "normal", status: "new", due_date: null, created_at: "2026-11-13T00:00:00Z" }])
        } },
    })
    return { createClient: () => client }
})
beforeEach(() => { state.failItems = false; state.pendingItems = false; state.pendingOptions = true; state.requests = [] })
afterEach(cleanup)

it("shows leads without waiting for pending dropdowns or session profile", async () => {
    render(<SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}><LeadsPage /></SWRConfig>)
    expect(await screen.findByRole("button", { name: "Follow up site Call customer" })).toBeVisible()
    expect(state.requests).not.toContain("user")
})

it("shows a retryable failure instead of reporting that no leads exist", async () => {
    state.failItems = true
    render(<SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}><LeadsPage /></SWRConfig>)
    expect(await screen.findByRole("alert")).toHaveTextContent("Leads and to-do items could not load")
    expect(screen.queryByText("No leads or tasks yet")).not.toBeInTheDocument()
    state.failItems = false
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("button", { name: "Follow up site Call customer" })).toBeVisible()
})

it("keeps cached leads visible on returning while revalidation is pending", async () => {
    const cache = new Map()
    const view = (open: boolean) => <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>{open && <LeadsPage />}</SWRConfig>
    const { rerender } = render(view(true))
    await screen.findByRole("button", { name: "Follow up site Call customer" })
    rerender(view(false))
    state.pendingItems = true
    rerender(view(true))
    expect(screen.getByRole("button", { name: "Follow up site Call customer" })).toBeVisible()
    expect(screen.queryByText("No leads or tasks yet")).not.toBeInTheDocument()
})

it("distinguishes initial loading from a successful empty list", async () => {
    state.pendingItems = true
    render(<SWRConfig value={{ provider: () => new Map() }}><LeadsPage /></SWRConfig>)
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Loading leads and to-do items"))
    expect(screen.queryByText("No leads or tasks yet")).not.toBeInTheDocument()
})

it("updates cached entries after a successful deletion", async () => {
    render(<SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}><LeadsPage /></SWRConfig>)
    fireEvent.click(await screen.findByRole("button", { name: "Delete Follow up site" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete item" }))
    await screen.findByText("No leads or tasks yet")
    expect(screen.queryByRole("button", { name: "Follow up site Call customer" })).not.toBeInTheDocument()
})
