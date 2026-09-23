import { describe, expect, it } from "vitest"
import { effectiveBuildSell, sellMargin } from "./pricing"

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
