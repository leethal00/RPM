import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import JobSummaryPage from "./page"

const state = vi.hoisted(() => ({ mode: "simple", details: "To CNC supplied 4x2 sheet of 4.5mm opal\n1@ 3995x590mm" }))
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "test-job" }) }))
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: "test-job", title: "Acrylic cut to size", details: state.details, job_number: "7635", created_at: "2026-10-21" } }),
          order: async () => ({ data: table === "costing_items" ? [{ id: "programming", name: "Programming Time", mode: state.mode, qty: 0.25, details: "Programming time", sign_code: null }] : [] }),
        }),
      }),
    }),
  }),
}))

afterEach(cleanup)

describe("printed job summary", () => {
  it("renders the overall scope once above the unchanged simple-line table", async () => {
    state.mode = "simple"
    render(<JobSummaryPage />)
    const heading = await screen.findByText("JOB DESCRIPTION")
    const description = heading.nextElementSibling!
    expect(description.textContent).toBe(state.details)
    expect(description).toHaveClass("whitespace-pre-wrap", "break-words")
    expect(screen.getByRole("table").textContent).toContain("Programming time")
    expect(screen.getByRole("table").textContent).toContain("0.25")
    expect(screen.getAllByText("JOB DESCRIPTION")).toHaveLength(1)
    expect(heading.closest(".sheet")).toBeTruthy()
  })

  it("keeps build summaries free of the additional scope block", async () => {
    state.mode = "build"
    render(<JobSummaryPage />)
    await screen.findByRole("table")
    expect(screen.queryByText("JOB DESCRIPTION")).not.toBeInTheDocument()
  })
})
