/**
 * Computed site health score, derived from the actual state of a site's
 * assets and jobs. Replaces the stored `maintenance_score` column.
 *
 * Score model (start at 100, deduct):
 *   - per active fault (open/in_progress + job_type=fault): −10, capped at −50
 *   - per critical/high severity fault: additional −5, capped at −20
 *   - per overdue PM (asset.next_service_date < today): −5, capped at −30
 *   - no assets recorded: −20 (data hygiene)
 * Floor at 0.
 *
 * If the consumer didn't join assets or jobs onto the store, we return
 * `unknown` and the UI renders "—" instead of a numeric score.
 */

export type HealthLabel = "healthy" | "attention" | "critical" | "unknown"

export interface HealthInputAsset {
    next_service_date?: string | null
}

export interface HealthInputJob {
    status: string
    job_type?: string | null
    severity?: string | null
}

export interface HealthInput {
    assets?: HealthInputAsset[] | null
    jobs?: HealthInputJob[] | null
}

export interface HealthResult {
    score: number
    label: HealthLabel
}

const today = () => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
}

export function computeHealthScore(input: HealthInput): HealthResult {
    // If neither relation was joined, we can't compute anything meaningful.
    if (input.assets == null && input.jobs == null) {
        return { score: 0, label: "unknown" }
    }

    const assets = input.assets ?? []
    const jobs = input.jobs ?? []
    let score = 100

    // Active faults
    const activeFaults = jobs.filter(j =>
        (j.status === "open" || j.status === "in_progress") &&
        j.job_type === "fault"
    )
    score -= Math.min(activeFaults.length * 10, 50)

    // Critical / high severity additional penalty
    const critical = activeFaults.filter(j => j.severity === "critical" || j.severity === "high")
    score -= Math.min(critical.length * 5, 20)

    // Overdue PMs
    const now = today()
    const overdue = assets.filter(a => {
        if (!a.next_service_date) return false
        const d = new Date(a.next_service_date)
        return !isNaN(d.getTime()) && d < now
    })
    score -= Math.min(overdue.length * 5, 30)

    // Data hygiene — no assets means we know nothing about the site
    if (assets.length === 0) score -= 20

    score = Math.max(0, Math.min(100, score))
    const label: HealthLabel =
        score >= 80 ? "healthy" :
        score >= 50 ? "attention" :
        "critical"
    return { score, label }
}

/**
 * Tailwind class lookup for the score badge styling.
 */
export function healthBadgeClasses(label: HealthLabel): string {
    switch (label) {
        case "healthy":   return "bg-emerald-50 text-emerald-700 border-emerald-200"
        case "attention": return "bg-amber-50 text-amber-700 border-amber-200"
        case "critical":  return "bg-red-50 text-red-700 border-red-200"
        case "unknown":   return "text-muted-foreground"
    }
}
