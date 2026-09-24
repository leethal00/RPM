import { describe, expect, it } from "vitest"
import { bomWork, actualDepartment, type BomWorkLine } from "./bom-workload"
const line = (description: string, patch: Partial<BomWorkLine> = {}): BomWorkLine => ({ job_id: "job", section: "Labour", subsection: "Factory Time", description, qty: 3, materials: { is_labour: true, unit: null }, costing_items: { qty: 2, mode: "build" }, ...patch })
describe("BOM workload routing", () => {
    it.each([
        ["Design/Drawing/Programming", "cnc"], ["CNC Router - Machine time", "cnc"],
        ["Metal Fabrication - Cutting materials, prepwork, sanding etc", "metalshop"], ["Metal Welding - Welding time only", "metalshop"],
        ["Acrylic Fabrication - Face returns", "fabrication"], ["Wiring time", "fabrication"], ["Painting - Inhouse painting time including prep", "fabrication"],
        ["Assembly - Final assembly", "fabrication"], ["Site Time Labour - Primary Customer", "installation"],
    ])("routes %s and multiplies item quantity once", (description, department) => {
        expect(bomWork(line(description))).toEqual({ department, hours: 6 })
    })
    it.each(["Km rate - Escalated", "Callout/Travel Auckland Metro", "Project Management", "Travel time for Powdercoat", "General Factory - Misc time"])("does not guess hours for %s", description => {
        expect(bomWork(line(description))).toBeNull()
    })
    it("includes site travel hours but excludes kilometre charges in the same section", () => {
        expect(bomWork(line("Travel Labour", { subsection: "Install Time" }))?.hours).toBe(6)
        expect(bomWork(line("Km rate", { subsection: "Install Time" }))).toBeNull()
    })
    it("ignores material quantities and unused or zero-quantity BOM lines", () => {
        expect(bomWork(line("Metal sanding discs", { section: "Materials", materials: { is_labour: false, unit: null } }))).toBeNull()
        expect(bomWork(line("CNC", { qty: 0 }))).toBeNull()
        expect(bomWork(line("CNC", { costing_items: { qty: 0, mode: "build" } }))).toBeNull()
        expect(bomWork(line("CNC", { costing_items: { qty: 1, mode: "simple" } }))).toBeNull()
    })
    it("supports legacy job-level BOMs and marks non-hour units unknown", () => {
        expect(bomWork(line("CNC", { costing_items: null }))?.hours).toBe(3)
        expect(bomWork(line("CNC", { materials: { is_labour: true, unit: "each" } }))).toEqual({ department: "cnc", hours: null })
    })
    it("combines known actual departments without allocating generic workshop time", () => {
        expect(actualDepartment("Design")).toBe("cnc")
        expect(actualDepartment("Welding")).toBe("metalshop")
        expect(actualDepartment("Install")).toBe("installation")
        expect(actualDepartment("Workshop")).toBeNull()
    })
})
