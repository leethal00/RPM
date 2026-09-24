"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ClipboardList, RotateCcw } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { useCustomerFilter } from "@/lib/customer-filter"
import { formatHours } from "@/lib/production/planning"
import { WORKLOAD_DEPARTMENTS as DEPARTMENTS, type WorkloadDepartment as DepartmentCode } from "@/lib/production/bom-workload"
import type { DepartmentJob } from "@/lib/production/department-jobs"
import { CapacityPreview } from "./capacity-preview"
import { loadDepartmentJobs } from "@/lib/production/load-department-jobs"

export function ProductionPlanning() {
    const supabase = createClient()
    const { clientId, initialised } = useCustomerFilter()
    const [department, setDepartment] = useState<DepartmentCode>("cnc")
    const [sort, setSort] = useState<{ key: "number" | "job" | "due" | "estimated" | "actual"; asc: boolean }>({ key: "due", asc: true })
    const columns = [{ key: "number", label: "Job number" }, { key: "job", label: "Job / Client" }, { key: "due", label: "Due date" }, { key: "estimated", label: "Estimated hours" }, { key: "actual", label: "Actual hours" }] as const
    const { data, error, isLoading, isValidating, mutate } = useSupabaseQuery<DepartmentJob[]>(
        initialised ? `bom-department-jobs:${department}:${clientId ?? "all"}` : null,
        async () => {
            return { data: await loadDepartmentJobs(supabase, department, clientId), error: null }
        },
        { keepPreviousData: false, revalidateOnFocus: true },
    )
    const jobs = useMemo(() => {
        return [...(data ?? [])].sort((a,b) => {
            const av = sort.key === "job" ? [a.title,a.client].join(" ") : a[sort.key]
            const bv = sort.key === "job" ? [b.title,b.client].join(" ") : b[sort.key]
            if (av === null) return bv === null ? 0 : 1
            if (bv === null) return -1
            const order = typeof av === "number" && typeof bv === "number" ? av-bv : String(av).localeCompare(String(bv), undefined, { numeric: true })
            return sort.asc ? order : -order
        })
    }, [data, sort])
    const refresh = () => { void mutate().catch(() => undefined) }

    return <DashboardLayout><PageShell width="full">
        <PageHeader icon={ClipboardList} title="Department Jobs" description="Department workloads from active job BOMs"
            actions={<Button variant="outline" size="sm" disabled={isValidating} onClick={refresh}><RotateCcw className="size-4" />Refresh</Button>} />
        <Tabs value={department} onValueChange={value => setDepartment(value as DepartmentCode)}>
            <TabsList className="h-auto flex-wrap justify-start">
                {Object.entries(DEPARTMENTS).map(([code, label]) => <TabsTrigger key={code} value={code}>{label}</TabsTrigger>)}
            </TabsList>
        </Tabs>
        <p className="text-sm text-muted-foreground">{department === "cnc" ? "Design, drawing, programming and CNC machining" : department === "metalshop" ? "Metal cutting, sanding and welding" : department === "fabrication" ? "Acrylic fabrication, wiring and finishing" : "Installation and site work"}</p>
        {error ? <div role="alert" className="rounded-lg border p-4 text-sm">Could not load department jobs. <Button variant="outline" onClick={refresh}>Retry</Button></div>
            : !initialised || isLoading ? <p role="status">Loading {DEPARTMENTS[department]} jobs…</p> : <>
                <div className="overflow-x-auto rounded-lg border bg-card">
                    <table className="w-full text-sm">
                        <caption className="sr-only">{DEPARTMENTS[department]} jobs</caption>
                        <thead className="bg-muted/50 text-left text-muted-foreground"><tr>{columns.map(({key,label}) => <th key={key} scope="col" aria-sort={sort.key === key ? sort.asc ? "ascending" : "descending" : "none"} className="px-4 py-3 font-medium whitespace-nowrap"><button className="flex items-center gap-2 hover:text-foreground" onClick={() => setSort({key, asc: sort.key === key ? !sort.asc : true})}>{label}<span aria-hidden="true">{sort.key === key ? sort.asc ? "↑" : "↓" : "↕"}</span></button></th>)}</tr>
                        </thead>
                        <tbody>{jobs.map(job => <tr key={job.id} className="border-t hover:bg-muted/30">
                            <td className="px-4 py-4 tabular-nums whitespace-nowrap">{job.number ?? "—"}</td>
                            <td className="px-4 py-4"><Link className="font-medium hover:underline" href={`/quoting/jobs/${job.id}`}>{job.title}</Link><div className="text-xs text-muted-foreground">{job.client ?? "No client"}</div></td>
                            <td className="px-4 py-4 whitespace-nowrap">{job.due ? new Date(`${job.due.slice(0, 10)}T00:00:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                            <td className="px-4 py-4 tabular-nums">{formatHours(job.estimated)}{job.missingEstimates && <div className="text-xs text-muted-foreground">{job.estimated === null ? "Estimate unavailable" : "Partial estimate"}</div>}</td>
                            <td className="px-4 py-4 tabular-nums">{formatHours(job.actual)}</td>
                        </tr>)}</tbody>
                    </table>
                    {!jobs.length && <div className="p-10 text-center text-muted-foreground"><p>No {DEPARTMENTS[department]} jobs on the to-do list.</p><p className="mt-2 text-sm">Jobs appear here when their BOM includes work for this department.</p></div>}
                </div>
                <p className="text-xs text-muted-foreground">{jobs.length} {jobs.length === 1 ? "job" : "jobs"} · Hours are for {DEPARTMENTS[department]} only. Estimates come from BOM labour. A dash means hours are unknown or unrecorded.</p>
            </>}
        <CapacityPreview department={DEPARTMENTS[department]} />
    </PageShell></DashboardLayout>
}
