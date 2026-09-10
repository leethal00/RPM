"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search, ClipboardList } from "lucide-react"
import { TablePagination } from "@/components/table-pagination"
import { useCustomerFilter } from "@/lib/customer-filter"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import type { CostingJob } from "@/types/database"

const PAGE_SIZE = 20
type JobRow = CostingJob & { clients?: { name: string } | null; stores?: { name: string } | null }
const STATUS = {
    in_progress: { label: "Job", className: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
    complete: { label: "Complete", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
    invoiced: { label: "Invoiced", className: "bg-green-600/15 text-green-700 dark:text-green-300" },
} as const

export default function ActiveJobsPage() {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()
    const { clientId } = useCustomerFilter()
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState("")
    const key = `active-costing-jobs-${page}-${clientId ?? "all"}-${search}`
    const { data: result, isLoading } = useSupabaseQuery<{ items: JobRow[]; count: number }>(key, async () => {
        let query = supabase.from("costing_jobs").select(`*, clients ( name ), stores ( name )`, { count: "exact" })
            .eq("is_template", false).in("status", ["in_progress", "complete", "invoiced"])
        if (clientId) query = query.eq("client_id", clientId)
        if (search.trim()) {
            const term = search.trim().replace(/[,()*%]/g, "")
            query = query.or(`title.ilike.%${term}%,reference.ilike.%${term}%,job_number.ilike.%${term}%,xero_invoice_number.ilike.%${term}%`)
        }
        query = query.order("created_at", { ascending: false })
        const from = (page - 1) * PAGE_SIZE
        query = query.range(from, from + PAGE_SIZE - 1)
        const { data, error, count } = await query
        if (error) throw error
        return { data: { items: (data as JobRow[]) || [], count: count ?? 0 }, error: null }
    })
    const jobs = result?.items || []
    const totalCount = result?.count ?? 0
    return <DashboardLayout><PageShell>
        <PageHeader icon={ClipboardList} kicker="Job & Project Management" title="Active Jobs" description="Live work — job cards, actuals, completion and invoicing." />
        <div className="flex items-center gap-2 mb-4"><div className="relative flex-1 max-w-md"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="Search job, reference or invoice #…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-8 h-9" /></div><span className="text-xs text-muted-foreground ml-auto">{totalCount} {totalCount === 1 ? "job" : "jobs"}</span></div>
        {isLoading ? <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />)}</div> : jobs.length ? <><div className="border border-border/60 rounded-lg overflow-hidden"><table className="w-full text-sm"><thead className="bg-muted/40 text-muted-foreground"><tr className="text-left"><th className="font-medium px-4 py-2.5">Job</th><th className="font-medium px-4 py-2.5">Client / Site</th><th className="font-medium px-4 py-2.5 w-32">Job number</th><th className="font-medium px-4 py-2.5 w-28">Status</th></tr></thead><tbody>{jobs.map(job => { const meta = STATUS[job.status as keyof typeof STATUS] || STATUS.in_progress; return <tr key={job.id} onClick={() => router.push(`/quoting/${job.id}`)} className="border-t border-border/60 cursor-pointer hover:bg-muted/30"><td className="px-4 py-3"><div className="font-medium">{job.title}</div>{job.reference && <div className="text-xs text-muted-foreground">{job.reference}</div>}</td><td className="px-4 py-3 text-muted-foreground">{job.clients?.name || "Ad-hoc"}{job.stores?.name ? ` · ${job.stores.name}` : ""}</td><td className="px-4 py-3 font-medium tabular-nums">{job.job_number || job.xero_invoice_number || "—"}</td><td className="px-4 py-3"><Badge variant="secondary" className={meta.className}>{meta.label}</Badge></td></tr> })}</tbody></table></div><TablePagination page={page} pageCount={Math.ceil(totalCount / PAGE_SIZE)} onPageChange={setPage} totalItems={totalCount} pageSize={PAGE_SIZE} /></> : <div className="py-16 text-center border border-dashed border-border/60 rounded-lg text-sm text-muted-foreground">No active jobs yet. Accepted quotes will appear here once they become live jobs.</div>}
    </PageShell></DashboardLayout>
}
