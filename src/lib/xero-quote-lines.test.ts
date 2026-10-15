import { describe, expect, it } from "vitest"
import { buildXeroQuoteLines, type QuoteItem } from "./xero-quote-lines"

describe("Xero quote revisions", () => {
    it("sends the same rounded default shown for a new BOM, while preserving manual prices", () => {
        const items: QuoteItem[] = [
            { id: "new", name: "New build", mode: "build", qty: 2, unit_price: 0, round_final_sell_to_five: true },
            { id: "manual", name: "Manual build", mode: "build", qty: 1, unit_price: 123.45, round_final_sell_to_five: true },
            { id: "old", name: "Existing build", mode: "build", qty: 1, unit_price: 0, round_final_sell_to_five: false },
        ]
        const costs = items.map((item) => ({ item_id: item.id, qty: 1, unit_cost: 121.01, markup: 0, unit_sell_override: null }))
        const lines = buildXeroQuoteLines({ title: "Test" }, items, costs)
        expect(lines.slice(1).map((line) => line.UnitAmount)).toEqual([125, 123.45, 121.01])
    })

    it("omits zero-quantity options and empty revision sections", () => {
        const section = (id: string, name: string): QuoteItem => ({ id, name, qty: 1, sign_code: "__RPM_SECTION_HEADING__" })
        const build = (id: string, name: string, qty: number, unit_price: number): QuoteItem => ({ id, name, qty, unit_price, mode: "build" })
        const lines = buildXeroQuoteLines({ title: "Glass Projects - Acrylic logo" }, [
            section("rev0", "Rev0"),
            build("old-10", "Old 10mm logo", 0, 463.75),
            build("old-15", "Old 15mm logo", 0, 583.11),
            section("rev1", "REV1"),
            build("old-logo", "Old logo", 0, 846.32),
            build("text", "Acrylic text", 1, 426.63),
            section("rev2", "Rev2"),
            build("logo", "Current logo", 1, 927.84),
        ], [])

        expect(lines).toEqual([
            { Description: "Glass Projects - Acrylic logo" },
            { Description: "--" }, { Description: "1. REV1" },
            { Description: "Acrylic text\nQty: 1", Quantity: 1, UnitAmount: 426.63, AccountCode: "200", TaxType: "OUTPUT2" },
            { Description: "--" }, { Description: "2. REV2" },
            { Description: "Current logo\nQty: 1", Quantity: 1, UnitAmount: 927.84, AccountCode: "200", TaxType: "OUTPUT2" },
        ])
        expect(lines.reduce((total, line) => total + (line.Quantity ?? 0) * (line.UnitAmount ?? 0), 0)).toBe(1354.47)
    })
})
