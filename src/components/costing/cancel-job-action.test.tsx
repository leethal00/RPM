import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CancelJobAction } from "./cancel-job-action"
import type { CostingJob } from "@/types/database"

const job = { id: "job", job_number: "INV-test", status: "in_progress" } as CostingJob
afterEach(() => vi.unstubAllGlobals())

describe("Cancel job confirmation", () => {
  it("is hidden for non-admins and non-active jobs", () => {
    const { rerender } = render(<CancelJobAction job={job} canCancel={false} onCancelled={vi.fn()}/> )
    expect(screen.queryByRole("button", { name: "Cancel job" })).toBeNull()
    rerender(<CancelJobAction job={{ ...job, status: "cancelled" }} canCancel onCancelled={vi.fn()}/> )
    expect(screen.queryByRole("button", { name: "Cancel job" })).toBeNull()
  })

  it("keeps the job untouched until confirmed, then sends the optional reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)
    const changed = vi.fn()
    render(<CancelJobAction job={job} canCancel onCancelled={changed}/> )
    fireEvent.click(screen.getByRole("button", { name: "Cancel job" }))
    expect(screen.getByText(/Xero invoice will not be deleted or voided/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Keep job" }))
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Cancel job" }))
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Customer cancelled before work started" } })
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }))
    await waitFor(() => expect(changed).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledWith("/api/costing/jobs/job/cancel", expect.objectContaining({
      method: "POST", body: JSON.stringify({ confirmed: true, reason: "Customer cancelled before work started" }),
    }))
  })

  it("retains the dialog and reason when cancellation fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Job changed" }) }))
    const changed = vi.fn()
    render(<CancelJobAction job={job} canCancel onCancelled={changed}/> )
    fireEvent.click(screen.getByRole("button", { name: "Cancel job" }))
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Keep my reason" } })
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeEnabled())
    expect(screen.getByLabelText("Reason (optional)")).toHaveValue("Keep my reason")
    expect(changed).not.toHaveBeenCalled()
  })
})
