import { describe, expect, it } from "vitest"
import { departmentJobs } from "./department-jobs"
import type { PlanningOperation } from "./planning"

const operation = (changes: Partial<PlanningOperation> = {}) => ({
    job_id: "job-1", job_number: "26418", job_title: "Plinths", client_name: "Client",
    job_status: "in_progress", status: "ready", estimated_hours: 4, actual_hours: null,
    effective_due_date: "2026-10-02", ...changes,
} as PlanningOperation)

describe("department to-do list", () => {
    it("groups stages into one job and retains completed-stage hours", () => {
        const rows = departmentJobs([
            operation({ status: "complete", actual_hours: 5, effective_due_date: "2026-09-01" }),
            operation({ estimated_hours: 3, actual_hours: 0 }),
        ])
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ estimated: 7, actual: 5, due: "2026-10-02" })
    })
    it("excludes finished departments and closed jobs", () => {
        expect(departmentJobs([operation({ status: "complete" }), operation({ job_id: "job-2", job_status: "invoiced" })])).toEqual([])
    })
    it("keeps unknown values distinct from zero and labels partial estimates", () => {
        expect(departmentJobs([operation({ estimated_hours: null })])[0]).toMatchObject({ estimated: null, actual: null })
        expect(departmentJobs([operation({ estimated_hours: 0, actual_hours: 0 }), operation({ estimated_hours: null })])[0]).toMatchObject({ estimated: 0, actual: 0, missingEstimates: true })
    })
    it("orders jobs by their next due date, with undated jobs last", () => {
        const rows = departmentJobs([operation({ job_id: "later", effective_due_date: null }), operation()])
        expect(rows.map(row => row.id)).toEqual(["job-1", "later"])
    })
})
