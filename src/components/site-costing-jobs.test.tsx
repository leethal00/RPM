import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SiteCostingJobs } from "./site-costing-jobs"

const state = vi.hoisted(() => ({ staff: true }))
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }))
vi.mock("@/lib/hooks/use-supabase-query", () => ({ useSupabaseQuery: () => ({ data: [{
    id: "job-1", title: "Two-site installation", production_title: null, job_number: "INV-7609",
    status: "in_progress", client_name: state.staff ? "Coates Signco" : null, can_open_job: state.staff,
}], isLoading: false, error: null }) }))

beforeEach(() => { state.staff = true })
describe("site RPM job history", () => {
    it("links staff to the same shared job at any selected site", () => {
        render(<SiteCostingJobs storeId="secondary-site" />)
        expect(screen.getByRole("link", { name: /Two-site installation/ })).toHaveAttribute("href", "/quoting/jobs/job-1")
        expect(screen.getByText(/INV-7609 · Coates Signco/)).toBeInTheDocument()
    })
    it("shows a client summary without a link to internal costing or another client's name", () => {
        state.staff = false
        render(<SiteCostingJobs storeId="secondary-site" />)
        expect(screen.getByText("Two-site installation")).toBeInTheDocument()
        expect(screen.queryByRole("link")).not.toBeInTheDocument()
        expect(screen.queryByText(/Coates Signco/)).not.toBeInTheDocument()
    })
})
