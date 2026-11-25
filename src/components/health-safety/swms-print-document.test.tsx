import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SwmsPrintDocument, type RecordRow } from "./swms-print-document"
import { getPreparedDate, hasWorkDate, isWorkDateTbc, nzCalendarDate } from "@/lib/hs-work-date"

const record: RecordRow = {
  id: "test", title: "External signage survey", status: "draft", job_reference: "INV-7606 EVENT Cinemas Albany",
  site: "Albany", work_date: "2026-10-04", revision: 1, template_version: null, completed_at: null,
  created_at: "2026-10-04T18:00:00Z", body: { prepared_date: "2026-10-03", date_tbc: true, scope: "Survey wall signs",
    steps: [{ task: "Pre-start checks", hazard: "Boom truck faults", risk: "3", control: "Check current certification", responsible: "Boom truck operator" }] },
}

describe("SWMS print document", () => {
  it("shows TBC on both pages and preserves the recorded steps", () => {
    render(<SwmsPrintDocument record={record} attendees={[]} attachments={[]} />)
    expect(within(screen.getByText("Prepared date").closest(".print-field") as HTMLElement).getByText("3 Oct 2026")).toBeInTheDocument()
    expect(within(screen.getByText("Planned work date").closest(".print-field") as HTMLElement).getByText("TBC")).toBeInTheDocument()
    expect(screen.getAllByText(/Planned work date: TBC/)).toHaveLength(2)
    expect(screen.getByText("Boom truck operator")).toBeInTheDocument()
    expect(screen.getAllByAltText("Rodier logo")).toHaveLength(2)
  })
  it.each([
    ["INV-7606 EVENT Cinemas Albany", "7606 EVENT Cinemas Albany"],
    ["7606 EVENT Cinemas Albany", "7606 EVENT Cinemas Albany"],
    ["Survey INV-signage", "Survey INV-signage"],
    [null, "\u2014"],
  ])("formats the project reference without changing the description: %s", (reference, expected) => {
    const { container } = render(<SwmsPrintDocument record={{ ...record, job_reference: reference }} attendees={[]} attachments={[]} />)
    const field = screen.getByText("Project number").closest(".print-field")!
    expect(within(field as HTMLElement).getByText(expected)).toBeInTheDocument()
    expect(container.querySelector(".print-document-head")).toHaveTextContent(`Project number: ${expected}`)
    expect(screen.getByRole("region", { name: "Additional on-site work steps" })).toHaveTextContent(`Project number: ${expected}`)
    expect(screen.queryByText("RPM job")).not.toBeInTheDocument()
  })
  it("keeps existing dated records displaying their work date", () => {
    render(<SwmsPrintDocument record={{ ...record, body: { ...record.body, date_tbc: false } }} attendees={[]} attachments={[]} />)
    expect(within(screen.getByText("Planned work date").closest(".print-field") as HTMLElement).getByText("4 Oct 2026")).toBeInTheDocument()
  })
  it("matches the template risk matrix and includes all five action levels", () => {
    render(<SwmsPrintDocument record={record} attendees={[]} attachments={[]} />)
    const matrix = screen.getByRole("table", { name: "Likelihood of being injured" })
    const rows = within(matrix).getAllByRole("row").slice(1)
    expect(rows.map(row => within(row).getAllByRole("cell").map(cell => Number(cell.textContent)))).toEqual([
      [5, 5, 4, 3, 3], [5, 4, 3, 3, 2], [4, 3, 3, 3, 2], [3, 3, 3, 2, 1], [3, 2, 2, 1, 1],
    ])
    expect(screen.getByText(/STOP ALL ACTIVITIES/)).toBeInTheDocument()
    expect(screen.getByText("Very Low Risk")).toBeInTheDocument()
  })
  it("includes a separate unfilled seven-row on-site sheet", () => {
    render(<SwmsPrintDocument record={record} attendees={[]} attachments={[]} />)
    const section = screen.getByRole("region", { name: "Additional on-site work steps" })
    const rows = within(section).getAllByRole("row").slice(1)
    expect(rows).toHaveLength(7)
    expect(rows.every(row => row.textContent?.trim() === "")).toBe(true)
  })
})

describe("work date validation", () => {
  it("uses an explicit prepared date or the original creation date in New Zealand", () => {
    expect(getPreparedDate(record)).toBe("2026-10-03")
    expect(getPreparedDate({ created_at: "2026-11-24T23:30:00Z" })).toBe("2026-11-25")
    expect(getPreparedDate({})).toBe("")
    expect(nzCalendarDate("2026-06-01T11:30:00Z")).toBe("2026-06-01")
  })
  it("allows unknown dates for SWMS while preserving normal date validation", () => {
    expect(hasWorkDate("", true)).toBe(true)
    expect(hasWorkDate("", false)).toBe(false)
    expect(hasWorkDate("2026-02-30", false)).toBe(false)
    expect(hasWorkDate("2026-10-04", false)).toBe(true)
    expect(isWorkDateTbc({ kind: "toolbox", body: { date_tbc: true } })).toBe(false)
    expect(isWorkDateTbc({ kind: "swms", body: { date_tbc: true } })).toBe(true)
    expect(isWorkDateTbc({ kind: "swms", body: {} })).toBe(false)
  })
})
