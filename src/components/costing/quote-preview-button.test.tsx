import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const state = vi.hoisted(() => ({ reads: [] as string[] }))

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        from: (table: string) => {
            state.reads.push(table)
            if (table === "costing_jobs") return { select: () => ({ eq: () => ({ single: async () => ({ data: { title: "Sign package", details: "Manufacture signs", contact_name: "Pat" }, error: null }) }) }) }
            if (table === "costing_items") return { select: () => ({ eq: () => ({ order: async () => ({ data: [
                { id: "heading", name: "Manufacture", sign_code: "__RPM_SECTION_HEADING__", qty: 0 },
                { id: "item", name: "Plinth", mode: "build", qty: 2, unit_price: 0, details: "Plinth: Acrylic face" },
            ], error: null }) }) }) }
            if (table === "costing_lines") return { select: () => ({ eq: async () => ({ data: [
                { item_id: "item", qty: 2, unit_cost: 40, markup: 0.5, unit_sell_override: null },
            ], error: null }) }) }
            throw new Error(`Unexpected table ${table}`)
        },
    }),
}))

import { QuotePreviewButton } from "./quote-preview-button"

describe("RPM quote preview", () => {
    beforeEach(() => {
        state.reads = []
        vi.stubGlobal("fetch", vi.fn())
    })
    afterEach(() => vi.unstubAllGlobals())

    it("shows current quote lines and prices without calling Xero", async () => {
        render(<QuotePreviewButton jobId="job-1" />)
        fireEvent.click(screen.getByRole("button", { name: "Preview quote" }))
        expect(await screen.findByText(/Sign package\s+Manufacture signs\s+Contact: Pat/)).toBeInTheDocument()
        expect(screen.getByText("1. MANUFACTURE")).toBeInTheDocument()
        expect(screen.getByText(/Plinth\s+Qty: 2\s+Details: Acrylic face/)).toBeInTheDocument()
        expect(screen.getByText("$120.00")).toBeInTheDocument()
        expect(screen.getAllByText("$240.00")).toHaveLength(2)
        expect(state.reads).toEqual(["costing_jobs", "costing_items", "costing_lines"])
        expect(fetch).not.toHaveBeenCalled()
    })
})
