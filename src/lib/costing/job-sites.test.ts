import { describe, expect, it } from "vitest"
import { jobSites, jobSiteNames } from "./job-sites"

describe("job sites", () => {
    it("keeps legacy single-site jobs and manufacture-only jobs working", () => {
        expect(jobSiteNames({ store_id: "one", stores: { name: "Timaru" } })).toBe("Timaru")
        expect(jobSites({ store_id: null })).toEqual([])
    })
    it("shows all linked sites in selection order without duplicating the primary", () => {
        const job = { store_id: "one", stores: { name: "Timaru" }, costing_job_sites: [
            { store_id: "two", sort: 1, stores: { id: "two", name: "Dunedin" } },
            { store_id: "one", sort: 0, stores: { id: "one", name: "Timaru" } },
        ] }
        expect(jobSites(job).map((site) => site.id)).toEqual(["one", "two"])
        expect(jobSiteNames(job)).toBe("Timaru; Dunedin")
    })
})
