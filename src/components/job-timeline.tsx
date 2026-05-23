import { Clock, AlertTriangle, Hammer } from "lucide-react"
import Link from "next/link"
import type { Job } from "@/types/database"

interface JobTimelineProps {
    jobs: Job[]
}

export function JobTimeline({ jobs }: JobTimelineProps) {
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

    if (jobs.length === 0) {
        return (
            <div className="text-center py-12 text-sm text-muted-foreground">
                No job history recorded.
            </div>
        )
    }

    return (
        <div className="divide-y divide-border/40">
            {jobs.map((job) => (
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
            ))}
        </div>
    )
}
