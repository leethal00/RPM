import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ProductionPlanning } from "./production-planning"
vi.mock("@/components/dashboard-layout", () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }))
vi.mock("@/lib/customer-filter", () => ({ useCustomerFilter: () => ({ clientId: null, initialised: true }) }))
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }))
vi.mock("@/lib/hooks/use-supabase-query", () => ({ useSupabaseQuery: () => ({ data: [
    { id: "a", number: "10", title: "Small", client: "Client", due: null, estimated: 2, actual: null },
    { id: "b", number: "2", title: "Large", client: "Client", due: "2026-10-02", estimated: 12, actual: 0 },
], isLoading: false, isValidating: false, error: null, mutate: vi.fn() }) }))
afterEach(cleanup)
describe("department workload summary", () => {
    it("shows four combined tabs, a separate number column and no column filters", () => {
        render(<ProductionPlanning />)
        expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["CNC", "Metalshop", "Acrylic fab/wiring/finishing", "Installation"])
        expect(screen.getByRole("columnheader", { name: "Job number" })).toBeInTheDocument()
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
        expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument()
        expect(screen.getByText("Example only · Not active")).toBeInTheDocument()
        expect(screen.getByRole("link", { name: "Large" })).toHaveAttribute("href", "/quoting/jobs/b")
    })
    it("sorts numeric values in both directions and keeps missing values last", () => {
        render(<ProductionPlanning />)
        const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1).map(row => row.textContent)
        fireEvent.click(screen.getByRole("button", { name: "Job number" }))
        expect(rows()[0]).toContain("Large")
        fireEvent.click(screen.getByRole("button", { name: "Estimated hours" }))
        expect(rows()[0]).toContain("Small")
        fireEvent.click(screen.getByRole("button", { name: "Estimated hours" }))
        expect(rows()[0]).toContain("Large")
        fireEvent.click(screen.getByRole("button", { name: "Actual hours" }))
        fireEvent.click(screen.getByRole("button", { name: "Actual hours" }))
        expect(rows()[0]).toContain("Large")
        expect(screen.getByRole("columnheader", { name: "Actual hours" })).toHaveAttribute("aria-sort", "descending")
    })
})

