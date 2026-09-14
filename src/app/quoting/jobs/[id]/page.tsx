"use client"

import { useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Briefcase, FileText, Pencil } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageShell } from "@/components/page-shell"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { CostingJobForm } from "@/components/costing-job-form"
import { ItemsList } from "@/components/costing/items-list"
import { ProductionItems } from "@/components/costing/production-items"
import { CostingActuals } from "@/components/costing/costing-actuals"
import { EstVsActual } from "@/components/costing/est-vs-actual"
import { toast } from "sonner"
import type { CostingJob } from "@/types/database"

function formatDate(value?: string | null) {
  if (!value) return "Not set"
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })
}

export default function ActiveJobDetailPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [editOpen, setEditOpen] = useState(false)
  const [editingDate, setEditingDate] = useState(false)
  const [dateValue, setDateValue] = useState("")

  const { data, isLoading, mutate } = useSupabaseQuery<CostingJob | null>(id ? `active-job-${id}` : null, async () => {
    const { data: job, error } = await supabase.from("costing_jobs").select(`*, clients ( name ), stores ( name )`).eq("id", id).single()
    if (error) throw error
    return { data: job as CostingJob, error: null }
  })

  const job = data || undefined

  async function saveCompletionDate() {
    if (!job) return
    const { error } = await supabase.from("costing_jobs").update({ completion_date: dateValue || null, updated_at: new Date().toISOString() }).eq("id", job.id)
    if (error) return toast.error(error.message)
    toast.success("Complete by date updated")
    setEditingDate(false)
    mutate()
  }

  return <DashboardLayout><PageShell>
    <Button variant="ghost" size="sm" className="mb-2 -ml-2 gap-1.5 text-muted-foreground" onClick={() => router.push("/quoting/jobs")}>
      <ArrowLeft className="size-3.5"/> Active Jobs
    </Button>

    {isLoading ? <div className="h-28 rounded-lg bg-muted/40 animate-pulse"/> : !job ? <div className="py-16 text-center text-muted-foreground">Job not found.</div> : <>
      <div className="flex items-start justify-between gap-4 pb-5 border-b border-border/60">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <Briefcase className="size-5 text-muted-foreground shrink-0"/>
            <h1 className="text-[1.7rem] font-semibold tracking-tight">{job.title}</h1>
            <button onClick={() => setEditOpen(true)} className="p-1 text-muted-foreground hover:text-foreground" title="Edit job"><Pencil className="size-4"/></button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{[job.clients?.name || "Ad-hoc / wholesale", job.stores?.name].filter(Boolean).join(" · ")}</p>
          {job.reference && <p className="mt-0.5 text-xs text-muted-foreground">{job.reference}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {job.xero_quote_number && <span>Xero quote: <strong className="text-foreground">{job.xero_quote_number}</strong></span>}
            {job.xero_invoice_number && <span>Xero invoice: <strong className="text-foreground">{job.xero_invoice_number}</strong></span>}
            <span>Job no: <strong className="text-foreground">{job.job_number || job.xero_invoice_number || "—"}</strong></span>
            {editingDate ? <span className="inline-flex items-center gap-1.5"><span>Complete by:</span><Input type="date" value={dateValue} onChange={(e) => setDateValue(e.target.value)} className="h-7 w-36 text-xs"/><Button size="xs" onClick={saveCompletionDate}>Save</Button><Button size="xs" variant="ghost" onClick={() => setEditingDate(false)}>Cancel</Button></span> : <button className="hover:underline" onClick={() => { setDateValue(job.completion_date || ""); setEditingDate(true) }}>Complete by: <strong className="text-foreground">{formatDate(job.completion_date)}</strong> <Pencil className="ml-1 inline size-3"/></button>}
          </div>
          {job.details && <p className="mt-3 max-w-3xl text-sm text-muted-foreground whitespace-pre-wrap">{job.details}</p>}
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5 h-9 shrink-0"><Link href={`/quoting/${id}/job-card`} target="_blank"><FileText className="size-3.5"/> Job card</Link></Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader><DialogTitle>Edit active job</DialogTitle><DialogDescription>Change the production job title, customer/site, contact, reference or scope. The approved quote remains unchanged.</DialogDescription></DialogHeader>
          <CostingJobForm job={job} onSuccess={() => { setEditOpen(false); mutate() }} onCancel={() => setEditOpen(false)}/>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="production" className="mt-5">
        <TabsList>
          <TabsTrigger value="production">Production Items</TabsTrigger>
          <TabsTrigger value="quoted">Quoted Items</TabsTrigger>
          <TabsTrigger value="actuals">Actuals</TabsTrigger>
          <TabsTrigger value="est-vs-actual">Est vs Actual</TabsTrigger>
        </TabsList>
        <TabsContent value="production" className="pt-3"><ProductionItems jobId={job.id}/></TabsContent>
        <TabsContent value="quoted" className="pt-3"><div className="mb-3 text-sm text-muted-foreground">Approved quote snapshot — read only.</div><div className="pointer-events-none select-none opacity-90"><ItemsList job={job}/></div></TabsContent>
        <TabsContent value="actuals"><CostingActuals job={job}/></TabsContent>
        <TabsContent value="est-vs-actual"><EstVsActual job={job}/></TabsContent>
      </Tabs>
    </>}
  </PageShell></DashboardLayout>
}
