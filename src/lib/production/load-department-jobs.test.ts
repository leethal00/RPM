import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { loadDepartmentJobs } from "./load-department-jobs"

type Row = Record<string, unknown>
function database(tables: Record<string, Row[]>, failure?: string) {
    const calls: unknown[][] = []
    const db = { from(table: string) {
        let rows = tables[table] ?? []
        const query = {
            select: () => query,
            eq: (key: string, value: unknown) => { calls.push([table, key, value]); rows = rows.filter(row => row[key] === value); return query },
            in: (key: string, values: unknown[]) => { calls.push([table, key, values]); rows = rows.filter(row => values.includes(row[key])); return query },
            order: () => query,
            range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: table === failure ? new Error("Unavailable") : null }),
        }
        return query
    } }
    return { db: db as unknown as SupabaseClient, calls }
}
const job = (id = "job", patch: Row = {}) => ({ id, job_number: "26418", title: "Original", production_title: "Workshop title", completion_date: "2026-10-02", clients: { name: "Client" }, status: "approved", is_template: false, client_id: "client", ...patch })
const line = (job_id = "job", description = "CNC Router", qty = 4) => ({ job_id, description, qty, section: "Labour", subsection: "Factory Time", materials: null, costing_items: { qty: 1, mode: "build" } })
const entry = (hours: number, patch: Row = {}) => ({ job_id: "job", hours, department_id: null, labour_type: "Design", ...patch })
describe("BOM department loader", () => {
    it("combines CNC/design BOMs and actuals with no assignments or configured department required", async () => {
        const { db, calls } = database({ costing_jobs: [job()], costing_lines: [line(), line("job", "Design", 2)], costing_time_entries: [entry(1), entry(2, { labour_type: "Workshop" })] })
        expect(await loadDepartmentJobs(db, "cnc", "client")).toEqual([{ id: "job", number: "26418", title: "Workshop title", client: "Client", due: "2026-10-02", estimated: 6, actual: 1, missingEstimates: false }])
        expect(calls).toContainEqual(["costing_jobs", "client_id", "client"])
        expect(calls.some(call => call[0] === "department_jobs")).toBe(false)
    })
    it("excludes inactive jobs, templates, other customers and unrelated BOMs", async () => {
        const excluded = [job("closed", { status: "complete" }), job("template", { is_template: true }), job("other", { client_id: "other" })]
        const { db } = database({ costing_jobs: [job(), ...excluded], costing_lines: [line("job", "Metal Welding"), ...excluded.map(j => line(j.id as string))] })
        expect(await loadDepartmentJobs(db, "cnc", "client")).toEqual([])
    })
    it("uses explicit department before labour type and retains recorded zero", async () => {
        const { db } = database({ costing_jobs: [job(), job("none")], costing_lines: [line(), line("none")], departments: [{ id: "metal", code: "metalwork" }, { id: "cnc", code: "cnc" }], costing_time_entries: [entry(9, { department_id: "metal" }), entry(0, { department_id: "cnc", labour_type: "Workshop" })] })
        const rows = await loadDepartmentJobs(db, "cnc", null)
        expect(rows.find(row => row.id === "job")?.actual).toBe(0)
        expect(rows.find(row => row.id === "none")?.actual).toBeNull()
    })
    it("paginates BOMs and time entries independently", async () => {
        const { db } = database({ costing_jobs: [job()], costing_lines: Array.from({length: 501}, () => line("job", "Design", 1)), costing_time_entries: Array.from({length: 501}, () => entry(1)) })
        const [row] = await loadDepartmentJobs(db, "cnc", null)
        expect(row.estimated).toBe(501)
        expect(row.actual).toBe(501)
    })
    it("paginates jobs and bounds job-id batches", async () => {
        const jobs = Array.from({length: 501}, (_, i) => job(String(i)))
        const { db, calls } = database({ costing_jobs: jobs, costing_lines: jobs.map(j => line(j.id)) })
        expect(await loadDepartmentJobs(db, "cnc", null)).toHaveLength(501)
        expect(calls.filter(call => call[1] === "job_id").every(call => (call[2] as unknown[]).length <= 100)).toBe(true)
    })
    it("marks partial estimates and propagates read failures", async () => {
        const tables = { costing_jobs: [job()], costing_lines: [line(), {...line(), materials: { is_labour: true, unit: "each" }}] }
        expect((await loadDepartmentJobs(database(tables).db, "cnc", null))[0]).toMatchObject({ estimated: 4, missingEstimates: true })
        await expect(loadDepartmentJobs(database(tables, "costing_lines").db, "cnc", null)).rejects.toThrow("Unavailable")
    })
})
