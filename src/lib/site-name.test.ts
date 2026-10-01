import { describe, expect, it } from "vitest"
import { sortSitesByDisplayName } from "./site-name"

describe("site dropdown order", () => {
    it("sorts McDonald's sites by the names shown in the dropdown", () => {
        const sites = [
            { id: "manukau", name: "McDonalds Manukau Mall" },
            { id: "manurewa", name: "McDonalds Manurewa" },
            { id: "cross", name: "McDonalds 5 Cross Roads" },
            { id: "andersons", name: "Andersons Bay" },
        ]

        expect(sortSitesByDisplayName(sites, "McDonalds").map((site) => site.id)).toEqual([
            "cross", "andersons", "manukau", "manurewa",
        ])
        expect(sites[0].id).toBe("manukau")
    })
})
