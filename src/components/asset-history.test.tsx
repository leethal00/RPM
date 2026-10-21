import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"

const mocks = vi.hoisted(() => ({
    isAdmin: true,
    rows: [] as Record<string, unknown>[],
    loadError: null as null | { message: string },
    insert: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))
vi.mock("@/lib/customer-filter", () => ({ useCustomerFilter: () => ({ isAdmin: mocks.isAdmin }) }))
const client = {
    from: () => ({
        select: () => ({ eq: () => ({ order: () => ({ order: async () => ({ data: [...mocks.rows], error: mocks.loadError }) }) }) }),
        insert: mocks.insert,
    }),
}
vi.mock("@/lib/supabase/client", () => ({ createClient: () => client }))

import { AssetHistory } from "./asset-history"
import type { Job } from "@/types/database"

function show(jobs: Job[] = []) {
    return render(<SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}><AssetHistory assetId="asset-1" jobs={jobs} /></SWRConfig>)
}

async function fill() {
    fireEvent.click(screen.getByRole("button", { name: "Add history entry" }))
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2020-02-29" } })
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  Height restrictor repaired  " } })
    fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "  Replaced the damaged bar.  " } })
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }))
}

describe("manual asset history", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.isAdmin = true
        mocks.rows = []
        mocks.loadError = null
        mocks.insert.mockImplementation((row) => ({ select: () => ({ single: async () => {
            const saved = { id: "entry-1", created_at: "2026-10-21T00:00:00Z", created_by: "user-1", ...row }
            mocks.rows.push(saved)
            return { data: saved, error: null }
        } }) }))
    })

    it("saves a backdated entry against this asset and displays it after saving", async () => {
        show()
        await screen.findByText("No history recorded.")
        await fill()
        await screen.findByText("Height restrictor repaired")
        expect(mocks.insert).toHaveBeenCalledTimes(1)
        expect(mocks.insert).toHaveBeenCalledWith({ asset_id: "asset-1", occurred_on: "2020-02-29", title: "Height restrictor repaired", notes: "Replaced the damaged bar." })
        expect(screen.getByText("Replaced the damaged bar.")).toBeInTheDocument()
        expect(screen.getByText("29/02/2020")).toHaveAttribute("dateTime", "2020-02-29")
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    it("keeps the form and entered details on a rejected save", async () => {
        mocks.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: null, error: { message: "denied" } }) }) })
        show()
        await fill()
        await waitFor(() => expect(mocks.error).toHaveBeenCalled())
        expect(screen.getByLabelText("Title")).toHaveValue("  Height restrictor repaired  ")
        expect(screen.getByLabelText("Date")).toHaveValue("2020-02-29")
        expect(screen.getByRole("button", { name: "Save entry" })).toBeEnabled()
        expect(mocks.success).not.toHaveBeenCalled()
    })

    it("does not offer adding entries to non-admin readers", async () => {
        mocks.isAdmin = false
        show()
        await screen.findByText("No history recorded.")
        expect(screen.queryByRole("button", { name: "Add history entry" })).not.toBeInTheDocument()
    })

    it("shows load errors instead of claiming there is no history", async () => {
        mocks.loadError = { message: "unavailable" }
        show()
        expect(await screen.findByRole("alert")).toHaveTextContent("Could not load manual history entries.")
        expect(screen.queryByText("No history recorded.")).not.toBeInTheDocument()
    })

    it("interleaves manual entries with linked jobs by event date", async () => {
        mocks.rows = [{ id: "entry-1", asset_id: "asset-1", occurred_on: "2020-02-29", title: "Older repair", notes: "", created_at: "2026-10-21T00:00:00Z" }]
        show([{ id: "job-1", title: "Newer job", job_type: "fault", status: "closed", created_at: "2025-01-01T00:00:00Z" } as Job])
        const manual = await screen.findByText("Older repair")
        const job = screen.getByRole("link", { name: /Newer job/ })
        expect(job).toHaveAttribute("href", "/jobs/job-1")
        expect(job.compareDocumentPosition(manual) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
})
