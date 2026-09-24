import type { SupabaseClient } from "@supabase/supabase-js"
import type { DepartmentJob } from "./department-jobs"
import { actualDepartment, bomWork, type BomWorkLine, type WorkloadDepartment } from "./bom-workload"

type Job = {
    id: string; job_number: string | null; title: string; production_title: string | null
    completion_date: string | null; clients: { name: string } | null
}
type Entry = { job_id: string; hours: number; department_id: string | null; labour_type: string | null }

async function pages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>) {
    const rows: T[] = []
    for (let from = 0; ; from += 500) {
        const { data, error } = await fetchPage(from, from + 499)
        if (error) throw error
        rows.push(...(data ?? []) as T[])
        if (!data || data.length < 500) return rows
    }
}

/** Derive workloads without creating assignments or changing operator access. */
export async function loadDepartmentJobs(db: SupabaseClient, code: WorkloadDepartment, clientId: string | null): Promise<DepartmentJob[]> {
    const jobs = await pages<Job>((from, to) => {
        let query = db.from("costing_jobs")
            .select("id,job_number,title,production_title,completion_date,clients(name)")
            .in("status", ["approved", "in_progress"]).eq("is_template", false)
        if (clientId) query = query.eq("client_id", clientId)
        return query.order("id").range(from, to)
    })
    if (!jobs.length) return []
    const departments = await pages<{ id: string; code: string }>((from, to) =>
        db.from("departments").select("id,code").order("id").range(from, to))
    const departmentCodes = new Map(departments.map(row => [row.id, row.code]))
    const estimates = new Map<string, { hours: number | null; missing: boolean }>()
    const actuals = new Map<string, number>()
    for (let offset = 0; offset < jobs.length; offset += 100) {
        const ids = jobs.slice(offset, offset + 100).map(job => job.id)
        const lines = await pages<BomWorkLine>((from, to) => db.from("costing_lines")
            .select("job_id,section,subsection,description,qty,materials(is_labour,unit),costing_items(qty,mode)")
            .in("job_id", ids).order("id").range(from, to))
        for (const line of lines) {
            const work = bomWork(line)
            if (work?.department !== code) continue
            const estimate = estimates.get(line.job_id) ?? { hours: null, missing: false }
            if (work.hours === null) estimate.missing = true
            else estimate.hours = (estimate.hours ?? 0) + work.hours
            estimates.set(line.job_id, estimate)
        }
        const relevantIds = ids.filter(id => estimates.has(id))
        if (!relevantIds.length) continue
        const entries = await pages<Entry>((from, to) => db.from("costing_time_entries")
            .select("job_id,hours,department_id,labour_type").in("job_id", relevantIds).order("id").range(from, to))
        for (const entry of entries) {
            // An explicit department wins; generic Workshop/Admin/Other remains unallocated.
            const department = actualDepartment(entry.department_id
                ? departmentCodes.get(entry.department_id) ?? "" : entry.labour_type ?? "")
            if (department === code) actuals.set(entry.job_id, (actuals.get(entry.job_id) ?? 0) + Number(entry.hours))
        }
    }
    return jobs.filter(job => estimates.has(job.id)).map(job => ({
        id: job.id, number: job.job_number, title: job.production_title?.trim() || job.title,
        client: job.clients?.name ?? null, due: job.completion_date,
        estimated: estimates.get(job.id)!.hours, actual: actuals.get(job.id) ?? null,
        missingEstimates: estimates.get(job.id)!.missing,
    })).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.title.localeCompare(b.title))
}
