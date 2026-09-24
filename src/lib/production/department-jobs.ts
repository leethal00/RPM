import type { PlanningOperation } from "./planning"

export interface DepartmentJob {
    id: string
    number: string | null
    title: string
    client: string | null
    due: string | null
    estimated: number | null
    actual: number | null
    missingEstimates: boolean
}

/** One row per active department/job. Hours include its completed operations,
 * so completing a stage does not make recorded labour disappear. */
export function departmentJobs(operations: PlanningOperation[]): DepartmentJob[] {
    const groups = new Map<string, PlanningOperation[]>()
    for (const operation of operations) {
        if (!["approved", "in_progress"].includes(operation.job_status)) continue
        const group = groups.get(operation.job_id) ?? []
        group.push(operation)
        groups.set(operation.job_id, group)
    }
    return [...groups.values()].flatMap(group => {
        const outstanding = group.filter(operation => operation.status !== "complete")
        if (!outstanding.length) return []
        const first = group[0]
        const estimates = group.flatMap(operation => operation.estimated_hours === null ? [] : [operation.estimated_hours])
        const actuals = group.flatMap(operation => operation.actual_hours === null ? [] : [operation.actual_hours])
        return [{
            id: first.job_id, number: first.job_number, title: first.job_title, client: first.client_name,
            due: outstanding.flatMap(operation => operation.effective_due_date ? [operation.effective_due_date] : []).sort()[0] ?? null,
            estimated: estimates.length ? estimates.reduce((sum, hours) => sum + hours, 0) : null,
            actual: actuals.length ? actuals.reduce((sum, hours) => sum + hours, 0) : null,
            missingEstimates: estimates.length > 0 && estimates.length < group.length,
        }]
    }).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.title.localeCompare(b.title))
}
