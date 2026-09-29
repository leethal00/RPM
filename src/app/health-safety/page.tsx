"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import DashboardLayout from "@/components/dashboard-layout"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient } from "@/lib/supabase/client"
import { IncidentRegister } from "@/components/health-safety/incident-register"

type Kind = "toolbox" | "swms"
type WorkStep = { task: string; hazard: string; risk: string; control: string; responsible: string }
type Body = { scope: string; hazards: string; controls: string; emergency: string; actions: string; notes: string;
  run_by: string; previous_actions: string; safety_topics: string; operations: string;
  principal: string; client: string; responsible: string; duration: string; notification: string; permits: string; ppe: string; plant: string; signage: string; approvals: string; checks: string; qualifications: string; steps: WorkStep[] }
type TextField = Exclude<keyof Body, "steps">
type Template = { id: string; kind: Kind; title: string; body: Body; version: number; active: boolean; updated_at: string }
type RecordRow = { id: string; kind: Kind; title: string; status: "draft" | "completed"; job_id: string | null; job_reference: string | null; site: string | null; work_date: string; body: Body; template_id: string | null; template_version: number | null; revision_of: string | null; revision: number; completed_at: string | null; created_at: string }
type Attendee = { id: string; record_id: string; name: string; user_id: string | null; signed_at: string | null }
type Attachment = { id: string; record_id: string; file_name: string; storage_path: string }
type Training = { id: string; staff_name: string; user_id: string | null; training: string; competency: string | null; reference: string | null; completed_on: string | null; expires_on: string | null; notes: string | null; evidence_path: string | null }
type Policy = { id: string; title: string; version: string; effective_on: string | null; review_due_on: string | null; file_name: string; storage_path: string; created_at: string }
type Audit = { id: number; entity: string; entity_id: string; action: string; at: string; snapshot: { version?: number; title?: string } }
type Job = { id: string; title: string; job_number: string | null; store_id: string | null }
type UserRow = { id: string; name: string | null; email: string | null; role: string }
const blank: Body = { scope: "", hazards: "", controls: "", emergency: "", actions: "", notes: "", run_by: "", previous_actions: "", safety_topics: "", operations: "", principal: "", client: "", responsible: "", duration: "", notification: "", permits: "", ppe: "", plant: "", signage: "", approvals: "", checks: "", qualifications: "", steps: [] }
function reusableBody(kind: Kind, source: Body): Body {
  const body = { ...blank, ...source, steps: source.steps || [] }
  if (kind === "swms") return { ...body, principal: "", client: "", responsible: "", duration: "", notification: "", permits: "", approvals: "", emergency: "", actions: "", notes: "" }
  return { ...body, run_by: "", previous_actions: "", actions: "", notes: "" }
}
const today = () => new Date().toISOString().slice(0, 10)
const niceDate = (date: string | null) => date ? new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString("en-NZ") : "—"

