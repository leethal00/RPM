"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Calculator } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { CostingJobForm } from "@/components/costing-job-form"
import { TablePagination } from "@/components/table-pagination"
import { useCustomerFilter } from "@/lib/customer-filter"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import type { CostingJob, CostingStatus } from "@/types/database"

const PAGE_SIZE = 20

const STATUS_META: Record<CostingStatus, { label: string; className: string }> = {
    quote: { label: "Quote", className: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
    quoted: { label: "Quoted", className: "bg-blue-500/15 text-blue-600 dark:text-blue-300" },
    approved: { label: "Approved", className: "bg-violet-500/15 text-violet-600 dark:text-violet-300" },
    in_progress: { label: "In progress", className: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
    complete: { label: "Complete", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
    invoiced: { label: "Invoiced", className: "bg-green-600/15 text-green-700 dark:text-green-300" },
    cancelled: { label: "Cancelled", className: "bg-red-500/15 text-red-600 dark:text-red-300" },
}

type CostingJobRow = CostingJob & { clients?: { name: string } | null; stores?: { name: string } | null }

export default function QuotingPage() {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()
    const [page, setPage] = useState(1)
    const [statusFilter, setStatusFilter] = useState<string>("all")
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const { clientId } = useCustomerFilter()

    const key = `costing-jobs-${page}-${statusFilter}-${clientId ?? "all"}`

    const { data: result, isLoading, mutate } = useSupabaseQuery<{ items: CostingJobRow[]; count: number }>(
        key,
        async () => {
            let query = supabase
                .from("costing_jobs")
                .select(`*, clients ( name ), stores ( name )`, { count: "exact" })

            if (statusFilter !== "all") query = query.eq("status", statusFilter)
            if (clientId) query = query.eq("client_id", clientId)

            query = query.order("created_at", { ascending: false })
            const from = (page - 1) * PAGE_SIZE
            query = query.range(from, from + PAGE_SIZE - 1)

            const { data, error, count } = await query
            if (error) throw error
            return { data: { items: (data as CostingJobRow[]) || [], count: count ?? 0 }, error: null }
        }
    )

    const jobs = result?.items || []
    const totalCount = result?.count ?? 0
    const pageCount = Math.ceil(totalCount / PAGE_SIZE)

    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader
                    icon={Calculator}
                    kicker="Quoting & Costing"
                    title="Jobs & Quotes"
                    description="Signage job costing — build a BOM, produce a job card, and track estimated vs. actual."
                    actions={
                        <div className="flex items-center gap-2">
                            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
                                <SelectTrigger className="h-9 min-w-[140px] text-sm font-normal">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All statuses</SelectItem>
                                    {Object.entries(STATUS_META).map(([k, v]) => (
                                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" className="gap-1.5 h-9">
                                        <Plus className="size-3.5" />
                                        New job
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[600px]">
                                    <DialogHeader>
                                        <DialogTitle>New costing job</DialogTitle>
                                        <DialogDescription>
                                            Start a quote. Client and site are optional for ad-hoc / wholesale work.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <CostingJobForm
                                        onSuccess={(jobId) => {
                                            setIsDialogOpen(false)
                                            mutate()
                                            if (jobId) router.push(`/quoting/${jobId}`)
                                        }}
                                        onCancel={() => setIsDialogOpen(false)}
                                    />
                                </DialogContent>
                            </Dialog>
                        </div>
                    }
                />

                {isLoading ? (
                    <div className="flex flex-col gap-2">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
                        ))}
                    </div>
                ) : jobs.length > 0 ? (
                    <>
                        <div className="border border-border/60 rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/40 text-muted-foreground">
                                    <tr className="text-left">
                                        <th className="font-medium px-4 py-2.5">Job</th>
                                        <th className="font-medium px-4 py-2.5">Client / Site</th>
                                        <th className="font-medium px-4 py-2.5 w-28">Number</th>
                                        <th className="font-medium px-4 py-2.5 w-32">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {jobs.map((job) => (
                                        <tr
                                            key={job.id}
                                            onClick={() => router.push(`/quoting/${job.id}`)}
                                            className="border-t border-border/60 cursor-pointer hover:bg-muted/30 transition-colors"
                                        >
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-foreground">{job.title}</div>
                                                {job.reference && (
                                                    <div className="text-xs text-muted-foreground">{job.reference}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {job.clients?.name || <span className="italic">Ad-hoc</span>}
                                                {job.stores?.name ? ` · ${job.stores.name}` : ""}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground tabular-nums">
                                                {job.job_number || job.xero_invoice_number || "—"}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant="secondary" className={STATUS_META[job.status].className}>
                                                    {STATUS_META[job.status].label}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <TablePagination
                            page={page}
                            pageCount={pageCount}
                            onPageChange={setPage}
                            totalItems={totalCount}
                            pageSize={PAGE_SIZE}
                        />
                    </>
                ) : (
                    <div className="py-16 text-center border border-dashed border-border/60 rounded-lg">
                        <div className="size-12 bg-muted/40 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Calculator className="size-5 text-muted-foreground" />
                        </div>
                        <h3 className="text-base font-medium text-foreground">No costing jobs yet</h3>
                        <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                            Create a job to start a quote and build its cost sheet.
                        </p>
                        <Button variant="outline" size="sm" className="mt-4" onClick={() => setIsDialogOpen(true)}>
                            Create first job
                        </Button>
                    </div>
                )}
            </PageShell>
        </DashboardLayout>
    )
}
