"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Briefcase, FileText, Pencil, Trash2 } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { ItemsList } from "@/components/costing/items-list"
import { CostingActuals } from "@/components/costing/costing-actuals"
import { EstVsActual } from "@/components/costing/est-vs-actual"
import { TimeEntries } from "@/components/costing/time-entries"
import { JobXeroInvoice } from "@/components/costing/job-xero-invoice"
import { InstallerActivity } from "@/components/costing/installer-activity"
import { toast } from "sonner"
import type { CostingJob } from "@/types/database"

type ActiveJob = CostingJob & {
  production_title?: string | null
  production_details?: string | null
  production_contact_name?: string | null
}

function formatDate(value?: string | null) {
  if (!value) return "Not set"
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })
}

export default function ActiveJobDetailPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const searchParams = useSearchParams()
  const { id } = useParams<{ id: string }>()
  const requestedTab = searchParams.get("tab")
  const activeTab = requestedTab === "time" || requestedTab === "actuals" || requestedTab === "est-vs-actual" || requestedTab === "install" ? requestedTab : "items"
  const [editOpen, setEditOpen] = useState(false)
  const [editingDate, setEditingDate] = useState(false)
  const [dateValue, setDateValue] = useState("")
  const [editTitle, setEditTitle] = useState("")
  const [editDetails, setEditDetails] = useState("")
  const [editContact, setEditContact] = useState("")
  const [editQuotedBy, setEditQuotedBy] = useState("")
  const [editJobLead, setEditJobLead] = useState("")
  const [teamMembers, setTeamMembers] = useState<string[]>([])
  const [canManageXero, setCanManageXero] = useState(false)
  const [savingJob, setSavingJob] = useState(false)
  const [deletingJob, setDeletingJob] = useState(false)

  const { data, isLoading, mutate } = useSupabaseQuery<ActiveJob | null>(id ? `active-job-${id}` : null, async () => {
    const { data: job, error } = await supabase.from("costing_jobs").select(`*, clients ( name ), stores ( name )`).eq("id", id).single()
    if (error) throw error
    return { data: job as ActiveJob, error: null }
  })

  const job = data || undefined
  const jobTitle = job?.production_title || job?.title || ""
  const jobDetails = job?.production_details ?? job?.details ?? ""
  const jobContact = job?.production_contact_name ?? job?.contact_name ?? ""
  const clientSite = job ? [job.clients?.name || "Ad-hoc / wholesale", job.stores?.name].filter(Boolean).join(" · ") : ""

  useEffect(() => {
    async function fetchTeamMembers() {
      const [{ data: team }, { data: auth }] = await Promise.all([
        supabase.from("users").select("id,name,email,role").order("name"),
        supabase.auth.getUser(),
      ])
      const teamRows = (team || []) as Array<{ id: string; name: string | null; email: string | null; role: string | null }>
      setTeamMembers(Array.from(new Set(teamRows.map((member) => member.name?.trim() || member.email?.split("@")[0]).filter(Boolean) as string[])))
      const role = teamRows.find((member) => member.id === auth.user?.id)?.role
      setCanManageXero(role === "super_admin" || role === "rodier_admin")
    }
    void fetchTeamMembers()
  }, [supabase])

  function openEdit() {
    if (!job) return
    setEditTitle(jobTitle)
    setEditDetails(jobDetails)
    setEditContact(jobContact)
    setEditQuotedBy(job.quoted_by_name || "")
    setEditJobLead(job.job_lead_name || "")
    setEditOpen(true)
  }

  async function saveJobEdits() {
    if (!job || !editTitle.trim()) return
    setSavingJob(true)
    const { error } = await supabase.from("costing_jobs").update({
      production_title: editTitle.trim(),
      production_details: editDetails.trim() || null,
      production_contact_name: editContact.trim() || null,
      quoted_by_name: editQuotedBy.trim() || null,
      job_lead_name: editJobLead.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id)
    setSavingJob(false)
    if (error) return toast.error(error.message)
    toast.success("Active job updated")
    setEditOpen(false)
    mutate()
  }

  async function saveCompletionDate() {
    if (!job) return
    const { error } = await supabase.from("costing_jobs").update({ completion_date: dateValue || null, updated_at: new Date().toISOString() }).eq("id", job.id)
    if (error) return toast.error(error.message)
    toast.success("Complete by date updated")
    setEditingDate(false)
    mutate()
  }

  async function deleteJob() {
    if (!job || deletingJob) return
    const jobNumber = job.job_number || job.xero_invoice_number || "no job number"
    const confirmed = window.confirm(
      `Delete \"${jobTitle}\" (${jobNumber}) from RPM?\n\nThis permanently removes this RPM job and its RPM costing/actual data. It does NOT delete or change anything in Xero.`
    )
    if (!confirmed) return

    setDeletingJob(true)
    try {
      const response = await fetch(`/api/costing/jobs/${job.id}`, { method: "DELETE" })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || "Could not delete the RPM job.")
      toast.success(`Deleted ${jobTitle} from RPM. Xero was not changed.`)
      router.push("/quoting/jobs")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the RPM job.")
    } finally {
      setDeletingJob(false)
    }
  }

  return <DashboardLayout><PageShell width="full" className="px-4 xl:px-6 gap-2 py-4">
    {isLoading ? <div className="h-24 rounded-lg bg-muted/40 animate-pulse"/> : !job ? <div className="py-16 text-center text-muted-foreground">Job not found.</div> : <>
      <PageHeader
        icon={Briefcase}
        kicker="Job & Project Management"
        title={jobTitle}
        description={clientSite}
        actions={<>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={() => router.push("/quoting/jobs")}>
            <ArrowLeft className="size-3.5"/> Active Jobs
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={openEdit}>
            <Pencil className="size-3.5"/> Edit
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5 h-8"><Link href={`/quoting/${id}/job-pack`}><FileText className="size-3.5"/> Job pack</Link></Button>
          {canManageXero && <JobXeroInvoice job={job} onChanged={() => mutate()} />}
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-destructive hover:text-destructive" onClick={deleteJob} disabled={deletingJob}>
            <Trash2 className="size-3.5"/> {deletingJob ? "Deleting…" : "Delete Job"}
          </Button>
        </>}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1 text-xs text-muted-foreground">
        {job.xero_quote_number && <span>Xero quote: <strong className="text-foreground">{job.xero_quote_number}</strong></span>}
        {job.xero_invoice_number && <span>Xero invoice: <strong className="text-foreground">{job.xero_invoice_number}</strong></span>}
        <span>Job no: <strong className="text-foreground">{job.job_number || job.xero_invoice_number || "—"}</strong></span>
        <span>Quoted by: <strong className="text-foreground">{job.quoted_by_name || "—"}</strong></span>
        <span>Job lead: <strong className="text-foreground">{job.job_lead_name || "Unassigned"}</strong></span>
        {editingDate ? <span className="inline-flex items-center gap-1.5"><span>Complete by:</span><Input type="date" value={dateValue} onChange={(e) => setDateValue(e.target.value)} className="h-7 w-36 text-xs"/><Button size="xs" onClick={saveCompletionDate}>Save</Button><Button size="xs" variant="ghost" onClick={() => setEditingDate(false)}>Cancel</Button></span> : <button className="hover:underline" onClick={() => { setDateValue(job.completion_date || ""); setEditingDate(true) }}>Complete by: <strong className="text-foreground">{formatDate(job.completion_date)}</strong> <Pencil className="ml-1 inline size-3"/></button>}
        {jobContact && <span><span className="font-medium text-foreground">Contact:</span> {jobContact}</span>}
        {job.reference && <span><span className="font-medium text-foreground">Ref:</span> {job.reference}</span>}
      </div>
      {jobDetails && <div className="rounded-md bg-muted/25 px-2.5 py-1.5 text-xs leading-4 text-muted-foreground whitespace-pre-wrap">{jobDetails}</div>}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader><DialogTitle>Edit active job</DialogTitle><DialogDescription>These changes apply to the production job. The completed quote remains available in quote history.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-2"><Label>Job title</Label><Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}/></div>
            <div className="grid gap-2"><Label>Contact</Label><Input value={editContact} onChange={(e) => setEditContact(e.target.value)} placeholder="Site / job contact"/></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2"><Label>Quoted by</Label><Input list="active-job-team-members" value={editQuotedBy} onChange={(e) => setEditQuotedBy(e.target.value)} placeholder="e.g. Stu"/></div>
              <div className="grid gap-2"><Label>Job lead</Label><Input list="active-job-team-members" value={editJobLead} onChange={(e) => setEditJobLead(e.target.value)} placeholder="e.g. Darren"/></div>
              <datalist id="active-job-team-members">{teamMembers.map((name) => <option key={name} value={name}/>)}</datalist>
            </div>
            <div className="grid gap-2"><Label>Job description / scope</Label><Textarea value={editDetails} onChange={(e) => setEditDetails(e.target.value)} className="min-h-[140px]"/></div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button><Button onClick={saveJobEdits} disabled={savingJob}>{savingJob ? "Saving…" : "Save job"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={(value) => router.replace(`/quoting/jobs/${id}${value === "items" ? "" : `?tab=${value}`}`)} className="mt-1">
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="time">Time</TabsTrigger>
          <TabsTrigger value="actuals">Actuals</TabsTrigger>
          <TabsTrigger value="est-vs-actual">Est vs Actual</TabsTrigger>
          <TabsTrigger value="install">Install</TabsTrigger>
        </TabsList>
        <TabsContent value="items" className="mt-0 [&>div]:!mt-2 [&>div]:!space-y-3"><ItemsList job={job}/></TabsContent>
        <TabsContent value="time" className="mt-1"><TimeEntries job={job}/></TabsContent>
        <TabsContent value="actuals" className="mt-1"><CostingActuals job={job}/></TabsContent>
        <TabsContent value="est-vs-actual" className="mt-1"><EstVsActual job={job}/></TabsContent>
        <TabsContent value="install" className="mt-1"><InstallerActivity jobId={id}/></TabsContent>
      </Tabs>
    </>}
  </PageShell></DashboardLayout>
}
