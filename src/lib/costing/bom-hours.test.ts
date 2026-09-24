import { describe, expect, it } from "vitest"
import { isHourUnit, totalBomHours } from "./bom-hours"

describe("BOM hours", () => {
    it("adds hour quantities while retaining kilometre and other quantities on their lines", () => {
        const lines = [
            { section: "Labour", qty: 0.5, material_id: "setup" },
            { section: "Labour", qty: 1.5, material_id: "site" },
            { section: "Labour", qty: 0.5, material_id: null },
            { section: "Labour", qty: 70.6, material_id: "km-rate-escalated" },
            { section: "Labour", qty: 12, material_id: "km-rate" },
            { section: "Labour", qty: 3, material_id: "charge" },
            { section: "Materials", qty: 10, material_id: "setup" },
        ]
        expect(totalBomHours(lines, { setup: " h ", site: "HOURS", "km-rate": "km", "km-rate-escalated": "km", charge: "each" })).toBe(2.5)
        expect(lines[3].qty).toBe(70.6)
    })

    it("keeps the legacy hour convention when a labour catalogue unit is missing", () => {
        expect(isHourUnit(null)).toBe(true)
        expect(isHourUnit(undefined)).toBe(true)
        expect(isHourUnit("hr")).toBe(true)
        expect(isHourUnit("metres")).toBe(false)
        expect(totalBomHours([{ section: "Labour", qty: 1.25, material_id: "legacy" }], {})).toBe(1.25)
    })
})
