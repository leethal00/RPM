import { describe, expect, it } from "vitest"
import { canManagePlanning, formatHours, operationProgress, operationSchema } from "./planning"

const input = {
    job_id: "11111111-1111-4111-8111-111111111111", department_code: "cnc", name: "Cut panels", sequence: 10,
    status: "in_progress", estimated_hours: 8, due_date: null, progress_percent: 25, blocker_reason: null,
}

describe("production planning", () => {
    it("does not infer completion from consumed hours, including overruns", () => {
        const overrun = { status: "in_progress" as const, progress_percent: 25, estimated_hours: 8, actual_hours: 20 }
        expect(operationProgress(overrun)).toBe(25)
        expect(operationProgress({ ...overrun, progress_percent: null })).toBeNull()
        expect(operationProgress({ ...overrun, status: "complete" })).toBe(100)
    })
    it("distinguishes unknown hours from recorded zero", () => {
        expect(formatHours(null)).toBe("—")
        expect(formatHours(0)).toBe("0 h")
    })
    it("accepts estimates and progress being unknown", () => {
        expect(operationSchema.safeParse({ ...input, estimated_hours: null, progress_percent: null }).success).toBe(true)
    })
    it.each([
        { status: "made_up" }, { department_code: "sales" }, { estimated_hours: -1 },
        { progress_percent: 100 }, { progress_percent: 25.5 }, { name: "  " },
        { due_date: "2026-02-30" }, { sequence: -1 }, { job_id: "wrong" },
    ])("rejects invalid input: %j", change => {
        expect(operationSchema.safeParse({ ...input, ...change }).success).toBe(false)
    })
    it("requires an existing staff admin role", () => {
        expect(canManagePlanning("super_admin")).toBe(true)
        expect(canManagePlanning("rodier_admin")).toBe(true)
        for (const role of [null, "technician", "client_hq", "client_store", "department_operator"]) {
            expect(canManagePlanning(role)).toBe(false)
        }
    })
})
