import type { SupabaseClient } from "@supabase/supabase-js"
import type { DepartmentCode } from "./planning"
import type { DepartmentJob } from "./department-jobs"

type Assignment = {
    estimated_hours: number | null
    progress: number
    costing_jobs: {
        id: string; job_number: string | null; title: string; production_title: string | null
        completion_date: string | null; clients: { name: string } | null
    }
}

async function pages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>) {
    const rows: T[] = []
    for (let from = 0; ; from += 500) {
        const { data, error } = await fetchPage(from, from + 499)
        if (error) throw error
        rows.push(...(data ?? []) as T[])
        if (!data || data.length < 500) return rows
    }
}

/** Uses the same assignments and department-linked labour as the factory workspace. */
export async function loadDepartmentJobs(db: SupabaseClient, code: DepartmentCode, clientId: string | null): Promise<DepartmentJob[]> {
    const department = await db.from("departments").select("id").eq("code", code).maybeSingle()
    if (department.error) throw department.error
    if (!department.data) return []
    const departmentId = department.data.id as string
    const assignments = await pages<Assignment>((from, to) => {
        let query = db.from("department_jobs")
            .select("estimated_hours,progress,costing_jobs!inner(id,job_number,title,production_title,completion_date,clients(name))")
            .eq("department_id", departmentId).lt("progress", 100)
            .in("costing_jobs.status", ["approved", "in_progress"]).eq("costing_jobs.is_template", false)
        if (clientId) query = query.eq("costing_jobs.client_id", clientId)
        return query.order("job_id").range(from, to)
    })
    if (!assignments.length) return []
    const actuals = new Map<string, number>()
    // Bound the URL size, while paginating actuals independently of assignments.
    for (let offset = 0; offset < assignments.length; offset += 100) {
        const jobIds = assignments.slice(offset, offset + 100).map(row => row.costing_jobs.id)
        const entries = await pages<{ job_id: string; hours: number }>((from, to) =>
            db.from("costing_time_entries").select("job_id,hours").eq("department_id", departmentId)
                .in("job_id", jobIds).order("id").range(from, to))
        for (const entry of entries) actuals.set(entry.job_id, (actuals.get(entry.job_id) ?? 0) + entry.hours)
    }
    return assignments.map(({ estimated_hours, costing_jobs: job }) => ({
        id: job.id, number: job.job_number, title: job.production_title?.trim() || job.title,
        client: job.clients?.name ?? null, due: job.completion_date,
        estimated: estimated_hours, actual: actuals.get(job.id) ?? null, missingEstimates: false,
    })).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.title.localeCompare(b.title))
}
