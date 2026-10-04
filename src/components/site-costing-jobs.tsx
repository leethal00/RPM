"use client"

import Link from "next/link"
import { useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { loadSiteCostingJobs } from "@/lib/costing/site-jobs"

export function SiteCostingJobs({ storeId }: { storeId: string }) {
    const supabase = useMemo(() => createClient(), [])
    const { data: jobs = [], isLoading, error } = useSupabaseQuery(`site-costing-jobs-${storeId}`, async () => ({
        data: await loadSiteCostingJobs(supabase, storeId), error: null,
    }))
    return <section className="mb-6 space-y-2" aria-label="RPM jobs at this site">
        <h2 className="text-lg font-semibold">RPM jobs</h2>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading jobs…</p> : error ? <p className="text-sm text-destructive">Could not load RPM jobs for this site.</p> : jobs.length === 0 ?
            <p className="text-sm text-muted-foreground">No RPM jobs linked to this site.</p> :
            <ul className="divide-y rounded-md border">
                {jobs.map((job) => <li key={job.id}>
                    {job.can_open_job ? <Link href={`/quoting/jobs/${job.id}`} className="block px-3 py-2 hover:bg-muted/40"><JobSummary job={job}/></Link> :
                        <div className="px-3 py-2"><JobSummary job={job}/></div>}
                </li>)}
            </ul>}
    </section>
}

function JobSummary({ job }: { job: Awaited<ReturnType<typeof loadSiteCostingJobs>>[number] }) {
    return <div className="flex flex-wrap justify-between gap-2">
        <span><strong className="text-sm">{job.production_title || job.title}</strong><span className="block text-xs text-muted-foreground">{job.job_number || "—"}{job.client_name && ` · ${job.client_name}`}</span></span>
        <span className="text-xs text-muted-foreground">{job.status.replaceAll("_", " ")}</span>
    </div>
}
