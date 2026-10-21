import { Clock, AlertTriangle, Hammer, FileText } from "lucide-react"
import Link from "next/link"
import type { AssetHistoryEntry, Job } from "@/types/database"

interface JobTimelineProps {
    jobs: Job[]
    historyEntries?: AssetHistoryEntry[]
    hideEmpty?: boolean
}

export function JobTimeline({ jobs, historyEntries = [], hideEmpty = false }: JobTimelineProps) {
    const timeline = [
        ...jobs.map((job) => ({ kind: "job" as const, job, date: job.created_at, key: `job-${job.id}` })),
        ...historyEntries.map((entry) => ({ kind: "manual" as const, entry, date: `${entry.occurred_on}T12:00:00`, key: `manual-${entry.id}` })),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key))
    const typeIcons = {
        fault: <AlertTriangle className="size-3.5 text-destructive" />,
        maintenance: <Clock className="size-3.5 text-amber-500" />,
        project: <Hammer className="size-3.5 text-primary" />,
    }

    const statusDot: Record<string, string> = {
        open: "bg-amber-500",
        in_progress: "bg-primary",
        resolved: "bg-emerald-500",
        closed: "bg-muted-foreground/50",
    }

    if (timeline.length === 0) {
        if (hideEmpty) return null
        return (
            <div className="text-center py-12 text-sm text-muted-foreground">
                No history recorded.
            </div>
        )
    }

    return (
        <div className="divide-y divide-border/40">
            {timeline.map((item) => {
                if (item.kind === "manual") {
                    const entry = item.entry
                    return <article key={item.key} className="flex gap-3 p-4">
                        <div className="size-7 rounded-md border border-border/60 bg-card flex items-center justify-center shrink-0 mt-0.5"><FileText className="size-3.5 text-primary" /></div>
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                                <span className="font-medium text-sm break-words">{entry.title}</span>
                                <time dateTime={entry.occurred_on} className="text-xs text-muted-foreground whitespace-nowrap">{new Date(`${entry.occurred_on}T12:00:00`).toLocaleDateString("en-NZ")}</time>
                            </div>
                            <p className="text-xs text-muted-foreground mb-1.5">Manual entry · Recorded {new Date(entry.created_at).toLocaleDateString("en-NZ")}</p>
                            {entry.notes && <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">{entry.notes}</p>}
                        </div>
                    </article>
                }
                const job = item.job
                return (
                <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex gap-3 p-4 hover:bg-accent/30 transition-colors group cursor-pointer"
                >
                    <div className="size-7 rounded-md border border-border/60 bg-card flex items-center justify-center shrink-0 mt-0.5">
                        {typeIcons[job.job_type]}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2 mb-1">
                            <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">
                                {job.title}
                            </span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {new Date(job.created_at).toLocaleDateString()}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1.5">
                            {job.stores?.name && (
                                <span className="truncate">{job.stores.name}</span>
                            )}
                            <span className="capitalize">{job.job_type}</span>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="inline-flex items-center gap-1 capitalize">
                                <span className={`size-1.5 rounded-full ${statusDot[job.status] || "bg-muted-foreground/50"}`} />
                                {job.status.replace("_", " ")}
                            </span>
                        </div>
                        {job.description && (
                            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                                {job.description}
                            </p>
                        )}
                    </div>
                </Link>
                )
            })}
        </div>
    )
}
