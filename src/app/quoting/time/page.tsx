"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { Clock, Search, ScanLine, Package } from "lucide-react"
import type { CostingJob } from "@/types/database"

type JobRow = CostingJob & { clients?: { name: string } | null; stores?: { name: string } | null; production_title?: string | null }
type ScanRow = { id: string; subject: string | null; attachment_name: string | null; received_at: string | null; status: string; detected_job_number: string | null; confidence: number | null; review_notes: string | null; costing_jobs?: { job_number: string | null; title: string | null } | null }

const statusLabel: Record<string, string> = { new: "New", processing: "Processing", ready: "Ready", review_required: "Needs review", processed: "Processed", failed: "Failed" }

export default function TimeEntriesPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [search, setSearch] = useState("")

  const { data: jobs, isLoading } = useSupabaseQuery<JobRow[]>("time-entry-active-jobs", async () => {
    const { data, error } = await supabase.from("costing_jobs").select(`*, clients ( name ), stores ( name )`).eq("is_template", false).eq("status", "in_progress").order("completion_date", { ascending: true, nullsFirst: false })
    if (error) throw error
    return { data: (data as JobRow[]) || [], error: null }
  })

  const { data: scans, isLoading: scansLoading } = useSupabaseQuery<ScanRow[]>("job-card-scans", async () => {
    const { data, error } = await supabase.from("job_card_scans").select(`id, subject, attachment_name, received_at, status, detected_job_number, confidence, review_notes, costing_jobs ( job_number, title )`).order("received_at", { ascending: false }).limit(100)
    if (error) throw error
    return { data: (data as ScanRow[]) || [], error: null }
  })

  const filtered = (jobs || []).filter((job) => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return [job.job_number, job.xero_invoice_number, job.production_title, job.title, job.clients?.name, job.stores?.name, job.job_lead_name].filter(Boolean).some((value) => String(value).toLowerCase().includes(term))
  })

  return <DashboardLayout><PageShell>
    <PageHeader icon={Clock} kicker="Job & Project Management" title="Time & Materials" description="Enter labour and materials, or review scanned workshop job cards." />
    <Tabs defaultValue="time" className="gap-4">
      <TabsList><TabsTrigger value="time"><Clock/>Time Entry</TabsTrigger><TabsTrigger value="materials"><Package/>Materials Entry</TabsTrigger><TabsTrigger value="scans"><ScanLine/>Scanned Job Cards{(scans || []).some(s => s.status === "review_required" || s.status === "new") ? <span className="ml-1 rounded-full bg-amber-500/15 px-1.5 text-[11px] text-amber-700 dark:text-amber-300">{(scans || []).filter(s => s.status === "review_required" || s.status === "new").length}</span> : null}</TabsTrigger></TabsList>
      <TabsContent value="time">
        <div className="relative mb-4 max-w-md"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"/><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search active jobs…" className="pl-8 h-9"/></div>
        {isLoading ? <div className="space-y-2">{[1,2,3,4].map((i) => <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse"/>)}</div> : filtered.length === 0 ? <div className="rounded-lg border border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">No active jobs found.</div> : <div className="rounded-lg border border-border/60 overflow-hidden"><table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr className="text-left border-b border-border/60 bg-muted/30"><th className="font-medium px-4 py-2.5 w-32">Job no.</th><th className="font-medium px-3 py-2.5">Job</th><th className="font-medium px-3 py-2.5">Client / site</th><th className="font-medium px-3 py-2.5 w-36">Job lead</th><th className="w-28"/></tr></thead><tbody>{filtered.map((job) => <tr key={job.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20"><td className="px-4 py-3 font-medium">{job.job_number || job.xero_invoice_number || "—"}</td><td className="px-3 py-3">{job.production_title || job.title}</td><td className="px-3 py-3 text-muted-foreground">{[job.clients?.name, job.stores?.name].filter(Boolean).join(" · ") || "Ad-hoc / wholesale"}</td><td className="px-3 py-3 text-muted-foreground">{job.job_lead_name || "—"}</td><td className="px-3 py-2 text-right"><Button size="sm" variant="outline" onClick={() => router.push(`/quoting/jobs/${job.id}?tab=time`)}>Enter time</Button></td></tr>)}</tbody></table></div>}
      </TabsContent>
      <TabsContent value="materials"><div className="rounded-lg border border-border/60 px-5 py-8"><div className="font-medium">Direct materials entry</div><div className="mt-1 text-sm text-muted-foreground">This tab is reserved for quickly recording actual materials used against active jobs. We can finish this workflow after the scan test.</div></div></TabsContent>
      <TabsContent value="scans">
        <div className="mb-3 flex items-center justify-between"><div><div className="font-medium">Incoming job cards</div><div className="text-sm text-muted-foreground">Scans emailed to jobcards@rodier.co.nz will appear here for checking before anything is posted to a job.</div></div></div>
        {scansLoading ? <div className="h-20 rounded-lg bg-muted/40 animate-pulse"/> : !scans?.length ? <div className="rounded-lg border border-dashed border-border px-5 py-12 text-center"><ScanLine className="mx-auto mb-3 size-7 text-muted-foreground"/><div className="font-medium">Waiting for the first scanned job card</div><div className="mt-1 text-sm text-muted-foreground">Once the mailbox importer is live, incoming PDF/JPG/PNG job cards will queue here.</div></div> : <div className="rounded-lg border border-border/60 overflow-hidden"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><th className="px-3 py-2.5">Received</th><th className="px-3 py-2.5">File</th><th className="px-3 py-2.5">Matched job</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Confidence</th></tr></thead><tbody>{scans.map(scan => <tr key={scan.id} className="border-b last:border-0"><td className="px-3 py-3 text-muted-foreground">{scan.received_at ? new Date(scan.received_at).toLocaleString("en-NZ") : "—"}</td><td className="px-3 py-3"><div className="font-medium">{scan.attachment_name || scan.subject || "Job card"}</div></td><td className="px-3 py-3">{scan.costing_jobs?.job_number || scan.detected_job_number || "—"}</td><td className="px-3 py-3"><span className="rounded-full bg-muted px-2 py-1 text-xs">{statusLabel[scan.status] || scan.status}</span></td><td className="px-3 py-3 text-muted-foreground">{scan.confidence == null ? "—" : `${Math.round(Number(scan.confidence) * 100)}%`}</td></tr>)}</tbody></table></div>}
      </TabsContent>
    </Tabs>
  </PageShell></DashboardLayout>
}
