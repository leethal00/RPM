import { describe, expect, it } from "vitest"
import { autoHeatShrinkNote, crimpHeatShrinkAllowance, hasManualHeatShrink } from "./crimp-heat-shrink"

describe("automatic crimp heat shrink allowance", () => {
    it("allows 50 mm of 6.4 mm for each red or blue crimp and 9.6 mm for each yellow crimp", () => {
        const result = crimpHeatShrinkAllowance([
            { description: "Crimps, Red inline, 0.5-1.5mm, Each (Pack of 50)", qty: 2 },
            { description: "Crimps, Blue inline, 1.5-2.5mm, Each (Pack of 50)", qty: 1 },
            { description: "Crimps, Yellow inline, 2.5-6mm, Each (Pack of 50)", qty: 3 },
        ])
        expect(result).toEqual({ "6.4": 0.125, "9.6": 0.125 })
    })

    it("ignores unrelated and generated rows so recalculation is idempotent", () => {
        expect(crimpHeatShrinkAllowance([
            { description: "Crimps, Blue inline", qty: 1 },
            { description: "Heat Shrink - OHUG Dualwall, 6.4mm, 1.2m", qty: 0.0417, internal_note: autoHeatShrinkNote("6.4") },
            { description: "Crimps, Yellow inline", qty: 0 },
            { description: "General wiring charge", qty: 5 },
        ])).toEqual({ "6.4": 0.0417, "9.6": 0 })
    })

    it("preserves existing hand-entered heat shrink instead of charging it twice", () => {
        const lines = [
            { description: "Heat Shrink - OHUG Dualwall, 6.4mm, 1.2m", qty: 0.25 },
            { description: "Heat Shrink - OHUG Dualwall, 9.6mm, 1.2m", qty: 0.0417, internal_note: autoHeatShrinkNote("9.6") },
        ]
        expect(hasManualHeatShrink(lines, "6.4")).toBe(true)
        expect(hasManualHeatShrink(lines, "9.6")).toBe(false)
    })
})
