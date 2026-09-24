"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ClipboardList, RotateCcw, Search } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { useCustomerFilter } from "@/lib/customer-filter"
import { DEPARTMENTS, formatHours, type DepartmentCode } from "@/lib/production/planning"
import type { DepartmentJob } from "@/lib/production/department-jobs"
import { loadDepartmentJobs } from "@/lib/production/load-department-jobs"

export function ProductionPlanning() {
    const supabase = createClient()
    const { clientId, initialised } = useCustomerFilter()
    const [department, setDepartment] = useState<DepartmentCode>("cnc")
    const [search, setSearch] = useState("")
    const { data, error, isLoading, isValidating, mutate } = useSupabaseQuery<DepartmentJob[]>(
        initialised ? `department-jobs:${department}:${clientId ?? "all"}` : null,
        async () => {
            return { data: await loadDepartmentJobs(supabase, department, clientId), error: null }
        },
        { keepPreviousData: false, revalidateOnFocus: true },
    )
    const jobs = useMemo(() => (data ?? []).filter(job =>
        `${job.number ?? ""} ${job.title} ${job.client ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())
    ), [data, search])
    const refresh = () => { void mutate().catch(() => undefined) }

    return <DashboardLayout><PageShell width="full">
        <PageHeader icon={ClipboardList} title="Department Jobs" description="Jobs on each department’s to-do list"
            actions={<Button variant="outline" size="sm" disabled={isValidating} onClick={refresh}><RotateCcw className="size-4" />Refresh</Button>} />
        <Tabs value={department} onValueChange={value => setDepartment(value as DepartmentCode)}>
            <TabsList className="h-auto flex-wrap justify-start">
                {Object.entries(DEPARTMENTS).map(([code, label]) => <TabsTrigger key={code} value={code}>{label}</TabsTrigger>)}
            </TabsList>
        </Tabs>
        <div className="relative max-w-md"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" aria-label="Search jobs" placeholder="Search job or client…" value={search} onChange={event => setSearch(event.target.value)} /></div>
        {error ? <div role="alert" className="rounded-lg border p-4 text-sm">Could not load department jobs. <Button variant="outline" onClick={refresh}>Retry</Button></div>
            : !initialised || isLoading ? <p role="status">Loading {DEPARTMENTS[department]} jobs…</p> : <>
                <div className="overflow-x-auto rounded-lg border bg-card">
                    <table className="w-full text-sm">
                        <caption className="sr-only">{DEPARTMENTS[department]} jobs</caption>
                        <thead className="bg-muted/50 text-left text-muted-foreground"><tr>{["Job / Client", "Due date", "Estimated hours", "Actual hours"].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium whitespace-nowrap">{label}</th>)}</tr></thead>
                        <tbody>{jobs.map(job => <tr key={job.id} className="border-t hover:bg-muted/30">
                            <td className="px-4 py-4"><Link className="font-medium hover:underline" href={`/quoting/jobs/${job.id}`}>{job.number ? `${job.number} · ` : ""}{job.title}</Link><div className="text-xs text-muted-foreground">{job.client ?? "No client"}</div></td>
                            <td className="px-4 py-4 whitespace-nowrap">{job.due ? new Date(`${job.due.slice(0, 10)}T00:00:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                            <td className="px-4 py-4 tabular-nums">{formatHours(job.estimated)}{job.missingEstimates && <div className="text-xs text-muted-foreground">Partial estimate</div>}</td>
                            <td className="px-4 py-4 tabular-nums">{formatHours(job.actual)}</td>
                        </tr>)}</tbody>
                    </table>
                    {!jobs.length && <div className="p-10 text-center text-muted-foreground"><p>No {DEPARTMENTS[department]} jobs {search ? "match your search" : "on the to-do list"}.</p>{!search && <Link className="mt-2 inline-block text-sm underline" href="/settings/production">Assign jobs in Production access</Link>}</div>}
                </div>
                <p className="text-xs text-muted-foreground">{jobs.length} {jobs.length === 1 ? "job" : "jobs"} · Hours are for {DEPARTMENTS[department]} only. A dash means no hours recorded or estimated.</p>
            </>}
    </PageShell></DashboardLayout>
}
