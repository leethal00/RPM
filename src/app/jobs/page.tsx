"use client"

import { useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import type { Job } from "@/types/database"
import { JobTimeline } from "@/components/job-timeline"
import { TablePagination } from "@/components/table-pagination"
import { Input } from "@/components/ui/input"
import { Search, Filter, ClipboardList } from "lucide-react"

const PAGE_SIZE = 25

export default function JobLogsPage() {
    const [currentPage, setCurrentPage] = useState(1)
    const [search, setSearch] = useState("")

    const from = (currentPage - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data: jobs, count: totalCount, isLoading: loading, error } = useSupabaseQuery<Job[]>(
        ['jobs', 'list', currentPage, search],
        (supabase) => {
            let query = supabase
                .from('jobs')
                .select(`
                    *,
                    stores ( name )
                `, { count: 'exact' })

            if (search.trim()) {
                query = query.or(`title.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`)
            }

            query = query.order('created_at', { ascending: false })
            query = query.range(from, to)

            return query
        }
    )

    const handleSearchChange = (value: string) => {
        setSearch(value)
        setCurrentPage(1)
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 py-6 font-primary max-w-5xl mx-auto w-full">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h1 className="text-3xl font-bold tracking-tight">Job Logs</h1>
                        <p className="text-muted-foreground italic">Central archive of all audit and maintenance tickets.</p>
                    </div>
                    <div className="p-3 bg-primary/10 rounded-xl">
                        <ClipboardList className="size-6 text-primary" />
                    </div>
                </div>

                <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-xl border border-muted-foreground/10">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by issue title or description..."
                            className="pl-10 bg-background border-none"
                            value={search}
                            onChange={(e) => handleSearchChange(e.target.value)}
                        />
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-background border rounded-lg text-sm font-semibold hover:bg-muted/50 transition-colors">
                        <Filter className="size-4" />
                        Region
                    </button>
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
                        <p className="text-muted-foreground mb-4">{error instanceof Error ? error.message : "An unexpected error occurred"}</p>
                        <p className="text-xs text-muted-foreground font-mono bg-background/50 p-2 rounded">
                            HINT: This is usually caused by Supabase Row-Level Security (RLS) blocking the read.
                        </p>
                    </div>
                ) : (
                    <div className="bg-card p-6 rounded-xl border shadow-sm min-h-[400px]">
                        <JobTimeline jobs={jobs || []} />
                    </div>
                )}

                <TablePagination
                    currentPage={currentPage}
                    totalCount={totalCount || 0}
                    pageSize={PAGE_SIZE}
                    onPageChange={setCurrentPage}
                />
            </div>
        </DashboardLayout>
    )
}
