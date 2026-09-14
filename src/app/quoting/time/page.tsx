"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { Clock, Search } from "lucide-react"
import type { CostingJob } from "@/types/database"

type JobRow = CostingJob & { clients?: { name: string } | null; stores?: { name: string } | null; production_title?: string | null }

export default function TimeEntriesPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [search, setSearch] = useState("")

  const { data: jobs, isLoading } = useSupabaseQuery<JobRow[]>("time-entry-active-jobs", async () => {
    const { data, error } = await supabase.from("costing_jobs").select(`*, clients ( name ), stores ( name )`).eq("is_template", false).eq("status", "in_progress").order("completion_date", { ascending: true, nullsFirst: false })
    if (error) throw error
    return { data: (data as JobRow[]) || [], error: null }
  })

  const filtered = (jobs || []).filter((job) => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return [job.job_number, job.xero_invoice_number, job.production_title, job.title, job.clients?.name, job.stores?.name, job.job_lead_name].filter(Boolean).some((value) => String(value).toLowerCase().includes(term))
  })

  return <DashboardLayout><PageShell>
    <PageHeader icon={Clock} kicker="Job & Project Management" title="Time Entries" description="Select an active job to enter or review admin, design and production time." />
    <div className="relative mb-4 max-w-md"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"/><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search active jobs…" className="pl-8 h-9"/></div>
    {isLoading ? <div className="space-y-2">{[1,2,3,4].map((i) => <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse"/>)}</div> : filtered.length === 0 ? <div className="rounded-lg border border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">No active jobs found.</div> : <div className="rounded-lg border border-border/60 overflow-hidden"><table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr className="text-left border-b border-border/60 bg-muted/30"><th className="font-medium px-4 py-2.5 w-32">Job no.</th><th className="font-medium px-3 py-2.5">Job</th><th className="font-medium px-3 py-2.5">Client / site</th><th className="font-medium px-3 py-2.5 w-36">Job lead</th><th className="w-28"/></tr></thead><tbody>{filtered.map((job) => <tr key={job.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20"><td className="px-4 py-3 font-medium">{job.job_number || job.xero_invoice_number || "—"}</td><td className="px-3 py-3">{job.production_title || job.title}</td><td className="px-3 py-3 text-muted-foreground">{[job.clients?.name, job.stores?.name].filter(Boolean).join(" · ") || "Ad-hoc / wholesale"}</td><td className="px-3 py-3 text-muted-foreground">{job.job_lead_name || "—"}</td><td className="px-3 py-2 text-right"><Button size="sm" variant="outline" onClick={() => router.push(`/quoting/jobs/${job.id}`)}>Enter time</Button></td></tr>)}</tbody></table></div>}
  </PageShell></DashboardLayout>
}
