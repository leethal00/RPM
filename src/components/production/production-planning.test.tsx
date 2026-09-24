import { fireEvent, render, screen, waitFor, within, cleanup } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DetailedProductionPlanning as ProductionPlanning } from "./detailed-production-planning"

const mocks = vi.hoisted(() => ({ query: vi.fn(), insert: vi.fn(), update: vi.fn(), eq: vi.fn(), single: vi.fn(), mutate: vi.fn() }))
vi.mock("@/components/dashboard-layout", () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }))
vi.mock("@/lib/customer-filter", () => ({ useCustomerFilter: () => ({ clientId: null, initialised: true }) }))
vi.mock("@/lib/hooks/use-supabase-query", () => ({ useSupabaseQuery: (...args: unknown[]) => mocks.query(...args) }))
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: () => ({ insert: mocks.insert, update: mocks.update }) }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

const operation = {
    id: "22222222-2222-4222-8222-222222222222", job_id: "11111111-1111-4111-8111-111111111111",
    department_code: "cnc", name: "Cut fascia", sequence: 10, status: "in_progress", estimated_hours: 4,
    actual_hours: 7, progress_percent: 30, due_date: null, effective_due_date: "2026-10-02", blocker_reason: "Waiting for drawings",
    job_number: "26418", job_title: "Gateway plinths", job_status: "in_progress", client_name: "Example client", updated_at: "2026-09-23T01:00:00Z",
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.eq.mockReturnValue({ eq: mocks.eq, select: () => ({ maybeSingle: mocks.single }) })
    mocks.update.mockReturnValue({ eq: mocks.eq })
    mocks.insert.mockReturnValue({ select: () => ({ maybeSingle: mocks.single }) })
    mocks.single.mockResolvedValue({ data: { id: operation.id }, error: null })
    mocks.query.mockImplementation((key: string | null) => ({
        data: key?.startsWith("production-job-options") ? [{ id: operation.job_id, title: operation.job_title, job_number: "26418" }]
            : key?.includes(":cnc:") ? [operation] : [],
        mutate: mocks.mutate, isLoading: false, isValidating: false, error: null,
    }))
})
afterEach(cleanup)

describe("production planning workspace", () => {
    it("shows a CNC stage, blocker, actuals and independently assessed progress", () => {
        render(<ProductionPlanning />)
        expect(screen.getByRole("link", { name: /26418/ })).toHaveAttribute("href", `/quoting/jobs/${operation.job_id}`)
        expect(screen.getByText("Blocked: Waiting for drawings")).toBeInTheDocument()
        expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30")
        expect(screen.getByText("Job due date")).toBeInTheDocument()
    })
    it("changes department without leaving old CNC rows on screen", () => {
        render(<ProductionPlanning />)
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Design" }), { button: 0, ctrlKey: false })
        expect(screen.queryByText("Cut fascia")).not.toBeInTheDocument()
        expect(screen.getByText("No Design operations in this view.")).toBeInTheDocument()
    })
    it("creates an operation with unknown hours/progress rather than invented zeroes", async () => {
        render(<ProductionPlanning />)
        fireEvent.click(screen.getByRole("button", { name: "Add operation" }))
        fireEvent.change(screen.getByLabelText("Job"), { target: { value: operation.job_id } })
        fireEvent.change(screen.getByLabelText("Operation", { exact: true }), { target: { value: "Cut new panels" } })
        fireEvent.click(screen.getByRole("button", { name: "Save operation" }))
        await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ name: "Cut new panels", estimated_hours: null, progress_percent: null, department_code: "cnc" })))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    })
    it("marks Complete explicitly and uses the row version to prevent stale overwrites", async () => {
        render(<ProductionPlanning />)
        fireEvent.click(screen.getByRole("button", { name: "Edit Cut fascia" }))
        fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("Status"), { target: { value: "complete" } })
        fireEvent.click(screen.getByRole("button", { name: "Save operation" }))
        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "complete", progress_percent: 100 })))
        expect(mocks.eq).toHaveBeenCalledWith("updated_at", operation.updated_at)
    })
    it("keeps the form open after a stale write", async () => {
        mocks.single.mockResolvedValue({ data: null, error: null })
        render(<ProductionPlanning />)
        fireEvent.click(screen.getByRole("button", { name: "Edit Cut fascia" }))
        fireEvent.click(screen.getByRole("button", { name: "Save operation" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("This operation changed")
        expect(screen.getByRole("dialog")).toBeInTheDocument()
    })
    it("shows a retryable load error instead of an empty workload", () => {
        mocks.query.mockReturnValue({ error: new Error("offline"), mutate: mocks.mutate })
        render(<ProductionPlanning />)
        expect(screen.getByRole("alert")).toHaveTextContent("Could not load production planning")
        fireEvent.click(screen.getByRole("button", { name: "Retry" }))
        expect(mocks.mutate).toHaveBeenCalled()
    })
})
