"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { JobTimeline } from "@/components/job-timeline"
import { Input } from "@/components/ui/input"
import { Search, Filter, ClipboardList } from "lucide-react"

export default function JobLogsPage() {
    const [jobs, setJobs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [error, setError] = useState<string | null>(null)
    const supabase = createClient()

    useEffect(() => {
        async function fetchJobs() {
            setLoading(true)
            const { data, error: fetchError } = await supabase
                .from('jobs')
                .select(`
                    *,
                    stores ( name )
                `)
                .order('created_at', { ascending: false })

            if (fetchError) {
                console.error("Fetch error:", fetchError)
                setError(fetchError.message)
            } else {
                setJobs(data || [])
                setError(null)
            }
            setLoading(false)
        }
        fetchJobs()
    }, [supabase])

    const filteredJobs = jobs.filter(job => {
        const searchLower = search.toLowerCase()
        return (
            job.title?.toLowerCase().includes(searchLower) ||
            job.description?.toLowerCase().includes(searchLower) ||
            job.stores?.name?.toLowerCase().includes(searchLower)
        )
    })

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
                            onChange={(e) => setSearch(e.target.value)}
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
                        <p className="text-muted-foreground mb-4">{error}</p>
                        <p className="text-xs text-muted-foreground font-mono bg-background/50 p-2 rounded">
                            HINT: This is usually caused by Supabase Row-Level Security (RLS) blocking the read.
                        </p>
                    </div>
                ) : (
                    <div className="bg-card p-6 rounded-xl border shadow-sm min-h-[400px]">
                        <JobTimeline jobs={filteredJobs} />
                    </div>
                )}
            </div>
        </DashboardLayout>
    )
}
