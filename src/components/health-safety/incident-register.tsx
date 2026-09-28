"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type Category = "incident" | "near_miss" | "hazard"
type Status = "reported" | "in_review" | "closed"
type Incident = {
  id: string; category: Category; status: Status; occurred_at: string; site: string
  job_id: string | null; job_reference: string | null; summary: string; description: string
  immediate_action: string | null; people_affected: string | null; injury_or_damage: string | null
  notified: string | null; corrective_action: string | null; action_owner: string | null
  action_due: string | null; outcome: string | null; reported_at: string; reported_by: string
  reviewed_by: string | null; closed_at: string | null
}
type Attachment = { id: string; incident_id: string; file_name: string; storage_path: string }
type Audit = { id: number; entity_id: string; action: string; at: string; snapshot: { status?: string; corrective_action?: string; outcome?: string } }
type Job = { id: string; title: string; job_number: string | null }
const categoryName: Record<Category, string> = { incident: "Incident", near_miss: "Near miss", hazard: "Hazard" }
const statusName: Record<Status, string> = { reported: "Reported", in_review: "In review", closed: "Closed" }
const localDateTime = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const displayDate = (value: string) => new Date(value).toLocaleString("en-NZ", { dateStyle: "medium", timeStyle: "short" })

export function IncidentRegister({ jobFromUrl, jobs, userId, canManage }: {
  jobFromUrl: string; jobs: Job[]; userId: string; canManage: boolean
}) {
  const db = useMemo(() => createClient(), [])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [category, setCategory] = useState<Category>("incident")
  const [occurredAt, setOccurredAt] = useState(localDateTime)
  const [site, setSite] = useState("")
  const [jobId, setJobId] = useState(jobFromUrl)
  const [summary, setSummary] = useState("")
  const [description, setDescription] = useState("")
  const [immediateAction, setImmediateAction] = useState("")
  const [peopleAffected, setPeopleAffected] = useState("")
  const [injuryOrDamage, setInjuryOrDamage] = useState("")
  const [notified, setNotified] = useState("")
  const [status, setStatus] = useState<Status>("reported")
  const [correctiveAction, setCorrectiveAction] = useState("")
  const [actionOwner, setActionOwner] = useState("")
  const [actionDue, setActionDue] = useState("")
  const [outcome, setOutcome] = useState("")
  const current = incidents.find(i => i.id === selected)

  const refresh = useCallback(async () => {
    const [reportResult, attachmentResult, auditResult] = await Promise.all([
      db.from("hs_incidents").select("*").order("occurred_at", { ascending: false }),
      db.from("hs_incident_attachments").select("*").order("created_at"),
      canManage ? db.from("hs_audit").select("id,entity_id,action,at,snapshot").eq("entity", "hs_incidents").order("at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ])
    setError(reportResult.error?.message || attachmentResult.error?.message || auditResult.error?.message || "")
    setIncidents((reportResult.data || []) as Incident[])
    setAttachments((attachmentResult.data || []) as Attachment[])
    setAudit((auditResult.data || []) as Audit[])
  }, [db, canManage])
  useEffect(() => { if (userId) { void (async () => { await refresh() })() } }, [userId, refresh])

  function open(row: Incident) {
    setCreating(false); setSelected(row.id); setStatus(row.status)
    setCorrectiveAction(row.corrective_action || ""); setActionOwner(row.action_owner || "")
    setActionDue(row.action_due || ""); setOutcome(row.outcome || "")
  }
  function newReport() {
    setCreating(true); setSelected(null); setCategory("incident"); setOccurredAt(localDateTime())
    setSite(""); setJobId(jobFromUrl); setSummary(""); setDescription("")
    setImmediateAction(""); setPeopleAffected(""); setInjuryOrDamage(""); setNotified("")
  }
  async function submit() {
    if (!userId || !site.trim() || !summary.trim() || !description.trim() || !occurredAt)
      return toast.error("Add the time, location, summary and what happened")
    const occurred = new Date(occurredAt)
    if (Number.isNaN(occurred.getTime())) return toast.error("Enter a valid date and time")
    const job = jobs.find(j => j.id === jobId)
    setBusy(true)
    try {
      const { data, error } = await db.from("hs_incidents").insert({
        category, occurred_at: occurred.toISOString(), site: site.trim(), job_id: jobId || null,
        job_reference: job ? `${job.job_number || ""} ${job.title}`.trim() : null,
        summary: summary.trim(), description: description.trim(),
        immediate_action: immediateAction.trim() || null, people_affected: peopleAffected.trim() || null,
        injury_or_damage: injuryOrDamage.trim() || null, notified: notified.trim() || null,
        reported_by: userId,
      }).select("id").single()
      if (error) throw error
      toast.success("Report submitted")
      setCreating(false); setSelected(data.id); await refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not submit report") }
    finally { setBusy(false) }
  }
  async function saveFollowUp() {
    if (!current || !canManage) return
    if (status === "closed" && !outcome.trim()) return toast.error("Record an outcome before closing")
    setBusy(true)
    try {
      const { error } = await db.from("hs_incidents").update({
        status, corrective_action: correctiveAction.trim() || null, action_owner: actionOwner.trim() || null,
        action_due: actionDue || null, outcome: outcome.trim() || null,
      }).eq("id", current.id)
      if (error) throw error
      toast.success(status === "closed" ? "Report closed" : "Follow-up saved")
      await refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save follow-up") }
    finally { setBusy(false) }
  }
  async function upload(file: File) {
    if (!current || current.status === "closed") return
    const path = `incidents/${current.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    setBusy(true)
    try {
      const { error: uploadError } = await db.storage.from("hs-incidents").upload(path, file, { upsert: false })
      if (uploadError) throw uploadError
      const { error } = await db.from("hs_incident_attachments").insert({
        incident_id: current.id, file_name: file.name, storage_path: path,
        content_type: file.type, uploaded_by: userId,
      })
      if (error) throw error
      toast.success("Evidence attached"); await refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not attach file") }
    finally { setBusy(false) }
  }
  async function openFile(path: string) {
    const { data, error } = await db.storage.from("hs-incidents").createSignedUrl(path, 60)
    if (error || !data) return toast.error(error?.message || "Could not open file")
    window.open(data.signedUrl, "_blank", "noopener,noreferrer")
  }
  const filtered = incidents.filter(i => (!jobFromUrl || i.job_id === jobFromUrl)
    && (statusFilter === "all" || i.status === statusFilter)
    && (!search || [i.summary, i.site, i.job_reference, i.category].some(v => (v || "").toLowerCase().includes(search.toLowerCase()))))

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-lg font-semibold">Incident reports</h2><p className="text-sm text-muted-foreground">Report incidents, near misses and hazards. Reports are private to the reporter and H&S admins.</p></div>
      <Button onClick={newReport}>Report an incident or hazard</Button>
    </div>
    {error && <p className="rounded-md border border-destructive/40 p-3 text-sm">{error}</p>}
    {creating && <div className="max-w-3xl space-y-4 rounded-lg border p-4">
      <h3 className="font-semibold">New report</h3>
      <p className="text-sm text-muted-foreground">If anyone needs urgent help, get help first. Record what happened as soon as it is safe. Once submitted, the original report is locked.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">Report type<select className="h-9 w-full rounded-md border bg-background px-2" value={category} onChange={e => setCategory(e.target.value as Category)}><option value="incident">Incident / injury / damage</option><option value="near_miss">Near miss</option><option value="hazard">Hazard</option></select></label>
        <label className="space-y-1 text-sm">Date and time<Input type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)} /></label>
        <label className="space-y-1 text-sm">Location / site<Input value={site} onChange={e => setSite(e.target.value)} placeholder="Where did it happen?" /></label>
        <label className="space-y-1 text-sm">RPM job, if applicable<select className="h-9 w-full rounded-md border bg-background px-2" value={jobId} onChange={e => setJobId(e.target.value)}><option value="">No job linked</option>{jobs.map(j => <option key={j.id} value={j.id}>{j.job_number ? `${j.job_number} · ` : ""}{j.title}</option>)}</select></label>
      </div>
      <label className="block space-y-1 text-sm">Short summary<Input value={summary} onChange={e => setSummary(e.target.value)} placeholder="e.g. Ladder slipped during sign installation" /></label>
      <label className="block space-y-1 text-sm">What happened?<Textarea value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label className="block space-y-1 text-sm">Immediate action taken<Textarea value={immediateAction} onChange={e => setImmediateAction(e.target.value)} placeholder="First aid, stopped work, area made safe…" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">People affected, if any<Input value={peopleAffected} onChange={e => setPeopleAffected(e.target.value)} /></label>
        <label className="space-y-1 text-sm">Injury or damage, if any<Input value={injuryOrDamage} onChange={e => setInjuryOrDamage(e.target.value)} /></label>
      </div>
      <label className="block space-y-1 text-sm">Who was notified?<Input value={notified} onChange={e => setNotified(e.target.value)} placeholder="Supervisor, site contact, emergency services…" /></label>
      <div className="flex gap-2"><Button disabled={busy} onClick={() => void submit()}>Submit report</Button><Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button></div>
    </div>}
    {!creating && <div className="flex flex-wrap gap-2"><Input aria-label="Search incident reports" placeholder="Search summary, site or job" className="max-w-xs" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Incident status" className="rounded-md border bg-background px-2 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="reported">Reported</option><option value="in_review">In review</option><option value="closed">Closed</option></select></div>}
    {!creating && <div className="grid gap-4 lg:grid-cols-[minmax(230px,1fr)_minmax(0,2fr)]">
      <div className="rounded-lg border">{filtered.map(i => <button key={i.id} className={`block w-full border-b p-3 text-left text-sm last:border-0 hover:bg-muted/40 ${selected === i.id ? "bg-muted/50" : ""}`} onClick={() => open(i)}><strong>{i.summary}</strong><span className="block text-muted-foreground">{categoryName[i.category]} · {statusName[i.status]} · {displayDate(i.occurred_at)}</span><span className="block text-muted-foreground">{i.site}{i.job_reference ? ` · ${i.job_reference}` : ""}</span></button>)}{filtered.length === 0 && <p className="p-4 text-sm text-muted-foreground">No matching reports.</p>}</div>
      <div>{current ? <div className="space-y-4 rounded-lg border p-4 text-sm">
        <div><h3 className="text-lg font-semibold">{current.summary}</h3><p className="text-muted-foreground">{categoryName[current.category]} · {statusName[current.status]} · {displayDate(current.occurred_at)}</p><p className="text-muted-foreground">{current.site}{current.job_reference ? ` · ${current.job_reference}` : ""}</p></div>
        <div><strong>What happened</strong><p className="whitespace-pre-wrap">{current.description}</p></div>
        {current.immediate_action && <div><strong>Immediate action</strong><p className="whitespace-pre-wrap">{current.immediate_action}</p></div>}
        {current.people_affected && <div><strong>People affected</strong><p>{current.people_affected}</p></div>}
        {current.injury_or_damage && <div><strong>Injury or damage</strong><p>{current.injury_or_damage}</p></div>}
        {current.notified && <div><strong>Notified</strong><p>{current.notified}</p></div>}
        <p className="text-muted-foreground">Reported {displayDate(current.reported_at)}</p>
        <div className="space-y-2 border-t pt-3"><h4 className="font-semibold">Photos and attachments</h4>{attachments.filter(a => a.incident_id === current.id).map(a => <button key={a.id} className="block text-primary underline" onClick={() => void openFile(a.storage_path)}>{a.file_name}</button>)}{current.status !== "closed" && <Input aria-label="Attach incident evidence" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file) }} />}</div>
        <div className="space-y-3 border-t pt-3"><h4 className="font-semibold">Follow-up</h4>{canManage && current.status !== "closed" ? <>
          <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1">Status<select className="h-9 w-full rounded-md border bg-background px-2" value={status} onChange={e => setStatus(e.target.value as Status)}><option value="reported">Reported</option><option value="in_review">In review</option><option value="closed">Closed</option></select></label><label className="space-y-1">Action due<Input type="date" value={actionDue} onChange={e => setActionDue(e.target.value)} /></label></div>
          <label className="block space-y-1">Action owner<Input value={actionOwner} onChange={e => setActionOwner(e.target.value)} /></label>
          <label className="block space-y-1">Corrective action<Textarea value={correctiveAction} onChange={e => setCorrectiveAction(e.target.value)} /></label>
          <label className="block space-y-1">Outcome / closure notes<Textarea value={outcome} onChange={e => setOutcome(e.target.value)} /></label>
          <Button disabled={busy} onClick={() => void saveFollowUp()}>Save follow-up</Button>
        </> : <><p className="whitespace-pre-wrap">{current.corrective_action || "No corrective action recorded yet."}</p>{current.action_owner && <p>Owner: {current.action_owner}</p>}{current.action_due && <p>Due: {current.action_due}</p>}{current.outcome && <p className="whitespace-pre-wrap">Outcome: {current.outcome}</p>}{current.closed_at && <p>Closed {displayDate(current.closed_at)}</p>}</>}</div>
        {canManage && <div className="border-t pt-3"><h4 className="font-semibold">Change history</h4>{audit.filter(a => a.entity_id === current.id).map(a => <p key={a.id} className="text-muted-foreground">{displayDate(a.at)} · {a.action === "INSERT" ? "Report submitted" : `${statusName[a.snapshot.status as Status] || "Follow-up"} updated`}</p>)}</div>}
      </div> : <p className="rounded-lg border p-4 text-muted-foreground">Select a report to view its details.</p>}</div>
    </div>}
  </div>
}