export default function HealthSafetyPage() {
  const db = useMemo(() => createClient(), [])
  const params = useSearchParams()
  const jobFromUrl = params.get("job") || ""
  const [tab, setTab] = useState(params.get("tab") === "incidents" ? "incidents" : "overview")
  const [clockDate] = useState(today)
  const [soonDate] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10))
  const [userId, setUserId] = useState("")
  const [role, setRole] = useState("")
  const [records, setRecords] = useState<RecordRow[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [training, setTraining] = useState<Training[]>([])
  const [policies, setPolicies] = useState<Policy[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [kind, setKind] = useState<Kind>("swms")
  const [title, setTitle] = useState("")
  const [site, setSite] = useState("")
  const [date, setDate] = useState(today())
  const [jobId, setJobId] = useState(jobFromUrl)
  const [body, setBody] = useState<Body>(blank)
  const [templateId, setTemplateId] = useState("")
  const [templateEditId, setTemplateEditId] = useState("")
  const [people, setPeople] = useState("")
  const [search, setSearch] = useState("")
  const [filterKind, setFilterKind] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [trainingStaff, setTrainingStaff] = useState("")
  const [trainingEditId, setTrainingEditId] = useState("")
  const [trainingName, setTrainingName] = useState("")
  const [trainingDate, setTrainingDate] = useState("")
  const [trainingExpiry, setTrainingExpiry] = useState("")
  const [trainingCompetency, setTrainingCompetency] = useState("")
  const [trainingReference, setTrainingReference] = useState("")
  const [policyTitle, setPolicyTitle] = useState("Health & Safety Policy")
  const [policyVersion, setPolicyVersion] = useState("")
  const [policyEffective, setPolicyEffective] = useState("")
  const [policyReview, setPolicyReview] = useState("")
  const [policyPreview, setPolicyPreview] = useState<{ path: string; url: string; error: string } | null>(null)
  const canManage = role === "super_admin" || role === "rodier_admin"
  const current = records.find(r => r.id === selected)
  const latestPolicy = policies[0]

  const refresh = useCallback(async () => {
    const results = await Promise.all([
      db.from("hs_records").select("*").order("work_date", { ascending: false }),
      db.from("hs_templates").select("*").order("title"),
      db.from("hs_attendees").select("*").order("created_at"),
      db.from("hs_attachments").select("*").order("created_at"),
      db.from("hs_training").select("*").order("staff_name"),
      db.from("hs_policies").select("*").order("created_at", { ascending: false }),
      db.from("costing_jobs").select("id,title,job_number,store_id").eq("is_template", false).order("created_at", { ascending: false }).limit(500),
      db.from("users").select("id,name,email,role").order("name"),
      db.from("hs_audit").select("id,entity,entity_id,action,at,snapshot").eq("entity", "hs_templates").order("at", { ascending: false }),
    ])
    const firstError = results.slice(0, 6).find(r => r.error)?.error
    setError(firstError?.message || "")
    setRecords((results[0].data || []) as RecordRow[])
    setTemplates((results[1].data || []) as Template[])
    setAttendees((results[2].data || []) as Attendee[])
    setAttachments((results[3].data || []) as Attachment[])
    setTraining((results[4].data || []) as Training[])
    setPolicies((results[5].data || []) as Policy[])
    setJobs((results[6].data || []) as Job[])
    setUsers((results[7].data || []) as UserRow[])
    setAudit((results[8].data || []) as Audit[])
  }, [db])

  useEffect(() => {
    void (async () => {
      const { data } = await db.auth.getUser()
      if (!data.user) return
      setUserId(data.user.id)
      const { data: profile } = await db.from("users").select("role").eq("id", data.user.id).single()
      setRole(profile?.role || "")
      await refresh()
    })()
  }, [db, refresh])

  useEffect(() => {
    if (!latestPolicy?.storage_path) return
    let active = true
    void (async () => {
      const { data, error } = await db.storage.from("health-safety").createSignedUrl(latestPolicy.storage_path, 3600)
      if (active) setPolicyPreview({ path: latestPolicy.storage_path, url: data?.signedUrl || "", error: error?.message || "" })
    })()
    return () => { active = false }
  }, [db, latestPolicy?.storage_path])

  const filtered = records.filter(r => {
    const term = search.toLowerCase()
    return (filterKind === "all" || r.kind === filterKind) && (filterStatus === "all" || r.status === filterStatus)
      && (!jobFromUrl || r.job_id === jobFromUrl)
      && (!term || [r.title, r.site, r.job_reference, r.body?.scope].some(v => (v || "").toLowerCase().includes(term)))
  })
  const visibleRecords = jobFromUrl ? records.filter(r => r.job_id === jobFromUrl) : records
  const due = training.filter(t => t.expires_on && soonDate && t.expires_on <= soonDate)
  const swmsTemplates = templates.filter(t => t.active && t.kind === "swms")

  function newRecord(newKind: Kind) {
    setSelected(null); setKind(newKind); setTitle(""); setSite(""); setDate(today()); setJobId(jobFromUrl)
    setBody(blank); setTemplateId(""); setTemplateEditId(""); setPeople(""); setRevisionSource(null); setTab("form")
  }
  function openRecord(row: RecordRow) {
    setRevisionSource(null)
    setSelected(row.id); setKind(row.kind); setTitle(row.title); setSite(row.site || ""); setDate(row.work_date)
    setJobId(row.job_id || ""); setBody({ ...blank, ...row.body }); setTemplateId(row.template_id || "")
    setTemplateEditId("")
    setPeople(attendees.filter(a => a.record_id === row.id).map(a => a.name).join("\n")); setTab("form")
  }
  function applyTemplate(template: Template) {
    newRecord(template.kind); setTitle(template.title); setBody(reusableBody(template.kind, template.body)); setTemplateId(template.id)
  }
  function editTemplate(template: Template) {
    newRecord(template.kind); setTitle(template.title); setBody({ ...blank, ...template.body }); setTemplateEditId(template.id)
  }
  function field(key: TextField, label: string, hint?: string) {
    return <div className="space-y-1.5"><Label htmlFor={`hs-${key}`}>{label}</Label><Textarea id={`hs-${key}`} value={body[key]} onChange={e => setBody({ ...body, [key]: e.target.value })} placeholder={hint} disabled={!canManage || current?.status === "completed"} className="min-h-24" /></div>
  }
  function setStep(index: number, key: keyof WorkStep, value: string) {
    setBody(old => ({ ...old, steps: old.steps.map((step, i) => i === index ? { ...step, [key]: value } : step) }))
  }
  async function saveRecord(complete = false) {
    if (!canManage || !title.trim()) return toast.error("Add a title")
    if (complete && kind === "swms" && !site.trim()) return toast.error("Enter the work site before completing the SWMS/TA")
    setBusy(true)
    try {
      const template = templates.find(t => t.id === templateId)
      const job = jobs.find(j => j.id === jobId)
      const values = { kind, title: title.trim(), site: site.trim() || null, work_date: date, job_id: jobId || null,
        job_reference: job ? `${job.job_number || ""} ${job.title}`.trim() : null,
        body, template_id: templateId || null, template_version: template?.version || null }
      let id = selected
      if (current?.status === "completed") throw new Error("Create a revision to correct a completed record")
      if (id) {
        const { error } = await db.from("hs_records").update(values).eq("id", id)
        if (error) throw error
      } else {
        const { data, error } = await db.from("hs_records").insert({ ...values, created_by: userId, revision_of: revisionSource?.id || null, revision: revisionSource ? revisionSource.revision + 1 : 1 }).select("id").single()
        if (error) throw error
        id = data.id
        setSelected(id)
        setRevisionSource(null)
      }
      const existing = attendees.filter(a => a.record_id === id)
      const names = [...new Set(people.split(/[\n,]+/).map(n => n.trim()).filter(Boolean))]
      for (const name of names.filter(n => !existing.some(a => a.name.toLowerCase() === n.toLowerCase()))) {
        const matched = users.find(u => (u.name || "").toLowerCase() === name.toLowerCase())
        const { error } = await db.from("hs_attendees").insert({ record_id: id, name, user_id: matched?.id || null })
        if (error) throw error
      }
      if (complete) {
        const { error } = await db.from("hs_records").update({ status: "completed" }).eq("id", id)
        if (error) throw error
      }
      toast.success(complete ? "Completed and locked" : "Draft saved")
      await refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save record") } finally { setBusy(false) }
  }
  async function makeRevision() {
    if (!current || !canManage) return
    const original = current
    newRecord(original.kind)
    setTitle(original.title); setSite(original.site || ""); setDate(original.work_date); setJobId(original.job_id || "")
    setBody({ ...blank, ...original.body }); setTemplateId(original.template_id || "")
    setPeople(attendees.filter(a => a.record_id === original.id).map(a => a.name).join("\n"))
    // The next save creates a fresh record; preserve the link in a separate state.
    setRevisionSource(original)
  }
  const [revisionSource, setRevisionSource] = useState<RecordRow | null>(null)
  async function uploadEvidence(file: File) {
    if (!current || !canManage || current.status !== "draft") return
    const path = `records/${current.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    const { error: uploadError } = await db.storage.from("health-safety").upload(path, file, { upsert: false })
    if (uploadError) return toast.error(uploadError.message)
    const { error } = await db.from("hs_attachments").insert({ record_id: current.id, file_name: file.name, storage_path: path, content_type: file.type, uploaded_by: userId })
    if (error) return toast.error(error.message)
    toast.success("Evidence attached"); await refresh()
  }
  async function openFile(path: string) {
    const { data, error } = await db.storage.from("health-safety").createSignedUrl(path, 60)
    if (error || !data) return toast.error(error?.message || "Could not open file")
    window.open(data.signedUrl, "_blank", "noopener,noreferrer")
  }
  async function sign(a: Attendee) {
    const { error } = await db.from("hs_attendees").update({ signed_at: new Date().toISOString(), signed_by: userId }).eq("id", a.id)
    if (error) return toast.error(error.message)
    toast.success("Acknowledgement recorded"); await refresh()
  }
  async function saveTemplate(source?: RecordRow) {
    if (!canManage || (source?.kind || kind) !== "swms") return
    const editing = templates.find(t => t.id === templateEditId)
    const name = editing ? title : window.prompt("Template name", source?.title || title)
    if (!name?.trim()) return
    const sourceKind = source?.kind || kind
    const content = reusableBody(sourceKind, source?.body || body)
    const { error } = editing && !source
      ? await db.from("hs_templates").update({ title: name.trim(), body: content, version: editing.version + 1, updated_at: new Date().toISOString() }).eq("id", editing.id).eq("version", editing.version)
      : await db.from("hs_templates").insert({ kind: sourceKind, title: name.trim(), body: content, created_by: userId })
    if (error) return toast.error(error.message)
    toast.success(editing && !source ? "Template version saved" : "Reusable template saved"); setTemplateEditId(""); await refresh()
  }
  async function addTraining() {
    if (!trainingStaff.trim() || !trainingName.trim()) return toast.error("Enter a staff member and training")
    const matched = users.find(u => (u.name || "").toLowerCase() === trainingStaff.trim().toLowerCase())
    const values = { staff_name: trainingStaff.trim(), user_id: matched?.id || null, training: trainingName.trim(), competency: trainingCompetency || null, reference: trainingReference.trim() || null, completed_on: trainingDate || null, expires_on: trainingExpiry || null, updated_by: userId, updated_at: new Date().toISOString() }
    const { error } = trainingEditId ? await db.from("hs_training").update(values).eq("id", trainingEditId) : await db.from("hs_training").insert(values)
    if (error) return toast.error(error.message)
    setTrainingEditId(""); setTrainingStaff(""); setTrainingName(""); setTrainingDate(""); setTrainingExpiry(""); setTrainingCompetency(""); setTrainingReference(""); toast.success("Training saved"); await refresh()
  }
  function editTraining(row: Training) {
    setTrainingEditId(row.id); setTrainingStaff(row.staff_name); setTrainingName(row.training)
    setTrainingDate(row.completed_on || ""); setTrainingExpiry(row.expires_on || "")
    setTrainingCompetency(row.competency || ""); setTrainingReference(row.reference || "")
  }
  async function uploadTrainingEvidence(row: Training, file: File) {
    const path = `training/${row.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    const { error: uploadError } = await db.storage.from("health-safety").upload(path, file, { upsert: false })
    if (uploadError) return toast.error(uploadError.message)
    const { error } = await db.from("hs_training").update({ evidence_path: path, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", row.id)
    if (error) return toast.error(error.message)
    toast.success("Training evidence saved"); await refresh()
  }
  async function uploadPolicy(file: File) {
    if (!policyTitle.trim() || !policyVersion.trim()) return toast.error("Enter a title and version")
    const path = `policies/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    const { error: uploadError } = await db.storage.from("health-safety").upload(path, file, { upsert: false })
    if (uploadError) return toast.error(uploadError.message)
    const { error } = await db.from("hs_policies").insert({ title: policyTitle.trim(), version: policyVersion.trim(), effective_on: policyEffective || null, review_due_on: policyReview || null, file_name: file.name, storage_path: path, uploaded_by: userId })
    if (error) return toast.error(error.message)
    setPolicyVersion(""); toast.success("Policy version added"); await refresh()
  }

  return <DashboardLayout><PageShell width="full" className="px-4 xl:px-6 py-4">
    <PageHeader icon={ShieldCheck} kicker="Job & Project Management" title="Health & Safety" description="Toolbox talks, SWMS/TAs, incident reports, training and the company policy in one internal register." />
    {error && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">{error}. The H&S database migration may still need to be applied.</div>}
    {jobFromUrl && <div className="text-sm">Showing H&S records for this job. <Link className="underline" href="/health-safety">Show all</Link></div>}
    <Tabs value={tab} onValueChange={setTab} className="mt-3">
      <TabsList className="h-auto flex-wrap"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="records">History</TabsTrigger><TabsTrigger value="incidents">Incidents</TabsTrigger><TabsTrigger value="templates">Templates</TabsTrigger><TabsTrigger value="training">Training matrix</TabsTrigger><TabsTrigger value="policy">Policy</TabsTrigger>{tab === "form" && <TabsTrigger value="form">Record</TabsTrigger>}</TabsList>
      <TabsContent value="overview" className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">{[["Completed records", visibleRecords.filter(r => r.status === "completed").length], ["Open drafts", visibleRecords.filter(r => r.status === "draft").length], ["Training due in 30 days", due.length]].map(([label, count]) => <div key={label} className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">{label}</div><div className="mt-1 text-3xl font-semibold">{count}</div></div>)}</div>
        <div className="flex flex-wrap gap-2">{canManage && <><Button onClick={() => newRecord("toolbox")}>New toolbox meeting</Button><Button onClick={() => newRecord("swms")} variant="outline">New SWMS/TA</Button></>}<Button onClick={() => setTab("incidents")} variant="outline">Report an incident or hazard</Button></div>
        <div><h2 className="mb-2 font-semibold">Recent activity</h2>{visibleRecords.slice(0, 8).map(r => <button key={r.id} onClick={() => openRecord(r)} className="flex w-full justify-between gap-3 border-b py-2 text-left text-sm hover:bg-muted/40"><span>{r.title} <span className="text-muted-foreground">· {r.kind === "swms" ? "SWMS/TA" : "Toolbox"} · {r.site || "No site"}</span></span><span>{niceDate(r.work_date)} · {r.status}</span></button>)}{visibleRecords.length === 0 && <p className="text-sm text-muted-foreground">No H&S records yet.</p>}</div>
      </TabsContent>
      <TabsContent value="incidents"><IncidentRegister jobFromUrl={jobFromUrl} jobs={jobs} userId={userId} canManage={canManage} /></TabsContent>
      <TabsContent value="records" className="space-y-3">
        <div className="flex flex-wrap gap-2"><Input aria-label="Search H&S records" placeholder="Search title, site, job or scope" value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs"/><select aria-label="Record type" className="rounded-md border bg-background px-2 text-sm" value={filterKind} onChange={e => setFilterKind(e.target.value)}><option value="all">All types</option><option value="toolbox">Toolbox</option><option value="swms">SWMS/TA</option></select><select aria-label="Record status" className="rounded-md border bg-background px-2 text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="all">All statuses</option><option value="draft">Draft</option><option value="completed">Completed</option></select>{canManage && <Button onClick={() => newRecord("swms")}>New record</Button>}</div>
        <div className="rounded-lg border">{filtered.map(r => <button key={r.id} className="flex w-full flex-wrap items-center justify-between gap-2 border-b px-3 py-3 text-left text-sm last:border-0 hover:bg-muted/40" onClick={() => openRecord(r)}><span><strong>{r.title}</strong><span className="ml-2 text-muted-foreground">{r.kind === "swms" ? "SWMS/TA" : "Toolbox"} · {r.site || "No site"}{r.job_reference ? ` · ${r.job_reference}` : ""}</span></span><span>{niceDate(r.work_date)} · {r.status} · rev {r.revision}</span></button>)}{filtered.length === 0 && <p className="p-5 text-sm text-muted-foreground">No matching records.</p>}</div>
      </TabsContent>
      <TabsContent value="form" className="max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center gap-2"><h2 className="mr-auto text-xl font-semibold">{current?.status === "completed" ? "Completed record" : selected ? "Edit draft" : "New record"}</h2>{current?.kind === "swms" && <Button variant="outline" asChild><Link href={"/health-safety/print?id=" + current.id} target="_blank" rel="noopener noreferrer">Print SWMS/TA</Link></Button>}{current?.status === "completed" && canManage && <><Button variant="outline" onClick={makeRevision}>Create correction revision</Button>{current.kind === "swms" && <Button variant="outline" onClick={() => void saveTemplate(current)}>Save as template</Button>}</>}</div>
        {current?.status === "completed" && <p className="rounded-md bg-muted p-3 text-sm">Locked on {new Date(current.completed_at!).toLocaleString("en-NZ")}. Corrections create a linked revision; this version stays in history.</p>}
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1"><Label>Type</Label><select className="h-9 w-full rounded-md border bg-background px-2" value={kind} onChange={e => setKind(e.target.value as Kind)} disabled={!!current || !canManage}><option value="swms">SWMS / Task Analysis</option><option value="toolbox">Toolbox meeting</option></select></div><div className="space-y-1"><Label htmlFor="hs-date">Date</Label><Input id="hs-date" type="date" value={date} onChange={e => setDate(e.target.value)} disabled={current?.status === "completed" || !canManage}/></div></div>
        <div className="space-y-1"><Label htmlFor="hs-title">Title</Label><Input id="hs-title" value={title} onChange={e => setTitle(e.target.value)} disabled={current?.status === "completed" || !canManage} placeholder="e.g. Pylon sign installation" /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="hs-job">RPM job (if applicable)</Label><select id="hs-job" className="h-9 w-full rounded-md border bg-background px-2" value={jobId} onChange={e => setJobId(e.target.value)} disabled={current?.status === "completed" || !canManage}><option value="">No job linked</option>{jobs.map(j => <option key={j.id} value={j.id}>{j.job_number ? `${j.job_number} · ` : ""}{j.title}</option>)}</select></div><div className="space-y-1"><Label htmlFor="hs-site">Work site {kind === "swms" && "(required to complete)"}</Label><Input id="hs-site" value={site} onChange={e => setSite(e.target.value)} disabled={current?.status === "completed" || !canManage} placeholder="Site address or location" /></div></div>
        {kind === "toolbox" ? <>
          {field("run_by", "Meeting run by")}{field("previous_actions", "Previous meeting updates and follow-ups")}
          {field("safety_topics", "Health and safety topics, incidents and safe practices")}
          {field("operations", "Operational items and upcoming job planning")}
          {field("scope", "Meeting summary")}{field("actions", "Actions, owner and due date")}
        </> : <>
          <p className="rounded-md bg-muted p-3 text-sm">Prepare this for the specific site before work starts. Brief the team; stop and revise the method if the controls no longer fit the work.</p>
          {field("scope", "Job description and work scope")}
          <div className="grid gap-3 sm:grid-cols-2">{field("principal", "Principal contractor")}{field("client", "Client / site contact")}{field("responsible", "Person responsible for this SWMS")}{field("duration", "Install date and expected duration")}</div>
          {field("notification", "Notifiable work / WorkSafe notification, if applicable")}
          <div className="grid gap-3 sm:grid-cols-2">{field("permits", "Work permits and approvals")}{field("ppe", "PPE required")}{field("plant", "Plant and equipment")}{field("signage", "Barriers and H&S signage")}{field("approvals", "Engineering certificates / approvals")}{field("checks", "Equipment and maintenance checks")}</div>
          {field("qualifications", "Qualifications, training and duties required")}
          {field("hazards", "Overall site hazards and risks")}{field("controls", "Overall controls")}
          <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Safe work steps</h3>{canManage && current?.status !== "completed" && <Button size="sm" variant="outline" onClick={() => setBody({ ...body, steps: [...(body.steps || []), { task: "", hazard: "", risk: "", control: "", responsible: "" }] })}>Add step</Button>}</div>
            {(body.steps || []).map((step, index) => <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2"><div className="sm:col-span-2 font-medium">Step {index + 1}</div>{([['task','Procedure / job step'],['hazard','Potential hazards'],['risk','Risk level 1–5'],['control','Hazard controls'],['responsible','Person responsible']] as [keyof WorkStep, string][]).map(([key, label]) => <div key={key} className="space-y-1"><Label>{label}</Label><Input value={step[key]} onChange={e => setStep(index, key, e.target.value)} disabled={!canManage || current?.status === "completed"} /></div>)}{canManage && current?.status !== "completed" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setBody({ ...body, steps: body.steps.filter((_, i) => i !== index) })}>Remove step</Button>}</div>)}
          </div>
          {field("emergency", "Emergency arrangements / contacts")}{field("actions", "Site checks and follow-up actions")}
        </>}
        {field("notes", "Other notes")}
        <div className="space-y-1"><Label htmlFor="hs-people">Attendees (one name per line)</Label><Textarea id="hs-people" value={people} onChange={e => setPeople(e.target.value)} disabled={current?.status === "completed" || !canManage} placeholder="Staff names. RPM users can sign their own acknowledgement after completion." /><p className="text-xs text-muted-foreground">For visitors or staff without RPM access, attach a photo or scan of the signed sheet to the draft.</p></div>
        {selected && <div className="space-y-2"><h3 className="font-medium">Acknowledgements</h3>{attendees.filter(a => a.record_id === selected).map(a => <div key={a.id} className="flex items-center justify-between border-b py-1 text-sm"><span>{a.name}</span><span>{a.signed_at ? `Signed ${new Date(a.signed_at).toLocaleString("en-NZ")}` : a.user_id === userId && current?.status === "completed" ? <Button size="sm" onClick={() => void sign(a)}>Acknowledge</Button> : "Awaiting sign-off"}</span></div>)}</div>}
        {selected && <div className="space-y-2"><h3 className="font-medium">Attachments and photos</h3>{attachments.filter(a => a.record_id === selected).map(a => <button key={a.id} className="block text-sm text-primary underline" onClick={() => void openFile(a.storage_path)}>{a.file_name}</button>)}{canManage && current?.status === "draft" && <Input aria-label="Attach evidence" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx" onChange={e => { const file = e.target.files?.[0]; if (file) void uploadEvidence(file) }}/>}</div>}
        {canManage && current?.status !== "completed" && <div className="flex flex-wrap gap-2">{!templateEditId && <><Button disabled={busy} onClick={() => void saveRecord(false)}>Save draft</Button><Button disabled={busy} variant="outline" onClick={() => void saveRecord(true)}>Complete and lock</Button></>}{kind === "swms" && <Button disabled={busy} variant={templateEditId ? "default" : "ghost"} onClick={() => void saveTemplate()}>{templateEditId ? "Save new template version" : "Save template"}</Button>}</div>}
        {current?.revision_of && <button className="text-sm text-primary underline" onClick={() => { const prior = records.find(r => r.id === current.revision_of); if (prior) openRecord(prior) }}>View previous revision</button>}
      </TabsContent>
      <TabsContent value="templates" className="space-y-3"><p className="text-sm text-muted-foreground">SWMS/TA templates carry the work method into a new draft. Add the current job, site, date and attendees each time.</p>{swmsTemplates.map(t => <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><strong>{t.title}</strong><div className="text-xs text-muted-foreground">SWMS/TA · version {t.version}</div>{canManage && <div className="text-xs text-muted-foreground">{audit.filter(a => a.entity_id === t.id).map(a => `v${a.snapshot.version} ${niceDate(a.at)}`).join(" · ")}</div>}</div>{canManage && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => editTemplate(t)}>Edit</Button><Button size="sm" onClick={() => applyTemplate(t)}>Use template</Button></div>}</div>)}{swmsTemplates.length === 0 && <p className="text-sm text-muted-foreground">No SWMS/TA templates yet. Save a completed SWMS/TA as a template, or use the template action while drafting.</p>}</TabsContent>
      <TabsContent value="training" className="space-y-4">
        <p className="text-sm text-muted-foreground">Keep one row per person and training item. Expired and soon-to-expire items are highlighted.</p>
        {canManage && <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-4">
          <Input placeholder="Staff member" aria-label="Staff member" value={trainingStaff} onChange={e => setTrainingStaff(e.target.value)} />
          <Input placeholder="Training / competency" aria-label="Training" value={trainingName} onChange={e => setTrainingName(e.target.value)} />
          <select aria-label="Competency level" className="h-9 rounded-md border bg-background px-2 text-sm" value={trainingCompetency} onChange={e => setTrainingCompetency(e.target.value)}><option value="">Qualification / licence</option><option value="not_qualified">Not qualified</option><option value="supervised">Under supervision</option><option value="competent">Competent</option><option value="trainer">Can train others</option></select>
          <Input placeholder="Certificate or licence ref" aria-label="Certificate or licence reference" value={trainingReference} onChange={e => setTrainingReference(e.target.value)} />
          <Input type="date" aria-label="Completed on" value={trainingDate} onChange={e => setTrainingDate(e.target.value)} />
          <Input type="date" aria-label="Expires on" value={trainingExpiry} onChange={e => setTrainingExpiry(e.target.value)} />
          <Button onClick={() => void addTraining()}>{trainingEditId ? "Save changes" : "Add training"}</Button>
        </div>}
        <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm">
          <thead><tr className="bg-muted/40 text-left"><th className="p-2">Staff</th><th className="p-2">Training</th><th className="p-2">Competency / reference</th><th className="p-2">Completed</th><th className="p-2">Expires</th><th className="p-2">Status</th><th className="p-2">Evidence</th><th className="p-2" /></tr></thead>
          <tbody>{training.map(t => { const expired = !!t.expires_on && t.expires_on < clockDate; const soon = !!t.expires_on && !expired && t.expires_on <= soonDate; return <tr key={t.id} className="border-t">
            <td className="p-2">{t.staff_name}</td><td className="p-2">{t.training}</td><td className="p-2">{t.competency?.replaceAll("_", " ") || "—"}<div className="text-xs text-muted-foreground">{t.reference}</div></td><td className="p-2">{niceDate(t.completed_on)}</td><td className="p-2">{niceDate(t.expires_on)}</td>
            <td className={`p-2 ${expired ? "text-destructive" : soon ? "text-amber-600" : ""}`}>{expired ? "Expired" : soon ? "Due soon" : t.competency === "not_qualified" ? "Not qualified" : t.competency === "supervised" ? "Supervised" : t.completed_on ? "Current" : "Pending"}</td>
            <td className="p-2">{t.evidence_path ? <Button size="sm" variant="link" onClick={() => void openFile(t.evidence_path!)}>Open</Button> : "—"}{canManage && <Input aria-label={`Evidence for ${t.staff_name} ${t.training}`} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx" onChange={e => { const file = e.target.files?.[0]; if (file) void uploadTrainingEvidence(t, file) }} className="max-w-48" />}</td>
            <td className="p-2">{canManage && <Button size="sm" variant="outline" onClick={() => editTraining(t)}>Edit</Button>}</td>
          </tr> })}</tbody>
        </table>{training.length === 0 && <p className="p-4 text-sm text-muted-foreground">No training entries yet.</p>}</div>
      </TabsContent>
      <TabsContent value="policy" className="space-y-4">
        {latestPolicy ? <>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{latestPolicy.title}</h2><p className="text-sm text-muted-foreground">Version {latestPolicy.version} · Effective {niceDate(latestPolicy.effective_on)} · Review due {niceDate(latestPolicy.review_due_on)}</p></div><Button variant="outline" onClick={() => void openFile(latestPolicy.storage_path)}>Open document</Button></div>
          {latestPolicy.file_name.toLowerCase().endsWith(".pdf") && policyPreview?.path === latestPolicy.storage_path && policyPreview.url
            ? <iframe title={latestPolicy.title} src={policyPreview.url} className="min-h-[75vh] w-full rounded-lg border bg-white" />
            : <p className="rounded-lg border p-4 text-sm text-muted-foreground">{policyPreview?.path === latestPolicy.storage_path && policyPreview.error ? `Preview unavailable: ${policyPreview.error}. Use Open document.` : "Use Open document to read the policy."}</p>}
        </> : <p className="rounded-lg border p-5 text-sm text-muted-foreground">The company H&S policy has not been added yet.</p>}
        {canManage && <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">Manage policy versions</summary><div className="mt-4 space-y-4"><div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Policy title" value={policyTitle} onChange={e => setPolicyTitle(e.target.value)} /><Input aria-label="Version" placeholder="Version (e.g. 2026.1)" value={policyVersion} onChange={e => setPolicyVersion(e.target.value)} /><label>Effective date<Input type="date" value={policyEffective} onChange={e => setPolicyEffective(e.target.value)} /></label><label>Review due<Input type="date" value={policyReview} onChange={e => setPolicyReview(e.target.value)} /></label><Input aria-label="Upload policy" type="file" accept=".pdf,.docx" onChange={e => { const file = e.target.files?.[0]; if (file) void uploadPolicy(file) }} /></div>{policies.map(p => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2"><span>{p.title} · version {p.version} · uploaded {niceDate(p.created_at)}</span><Button variant="link" size="sm" onClick={() => void openFile(p.storage_path)}>Open {p.file_name}</Button></div>)}</div></details>}
      </TabsContent>
    </Tabs>
  </PageShell></DashboardLayout>
}

