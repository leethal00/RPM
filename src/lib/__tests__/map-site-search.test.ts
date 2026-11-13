import { describe, expect, it } from "vitest"
import { matchesMapSiteSearch } from "../map-site-search"
import type { Store } from "@/types/database"

describe("map site search", () => {
    const site = { name: "Palmerston North", address: "Main Street", client_id: "mcd", region: "Manawatu" } as Store
    it("finds a customer's sites even when the site name omits the customer", () => {
        expect(matchesMapSiteSearch(site, "mcdonalds", "McDonald’s")).toBe(true)
        expect(matchesMapSiteSearch(site, "McDonald's Palmerston", "McDonald’s")).toBe(true)
        expect(matchesMapSiteSearch(site, "mcdonalds", "Timezone")).toBe(false)
    })
    it("matches address, region and brands without requiring optional relations", () => {
        expect(matchesMapSiteSearch(site, "  MAIN STREET ")).toBe(true)
        expect(matchesMapSiteSearch(site, "Manawatu")).toBe(true)
        expect(matchesMapSiteSearch({ ...site, store_brands: [{ client_brands: { label: "McDonald's" } }] } as Store, "mcdonalds")).toBe(true)
    })
})
