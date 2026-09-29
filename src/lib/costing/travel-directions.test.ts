import { describe, expect, it } from "vitest"
import { googleMapsDirectionsUrl, isTravelMileageBom } from "./travel-directions"

describe("travel directions", () => {
    it("recognises only the exact product name, ignoring case and extra whitespace", () => {
        expect(isTravelMileageBom({ mode: "build", name: "  TRAVEL   & mileage  " })).toBe(true)
        expect(isTravelMileageBom({ mode: "build", name: "Travel & mileage signage" })).toBe(false)
        expect(isTravelMileageBom({ mode: "simple", name: "Travel & mileage" })).toBe(false)
        expect(isTravelMileageBom(null)).toBe(false)
    })

    it.each([undefined, "", "   "])("omits an unconfigured origin (%s)", (origin) => {
        const url = new URL(googleMapsDirectionsUrl("  12 Queen Street, Auckland  ", origin))
        expect(Object.fromEntries(url.searchParams)).toEqual({ api: "1", destination: "12 Queen Street, Auckland", travelmode: "driving" })
    })
})
