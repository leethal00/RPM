import { describe, expect, it } from "vitest"
import { totalBomHours } from "./bom-hours"
import { bomTotals, effectiveBuildSell, sellMargin } from "./pricing"

describe("build item final pricing", () => {
    it("keeps the calculated price until a manual final price is saved", () => {
        const cost = 62.57
        const calculatedSell = 78.90

        expect(effectiveBuildSell(calculatedSell, 0)).toBe(78.90)
        expect(sellMargin(cost, effectiveBuildSell(calculatedSell, 0))).toBeCloseTo(0.207, 3)

        const finalSell = effectiveBuildSell(calculatedSell, 85)
        expect(finalSell).toBe(85)
        expect(calculatedSell).toBe(78.90)
        expect(cost).toBe(62.57)
        expect(sellMargin(cost, finalSell)).toBeCloseTo(0.2639, 3)

        expect(effectiveBuildSell(calculatedSell, 0)).toBe(78.90)
    })

    it("continues to use a saved final price when the BOM calculation changes", () => {
        expect(effectiveBuildSell(92, 85)).toBe(85)
        expect(effectiveBuildSell(92, 0)).toBe(92)
    })
})

describe("BOM summary", () => {
    it("adds each line sell, including quantity and unit overrides, independently of the item price", () => {
        const lines = [
            { section: "Materials", material_id: null, qty: 1, unit_cost: 80, markup: 0.5, unit_sell_override: null },
            { section: "Labour", material_id: null, qty: 0.5, unit_cost: 110, markup: 0.1, unit_sell_override: null },
            { section: "Labour", material_id: null, qty: 1, unit_cost: 75, markup: 0.2, unit_sell_override: null },
            { section: "Labour", material_id: null, qty: 16, unit_cost: 75, markup: 0.2, unit_sell_override: 90 },
            { section: "Labour", material_id: null, qty: 0.5, unit_cost: 75, markup: 0.2, unit_sell_override: null },
        ]
        const totals = bomTotals(lines)

        expect(totals.cost).toBe(1447.5)
        expect(totals.sell).toBe(1755.5)
        expect(totals.margin).toBeCloseTo(0.17545, 5)
        expect(totalBomHours(lines, {})).toBe(18)
        expect(effectiveBuildSell(totals.sell, 90)).toBe(90)
    })

    it("honours a line's unit sell override in the total", () => {
        expect(bomTotals([{ qty: 2, unit_cost: 50, markup: 0.2, unit_sell_override: 75 }]).sell).toBe(150)
    })
})
