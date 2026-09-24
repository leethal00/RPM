import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { loadDepartmentJobs } from "./load-department-jobs"

function database(assignments: unknown[], entries: unknown[], department: unknown = { id: "cnc-id" }) {
    const calls: unknown[][] = []
    const db = { from: vi.fn((table: string) => {
        const query = {
            select: () => query, eq: (key: string, value: unknown) => { calls.push([table, key, value]); return query },
            lt: (key: string, value: unknown) => { calls.push([table, key, value]); return query },
            in: (key: string, value: unknown) => { calls.push([table, key, value]); return query },
            order: () => query,
            maybeSingle: async () => ({ data: department, error: null }),
            range: async (from: number, to: number) => ({ data: (table === "department_jobs" ? assignments : entries).slice(from, to + 1), error: null }),
        }
        return query
    }) }
    return { db: db as unknown as SupabaseClient, calls, from: db.from }
}
const assignment = (id: string) => ({ estimated_hours: 4, progress: 0,
    costing_jobs: { id, job_number: "26418", title: "Original", production_title: "Workshop title", completion_date: "2026-10-02", clients: { name: "Client" } } })

describe("department assignment summary", () => {
    it("uses assigned department estimates and sums department actuals", async () => {
        const { db, calls } = database([assignment("job")], [{ job_id: "job", hours: 2 }, { job_id: "job", hours: 3.5 }])
        expect(await loadDepartmentJobs(db, "cnc", "client-id")).toEqual([{
            id: "job", number: "26418", title: "Workshop title", client: "Client", due: "2026-10-02", estimated: 4, actual: 5.5, missingEstimates: false,
        }])
        expect(calls).toContainEqual(["costing_time_entries", "department_id", "cnc-id"])
        expect(calls).toContainEqual(["department_jobs", "costing_jobs.client_id", "client-id"])
        expect(calls).toContainEqual(["department_jobs", "progress", 100])
        expect(calls).toContainEqual(["department_jobs", "costing_jobs.status", ["approved", "in_progress"]])
    })
    it("distinguishes absent actuals from recorded zero", async () => {
        const { db } = database([assignment("none"), assignment("zero")], [{ job_id: "zero", hours: 0 }])
        const rows = await loadDepartmentJobs(db, "cnc", null)
        expect(rows.find(row => row.id === "none")?.actual).toBeNull()
        expect(rows.find(row => row.id === "zero")?.actual).toBe(0)
    })
    it("paginates actuals without truncating at the response limit", async () => {
        const { db } = database([assignment("job")], Array.from({ length: 501 }, () => ({ job_id: "job", hours: 1 })))
        expect((await loadDepartmentJobs(db, "cnc", null))[0].actual).toBe(501)
    })
    it("leaves unconfigured departments empty", async () => {
        const { db, from } = database([], [], null)
        expect(await loadDepartmentJobs(db, "assembly", null)).toEqual([])
        expect(from).toHaveBeenCalledTimes(1)
    })
})
