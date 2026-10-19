import { render, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import JobCardPage from "./page"

let selectedItemId: string | null = null
let lines: { id: string; item_id: string; section: string; subsection: string; description: string; qty: number; materials: null }[] = []

const items = [
  { id: "first", name: "Front sign", sign_code: null, mode: "build", qty: 1, build_qty: 1, size: null, details: null, delivery: null, internal_notes: "Use the blue backing\nCheck the wiring", sort: 1, image_path: "drawings/front.png" },
  { id: "second", name: "Side sign", sign_code: null, mode: "build", qty: 1, build_qty: 1, size: null, details: null, delivery: null, internal_notes: "Keep this note private", sort: 2, image_path: null },
]

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "job" }),
  useSearchParams: () => ({ get: () => selectedItemId }),
}))

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: "job", title: "Signs", created_at: "2026-09-24", clients: { name: "Client" }, stores: null } }),
          order: async () => ({ data: table === "costing_items" ? items : lines }),
        }),
      }),
    }),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "https://example.test/drawing.png" } }) }) },
  }),
}))

describe("production job card internal BOM notes", () => {
  beforeEach(() => { selectedItemId = null; lines = [] })

  it("shows each private note on the full job card", async () => {
    const { container } = render(<JobCardPage />)
    const card = await waitFor(() => {
      const visibleCard = container.querySelector<HTMLElement>(".job-card-sheet")
      expect(visibleCard).not.toBeNull()
      return within(visibleCard!)
    })

    const firstNote = card.getByText("Use the blue backing", { exact: false })
    expect(firstNote).not.toHaveTextContent("Front sign")
    expect(card.getByText("Front sign")).toBeInTheDocument()
    expect(card.getByText("Side sign")).toBeInTheDocument()
    expect(card.getByText("Keep this note private", { exact: false })).toBeInTheDocument()
    expect(card.queryByText("INTERNAL BOM NOTES")).not.toBeInTheDocument()
  })

  it("shows only the selected BOM item's note on its job card", async () => {
    selectedItemId = "first"
    const { container } = render(<JobCardPage />)
    const card = await waitFor(() => {
      const visibleCard = container.querySelector<HTMLElement>(".job-card-sheet")
      expect(visibleCard).not.toBeNull()
      return within(visibleCard!)
    })

    expect(card.getByText("Use the blue backing", { exact: false })).toBeInTheDocument()
    expect(card.getByText("Front sign")).toBeInTheDocument()
    expect(card.queryByText("Side sign")).not.toBeInTheDocument()
    expect(card.queryByText("Keep this note private", { exact: false })).not.toBeInTheDocument()
  })

  it("keeps the attached drawing in colour while rendering the job-card header in monochrome", async () => {
    selectedItemId = "first"
    const { container } = render(<JobCardPage />)
    const card = await waitFor(() => {
      const visibleCard = container.querySelector<HTMLElement>(".job-card-sheet")
      expect(visibleCard).not.toBeNull()
      return visibleCard!
    })
    expect(within(card).getByRole("img", { name: "Drawing of Front sign" })).toHaveClass("job-card-drawing")
    expect(within(card).getByRole("img", { name: "Rodier" })).toHaveClass("grayscale")
    expect(container.querySelector("style")?.textContent).toContain("img:not(.job-card-drawing) { filter: grayscale(1); }")
  })

  it("fits a sheet again immediately before printing when its content grows", async () => {
    const { container } = render(<JobCardPage />)
    const sheet = await waitFor(() => {
      const safety = container.querySelector<HTMLElement>(".safety-sheet")
      expect(safety).not.toBeNull()
      return safety!
    })
    const content = sheet.querySelector<HTMLElement>(".sheet-content")!
    Object.defineProperty(sheet, "clientHeight", { configurable: true, value: 1122 })
    Object.defineProperty(content, "scrollHeight", { configurable: true, value: 1200 })

    window.dispatchEvent(new Event("beforeprint"))

    const scale = Number(content.style.getPropertyValue("--job-card-fit"))
    expect(scale).toBeGreaterThan(0.9)
    expect(scale).toBeLessThan(1)
  })

  it("adds a printable electrical check sheet when the selected BOM includes wiring", async () => {
    selectedItemId = "first"
    lines = [{ id: "led", item_id: "first", section: "Electrical", subsection: "LED", description: "LED modules", qty: 20, materials: null }]
    const { container } = render(<JobCardPage />)
    await waitFor(() => expect(container.querySelector(".electrical-check-sheet")).not.toBeNull())
    const sheets = container.querySelectorAll<HTMLElement>(".electrical-check-sheet")
    expect(sheets).toHaveLength(2)
    expect(within(sheets[0]).getByText("CIRCUIT DIAGRAM / SKETCH")).toBeInTheDocument()
    expect(within(sheets[1]).getByText("Type of LEDs used:")).toBeInTheDocument()
    expect(within(sheets[1]).getByText("Soak tested (1 hour minimum) by:")).toBeInTheDocument()
    expect(within(sheets[1]).getByText("All connections are crimped and insulated correctly", { exact: false })).toBeInTheDocument()
  })

  it("does not add an electrical check sheet for a non-electrical build", async () => {
    selectedItemId = "second"
    const { container } = render(<JobCardPage />)
    await waitFor(() => expect(container.querySelector(".safety-sheet")).not.toBeNull())
    expect(container.querySelector(".electrical-check-sheet")).toBeNull()
  })
})
