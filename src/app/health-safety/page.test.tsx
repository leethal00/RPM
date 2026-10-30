import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import HealthSafetyPage from "./page"

const state = vi.hoisted(() => ({ records: [] as Record<string, unknown>[], writes: [] as Record<string, unknown>[] }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock("@/components/dashboard-layout", () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock("@/components/health-safety/incident-register", () => ({ IncidentRegister: () => null }))
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
  from: (table: string) => {
    let payload: Record<string, unknown> | undefined
    const result = () => ({ data: payload ? { id: "record" } : table === "users" ? { role: "super_admin" } : table === "hs_records" ? state.records : [], error: null })
    const query = {
      select: () => query, order: () => query, eq: () => query, limit: () => query,
      insert: (value: Record<string, unknown>) => { payload = value; if (table === "hs_records") state.writes.push(value); return query },
      update: (value: Record<string, unknown>) => { payload = value; if (table === "hs_records") state.writes.push(value); return query },
      single: async () => result(), then: (resolve: (value: unknown) => void) => Promise.resolve(result()).then(resolve),
    }
    return query
  },
}) }))

beforeEach(() => { state.records = []; state.writes = [] })
afterEach(cleanup)

async function startDraft() {
  render(<HealthSafetyPage />)
  fireEvent.click(await screen.findByRole("button", { name: "New SWMS/TA" }))
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Survey" } })
}

describe("SWMS TBC workflow", () => {
  it("edits multiline hazards and controls and previews unsaved changes without writing records", async () => {
    await startDraft()
    fireEvent.click(screen.getByRole("button", { name: "Add step" }))
    const hazard = screen.getByLabelText("Potential hazards")
    const control = screen.getByLabelText("Hazard controls")
    expect(hazard.tagName).toBe("TEXTAREA")
    expect(control.tagName).toBe("TEXTAREA")
    fireEvent.change(hazard, { target: { value: "Pedestrians and vehicles\nMedical event while working at height" } })
    fireEvent.change(control, { target: { value: "Sign in as required\nLiaise with the site contact before starting" } })
    const frame = screen.getByTitle("SWMS/TA document preview") as HTMLIFrameElement
    fireEvent.load(frame)
    const preview = within(frame.contentDocument!.body)
    expect(await preview.findByRole("cell", { name: /Pedestrians and vehicles\s+Medical event/ })).toBeInTheDocument()
    expect(preview.getByRole("cell", { name: /Sign in as required\s+Liaise with the site contact/ })).toBeInTheDocument()
    expect(preview.getAllByRole("heading", { name: "Survey" })).toHaveLength(2)
    fireEvent.change(control, { target: { value: "Updated control before saving" } })
    expect(preview.getByRole("cell", { name: "Updated control before saving" })).toBeInTheDocument()
    expect(state.writes).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({ steps: [expect.objectContaining({ hazard: "Pedestrians and vehicles\nMedical event while working at height", control: "Updated control before saving" })] })
  })

  it("keeps completed step fields locked and shows their existing text in the preview", async () => {
    state.records = [{ id: "record", kind: "swms", title: "Locked survey", site: "Albany", status: "completed", completed_at: "2026-10-04T18:00:00Z", work_date: "2026-10-04", body: { steps: [{ task: "Install", hazard: "Existing long hazard", risk: "3", control: "Existing long control", responsible: "Lead" }] }, revision: 1 }]
    render(<HealthSafetyPage />)
    fireEvent.click(await screen.findByRole("button", { name: /Locked survey.*SWMS\/TA/ }))
    expect(screen.getByLabelText("Potential hazards")).toBeDisabled()
    expect(screen.getByLabelText("Hazard controls")).toHaveValue("Existing long control")
    expect(screen.getByLabelText("Hazard controls")).toBeDisabled()
    const frame = screen.getByTitle("SWMS/TA document preview") as HTMLIFrameElement
    fireEvent.load(frame)
    expect(within(frame.contentDocument!.body).getByRole("cell", { name: "Existing long control" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument()
  })

  it("does not show a SWMS preview for a toolbox meeting", async () => {
    render(<HealthSafetyPage />)
    fireEvent.click(await screen.findByRole("button", { name: "New toolbox meeting" }))
    expect(screen.queryByTitle("SWMS/TA document preview")).not.toBeInTheDocument()
  })
  it("saves an undated draft with TBC and a valid internal sorting date", async () => {
    await startDraft()
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "" } })
    fireEvent.click(screen.getByLabelText("TBC"))
    expect(screen.getByLabelText("Date")).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].body).toMatchObject({ date_tbc: true })
    expect(state.writes[0].work_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it("rejects an empty date when TBC is unchecked", async () => {
    await startDraft()
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    expect(state.writes).toHaveLength(0)
  })
  it("permits completing a SWMS with TBC", async () => {
    await startDraft()
    fireEvent.change(screen.getByLabelText("Work site (required to complete)"), { target: { value: "Albany" } })
    fireEvent.change(screen.getByLabelText("Job description and work scope"), { target: { value: "Survey signs" } })
    fireEvent.change(screen.getByLabelText("Overall site hazards and risks"), { target: { value: "Height" } })
    fireEvent.change(screen.getByLabelText("Overall controls"), { target: { value: "Harnesses" } })
    fireEvent.click(screen.getByRole("button", { name: "Add step" }))
    fireEvent.click(screen.getByLabelText("TBC"))
    fireEvent.click(screen.getByRole("button", { name: "Complete and lock" }))
    await waitFor(() => expect(state.writes).toHaveLength(2))
    expect(state.writes[0].body).toMatchObject({ date_tbc: true })
    expect(state.writes[1]).toEqual({ status: "completed" })
  })
  it("reopens a saved TBC record and allows replacing TBC with a date", async () => {
    state.records = [{ id: "record", kind: "swms", title: "Survey", site: "Albany", status: "draft", work_date: "2026-10-04", body: { date_tbc: true }, revision: 1 }]
    render(<HealthSafetyPage />)
    fireEvent.click(await screen.findByRole("button", { name: /Survey.*SWMS\/TA/ }))
    expect(screen.getByLabelText("TBC")).toBeChecked()
    fireEvent.click(screen.getByLabelText("TBC"))
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-12" } })
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0].work_date).toBe("2026-10-12")
    expect(state.writes[0].body).toMatchObject({ date_tbc: false })
  })
  it("preserves TBC in correction revisions and resets it for a new SWMS", async () => {
    state.records = [{ id: "record", kind: "swms", title: "Survey", site: "Albany", status: "completed", completed_at: "2026-10-04T18:00:00Z", work_date: "2026-10-04", body: { date_tbc: true }, revision: 1 }]
    render(<HealthSafetyPage />)
    fireEvent.click(await screen.findByRole("button", { name: /Survey.*SWMS\/TA/ }))
    expect(screen.getByLabelText("TBC")).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Create correction revision" }))
    expect(screen.getByLabelText("TBC")).toBeChecked()
    expect(screen.getByLabelText("TBC")).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    await waitFor(() => expect(state.writes).toHaveLength(1))
    expect(state.writes[0]).toMatchObject({ revision_of: "record", revision: 2, body: { date_tbc: true } })
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Overview" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("button", { name: "New SWMS/TA" }))
    expect(screen.getByLabelText("TBC")).not.toBeChecked()
  })
})
