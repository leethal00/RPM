import { describe, it, expect } from "vitest"
import { computeHealthScore, computeTrafficLight } from "@/lib/health-score"

const yesterday = () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
}
const tomorrow = () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
}

describe("computeHealthScore", () => {
    it("returns unknown when nothing joined", () => {
        expect(computeHealthScore({}).label).toBe("unknown")
    })

    it("starts at 100 for a clean site with assets", () => {
        const r = computeHealthScore({ assets: [{ next_service_date: tomorrow() }], jobs: [] })
        expect(r.score).toBe(100)
        expect(r.label).toBe("healthy")
    })

    it("deducts for active faults", () => {
        const r = computeHealthScore({
            assets: [{ next_service_date: tomorrow() }],
            jobs: [{ status: "open", job_type: "fault" }],
        })
        expect(r.score).toBe(90)
    })

    it("deducts for overdue PMs", () => {
        const r = computeHealthScore({
            assets: [{ next_service_date: yesterday() }],
            jobs: [],
        })
        expect(r.score).toBe(95)
    })
})

describe("computeTrafficLight", () => {
    it("returns unknown when nothing joined", () => {
        expect(computeTrafficLight({})).toBe("unknown")
    })

    it("returns green when nothing is overdue and no faults", () => {
        expect(
            computeTrafficLight({
                assets: [{ next_service_date: tomorrow() }],
                jobs: [],
            }),
        ).toBe("green")
    })

    it("returns orange for an overdue PM", () => {
        expect(
            computeTrafficLight({
                assets: [{ next_service_date: yesterday() }],
                jobs: [],
            }),
        ).toBe("orange")
    })

    it("returns red for an open fault, even if a PM is also overdue", () => {
        expect(
            computeTrafficLight({
                assets: [{ next_service_date: yesterday() }],
                jobs: [{ status: "open", job_type: "fault" }],
            }),
        ).toBe("red")
    })

    it("treats in_progress jobs as red", () => {
        expect(
            computeTrafficLight({
                assets: [],
                jobs: [{ status: "in_progress", job_type: "fault" }],
            }),
        ).toBe("red")
    })

    it("ignores closed jobs", () => {
        expect(
            computeTrafficLight({
                assets: [{ next_service_date: tomorrow() }],
                jobs: [{ status: "closed", job_type: "fault" }],
            }),
        ).toBe("green")
    })

    it("treats job_type=null as a fault for safety", () => {
        expect(
            computeTrafficLight({
                assets: [],
                jobs: [{ status: "open", job_type: null }],
            }),
        ).toBe("red")
    })
})
