import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { InstallerActivity } from "./installer-activity"

const mock = vi.hoisted(() => ({
  remove: vi.fn(), eq: vi.fn(), single: vi.fn(), success: vi.fn(), error: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { success: mock.success, error: mock.error } }))
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({
  from: (table: string) => ({
    select: () => ({ eq: () => ({ order: async () => ({ error: null, data: table === "installer_job_notes" ? [
      { id: "note-1", body: "First installer note", created_at: "2026-09-30T00:00:00Z", users: { name: "Sam" } },
      { id: "note-2", body: "Second installer note", created_at: "2026-09-30T00:01:00Z", users: { name: "Jo" } },
    ] : [] }) }) }),
    delete: () => { mock.remove(table); return { eq: mock.eq } },
  }),
}) }))

beforeEach(() => {
  vi.clearAllMocks()
  mock.eq.mockImplementation(() => ({ eq: mock.eq, select: () => ({ single: mock.single }) }))
  mock.single.mockResolvedValue({ data: { id: "note-1" }, error: null })
  vi.spyOn(window, "confirm").mockReturnValue(true)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe("Installer note deletion", () => {
  it("keeps deletion hidden without note permission, even when photo deletion is allowed", async () => {
    render(<InstallerActivity jobId="job-1" canDeletePhotos />)
    await screen.findByText("First installer note")
    expect(screen.queryByRole("button", { name: "Delete note" })).not.toBeInTheDocument()
  })

  it("does not delete when confirmation is cancelled", async () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    render(<InstallerActivity jobId="job-1" canDeleteNotes />)
    fireEvent.click((await screen.findAllByRole("button", { name: "Delete note" }))[0])
    expect(mock.remove).not.toHaveBeenCalled()
    expect(screen.getByText("First installer note")).toBeInTheDocument()
  })

  it("deletes only the selected note from this job and updates the list", async () => {
    render(<InstallerActivity jobId="job-1" canDeleteNotes />)
    fireEvent.click((await screen.findAllByRole("button", { name: "Delete note" }))[0])
    await waitFor(() => expect(screen.queryByText("First installer note")).not.toBeInTheDocument())
    expect(mock.remove).toHaveBeenCalledWith("installer_job_notes")
    expect(mock.eq).toHaveBeenCalledWith("id", "note-1")
    expect(mock.eq).toHaveBeenCalledWith("job_id", "job-1")
    expect(screen.getByText("Second installer note")).toBeInTheDocument()
    expect(mock.success).toHaveBeenCalledWith("Installer note deleted")
  })

  it.each([
    { data: null, error: { message: "Permission denied" } },
    { data: null, error: null },
  ])("retains notes if the database does not confirm deletion (%j)", async result => {
    mock.single.mockResolvedValue(result)
    render(<InstallerActivity jobId="job-1" canDeleteNotes />)
    fireEvent.click((await screen.findAllByRole("button", { name: "Delete note" }))[0])
    await waitFor(() => expect(mock.error).toHaveBeenCalled())
    expect(screen.getByText("First installer note")).toBeInTheDocument()
    expect(mock.success).not.toHaveBeenCalled()
    expect(screen.getAllByRole("button", { name: "Delete note" })[0]).not.toBeDisabled()
  })

  it("disables delete controls until the pending request finishes", async () => {
    let complete!: (value: unknown) => void
    mock.single.mockReturnValue(new Promise(resolve => { complete = resolve }))
    render(<InstallerActivity jobId="job-1" canDeleteNotes />)
    fireEvent.click((await screen.findAllByRole("button", { name: "Delete note" }))[0])
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Delete note" })).toBeDisabled()
    complete({ data: { id: "note-1" }, error: null })
    await waitFor(() => expect(screen.queryByText("First installer note")).not.toBeInTheDocument())
  })
})
