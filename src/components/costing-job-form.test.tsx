import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CostingJobForm } from "./costing-job-form"
import type { CostingJob } from "@/types/database"

const coates = "680debed-2440-43de-b646-2fd604ab5d91"
const mcdonalds = "df380ff7-6726-4b5b-a0e4-b24a4dc8c433"
const linwood = "927ee6c2-dadd-4644-b437-66df6f40bf90"
const state = vi.hoisted(() => ({ admin: true, writes: [] as { table: string; body: Record<string, unknown> }[], offsets: [] as string[], paginate: false, failSites: false, linkedSites: [] as string[] }))
vi.mock("@/lib/customer-filter", () => ({ useCustomerFilter: () => ({ isAdmin: state.admin }) }))
vi.mock("@/lib/linked-customer-sites", () => ({ linkedCustomerSiteIds: async () => state.linkedSites }))
vi.mock("@/components/site-form", () => ({ SiteForm: () => <div>Create site form</div> }))
vi.mock("@/lib/supabase/client", async () => {
    const { createClient } = await import("@supabase/supabase-js")
    const client = createClient("https://quote-form.test", "test-key", {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: async (input, init) => {
            const url = new URL(String(input))
            const table = url.pathname.split("/").at(-1)!
            if (init?.method === "POST") {
                state.writes.push({ table, body: JSON.parse(String(init.body)) })
                return Response.json(table === "costing_jobs" ? { id: "new-job" } : [])
            }
            if (table === "stores") {
                state.offsets.push(url.searchParams.get("offset") || "0")
                if (state.failSites) return Response.json({ message: "Unavailable" }, { status: 500 })
                if (state.paginate && url.searchParams.get("offset") === "0") return Response.json(Array.from({ length: 500 }, (_, i) => ({ id: `other-${i}`, name: `Other site ${i}`, client_id: "other" })))
                return Response.json([{ id: linwood, name: "McDonalds Linwood", client_id: mcdonalds }])
            }
            return Response.json(table === "clients" ? [{ id: coates, name: "Coates Signco" }, { id: mcdonalds, name: "McDonalds Linwood" }] : [])
        } },
    })
    client.auth.getUser = vi.fn().mockResolvedValue({ data: { user: { id: "staff" } }, error: null })
    return { createClient: () => client }
})

async function choose(label: string, option: string) {
    const select = screen.getByRole("combobox", { name: label })
    await waitFor(() => expect(select).not.toBeDisabled())
    fireEvent.click(select)
    fireEvent.click(await screen.findByRole("option", { name: option }))
}

beforeEach(() => {
    state.admin = true
    state.writes = []
    state.offsets = []
    state.paginate = false
    state.failSites = false
    state.linkedSites = []
    Element.prototype.scrollIntoView = vi.fn()
    Element.prototype.hasPointerCapture = vi.fn(() => false)
    Element.prototype.releasePointerCapture = vi.fn()
})
afterEach(cleanup)

describe("jobs at another customer's existing site", () => {
    it("offers the linked McDonalds fleet under Coates without enabling all existing sites", async () => {
        state.linkedSites = [linwood, "another-mcdonalds-site"]
        render(<CostingJobForm onSuccess={vi.fn()} onCancel={vi.fn()} />)
        await choose("Client (optional)", "Coates Signco")
        await choose("Job location", "Site job")
        await choose("Site (required)", "McDonalds Linwood · McDonalds Linwood")
        expect(screen.getByLabelText("All existing sites")).not.toBeChecked()
    })
    it("saves Coates as customer and the original Linwood site, with a visible client summary", async () => {
        const onSuccess = vi.fn()
        render(<CostingJobForm createAsJob onSuccess={onSuccess} onCancel={vi.fn()} />)
        await choose("Client (required for Xero)", "Coates Signco")
        await choose("Job location", "Site job")
        fireEvent.change(screen.getByLabelText("Job Title"), { target: { value: "Linwood warranty repair" } })
        fireEvent.click(screen.getByLabelText("All existing sites"))
        fireEvent.change(screen.getByLabelText("Search sites"), { target: { value: "Linwood" } })
        await choose("Site (required)", "McDonalds Linwood · McDonalds Linwood")
        fireEvent.click(screen.getByLabelText("Show to client"))
        fireEvent.click(screen.getByRole("button", { name: "Create Job" }))
        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("new-job"))
        expect(state.writes.find(write => write.table === "costing_jobs")?.body).toMatchObject({
            client_id: coates, store_id: linwood, visible_to_client: true, status: "in_progress",
        })
        expect(state.writes.some(write => write.table === "stores" || write.table === "clients")).toBe(false)
    })

    it("retains an existing cross-customer site when editing without enabling all sites", async () => {
        const job = { id: "job", title: "Warranty repair", client_id: coates, store_id: linwood, visible_to_client: true } as CostingJob
        render(<CostingJobForm job={job} onSuccess={vi.fn()} onCancel={vi.fn()} />)
        await waitFor(() => expect(screen.getByRole("combobox", { name: "Site (required)" })).toHaveTextContent("McDonalds Linwood"))
        expect(screen.getByLabelText("All existing sites")).not.toBeChecked()
        fireEvent.click(screen.getByRole("button", { name: "Save Changes" }))
        await waitFor(() => expect(state.writes[0]?.body).toMatchObject({ id: "job", client_id: coates, store_id: linwood }))
    })

    it("loads sites beyond the first page", async () => {
        state.paginate = true
        render(<CostingJobForm onSuccess={vi.fn()} onCancel={vi.fn()} />)
        await choose("Client (optional)", "Coates Signco")
        await choose("Job location", "Site job")
        fireEvent.click(screen.getByLabelText("All existing sites"))
        fireEvent.change(screen.getByLabelText("Search sites"), { target: { value: "Linwood" } })
        await choose("Site (required)", "McDonalds Linwood · McDonalds Linwood")
        expect(state.offsets).toEqual(["0", "500"])
    })

    it("keeps the cross-customer picker unavailable to client users", async () => {
        state.admin = false
        render(<CostingJobForm onSuccess={vi.fn()} onCancel={vi.fn()} />)
        await choose("Client (optional)", "Coates Signco")
        await choose("Job location", "Site job")
        expect(screen.queryByLabelText("All existing sites")).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole("combobox", { name: "Site (required)" }))
        expect(screen.queryByRole("option", { name: /McDonalds Linwood/ })).not.toBeInTheDocument()
    })

    it("reports failed site loading instead of showing an empty customer list", async () => {
        state.failSites = true
        render(<CostingJobForm onSuccess={vi.fn()} onCancel={vi.fn()} />)
        await choose("Client (optional)", "Coates Signco")
        await choose("Job location", "Site job")
        expect(screen.getByRole("alert")).toHaveTextContent("Could not load sites")
        expect(screen.getByRole("combobox", { name: "Site (required)" })).toBeDisabled()
    })
})
