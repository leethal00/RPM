"use client"

import { useState, useMemo } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { JobTimeline } from "@/components/job-timeline"
import { Input } from "@/components/ui/input"
import { Search, Filter, ClipboardList } from "lucide-react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { TablePagination } from "@/components/table-pagination"
import type { Job, Store } from "@/types/database"
import { useCustomerFilter } from "@/lib/customer-filter"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

const PAGE_SIZE = 25

export default function JobLogsPage() {
    const supabase = useMemo(() => createClient(), [])
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState<string>("all")
    const [severityFilter, setSeverityFilter] = useState<string>("all")
    const { clientId } = useCustomerFilter()

    const jobsKey = `jobs-${page}-${search}-${statusFilter}-${severityFilter}-${clientId ?? 'all'}`

    const { data: jobsResult, isLoading: loading, error: swrError } = useSupabaseQuery<{ items: (Job & { stores: Pick<Store, 'name'> | null })[], count: number }>(
        jobsKey,
        async () => {
            let query = supabase
                .from('jobs')
                .select(`
                    *,
                    stores!inner ( name, client_id )
                `, { count: "exact" })

            if (search.trim()) {
                const term = `%${search.trim()}%`
                query = query.or(`title.ilike.${term},description.ilike.${term}`)
            }

            if (statusFilter !== "all") {
                query = query.eq("status", statusFilter)
            }

            if (severityFilter !== "all") {
                query = query.eq("severity", severityFilter)
            }

            if (clientId) {
                query = query.eq("stores.client_id", clientId)
            }

            query = query.order('created_at', { ascending: false })

            const from = (page - 1) * PAGE_SIZE
            const to = from + PAGE_SIZE - 1
            query = query.range(from, to)

            const { data, error: fetchError, count } = await query

            if (fetchError) throw fetchError

            return { data: { items: data || [], count: count ?? 0 }, error: null }
        }
    )

    const jobs = jobsResult?.items || []
    const totalCount = jobsResult?.count ?? 0
    const error = swrError?.message ?? null

    const handleSearchChange = (value: string) => {
        setSearch(value)
        setPage(1)
    }

    const handleStatusChange = (value: string) => {
        setStatusFilter(value)
        setPage(1)
    }

    const handleSeverityChange = (value: string) => {
        setSeverityFilter(value)
        setPage(1)
    }

    const pageCount = Math.ceil(totalCount / PAGE_SIZE)

    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader
                    icon={ClipboardList}
                    title="Job Logs"
                    description="Central archive of all audit and maintenance tickets."
                    actions={
                        <span className="text-xs text-muted-foreground font-bold uppercase tracking-widest">
                            <span className="text-foreground text-base">{totalCount}</span> total
                        </span>
                    }
                />

                <div className="flex flex-col md:flex-row items-center gap-4 bg-muted/30 p-4 rounded-xl border border-muted-foreground/10">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by issue title or description..."
                            className="pl-10 bg-background border-none"
                            value={search}
                            onChange={(e) => handleSearchChange(e.target.value)}
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={handleStatusChange}>
                        <SelectTrigger className="w-[160px] bg-background border">
                            <div className="flex items-center gap-2">
                                <Filter className="size-3.5" />
                                <SelectValue placeholder="Status" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={severityFilter} onValueChange={handleSeverityChange}>
                        <SelectTrigger className="w-[160px] bg-background border">
                            <SelectValue placeholder="Severity" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Severities</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {loading ? (
                    <div className="p-8 animate-pulse space-y-4">
                        <div className="h-20 bg-muted rounded-xl" />
                        <div className="h-20 bg-muted rounded-xl" />
                        <div className="h-20 bg-muted rounded-xl" />
                    </div>
                ) : error ? (
                    <div className="bg-destructive/10 border border-destructive/20 p-8 rounded-xl text-center">
                        <h2 className="text-destructive font-bold text-lg mb-2">Technical Error</h2>
                        <p className="text-muted-foreground mb-4">{error}</p>
                        <p className="text-xs text-muted-foreground font-mono bg-background/50 p-2 rounded">
                            HINT: This is usually caused by Supabase Row-Level Security (RLS) blocking the read.
                        </p>
                    </div>
                ) : (
                    <div className="bg-card p-6 rounded-xl border shadow-sm min-h-[400px]">
                        <JobTimeline jobs={jobs} />
                        <TablePagination
                            page={page}
                            pageCount={pageCount}
                            onPageChange={setPage}
                            totalItems={totalCount}
                            pageSize={PAGE_SIZE}
                        />
                    </div>
                )}
            </PageShell>
        </DashboardLayout>
    )
}
