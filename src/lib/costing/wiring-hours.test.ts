import { describe, expect, it } from "vitest"
import { WIRING_MODULES_PER_HOUR, wiringHours } from "./wiring-hours"

describe("wiring labour estimate", () => {
    it("uses 25 modules per hour", () => {
        expect(WIRING_MODULES_PER_HOUR).toBe(25)
        expect(wiringHours(480).toFixed(2)).toBe("19.20")
    })
})
