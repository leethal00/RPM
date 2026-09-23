import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import JobCardPage from "./page"

let selectedItemId: string | null = null

const items = [
  { id: "first", name: "Front sign", sign_code: null, mode: "build", qty: 1, build_qty: 1, size: null, details: null, delivery: null, internal_notes: "Use the blue backing\nCheck the wiring", sort: 1, image_path: null },
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
          order: async () => ({ data: table === "costing_items" ? items : [] }),
        }),
      }),
    }),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  }),
}))

describe("production job card internal BOM notes", () => {
  beforeEach(() => { selectedItemId = null })

  it("shows each private note on the full job card", async () => {
    render(<JobCardPage />)

    expect(await screen.findByText("Use the blue backing", { exact: false })).toBeInTheDocument()
    expect(screen.getByText("Keep this note private", { exact: false })).toBeInTheDocument()
    expect(screen.getByText("INTERNAL BOM NOTES")).toBeInTheDocument()
  })

  it("shows only the selected BOM item's note on its job card", async () => {
    selectedItemId = "first"
    render(<JobCardPage />)

    expect(await screen.findByText("Use the blue backing", { exact: false })).toBeInTheDocument()
    expect(screen.queryByText("Keep this note private", { exact: false })).not.toBeInTheDocument()
  })
})
