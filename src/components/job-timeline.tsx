import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Clock, AlertTriangle, Hammer } from "lucide-react"
import Link from "next/link"

interface Job {
    id: string
    title: string
    job_type: "fault" | "maintenance" | "project"
    status: string
    created_at: string
    description?: string
    stores?: {
        name: string
    }
}

interface JobTimelineProps {
    jobs: Job[]
}

export function JobTimeline({ jobs }: JobTimelineProps) {
    const typeIcons = {
        fault: <AlertTriangle className="size-4 text-red-500" />,
        maintenance: <Clock className="size-4 text-amber-500" />,
        project: <Hammer className="size-4 text-blue-500" />,
    }

    return (
        <div className="space-y-6">
            {jobs.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground border rounded-lg bg-card">
                    No job history recorded for this site.
                </div>
            ) : (
                <div className="relative pl-6 border-l space-y-8">
                    {jobs.map((job) => (
                        <div key={job.id} className="relative">
                            <div className="absolute -left-[31px] top-1 flex size-6 items-center justify-center rounded-full bg-background border">
                                {typeIcons[job.job_type]}
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <Link href={`/jobs/${job.id}`} className="hover:underline">
                                        <h4 className="font-semibold text-sm leading-none">{job.title}</h4>
                                    </Link>
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(job.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                                {job.stores?.name && (
                                    <div className="text-[11px] font-bold text-primary/80 uppercase tracking-tight mb-1">
                                        {job.stores.name}
                                    </div>
                                )}
                                <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 uppercase">
                                        {job.job_type}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold">
                                        {job.status}
                                    </span>
                                </div>
                                {job.description && (
                                    <p className="text-sm text-muted-foreground leading-relaxed italic">
                                        {job.description}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
