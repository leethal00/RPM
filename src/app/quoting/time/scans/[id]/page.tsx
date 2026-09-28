"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import DashboardLayout from "@/components/dashboard-layout"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, FileText, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

type Labour = { hours: string; type: string; description: string }
type Material = { description: string; qty: string; unit: string; cost: string }
type Review = { employee: string; date: string; labour: Labour[]; travel_hours: string; travel_notes: string; materials: Material[]; notes: string }
type Scan = { id: string; subject: string | null; attachment_name: string | null; storage_path: string | null; mime_type: string | null; status: string; job_id: string | null; detected_job_number: string | null; extracted_data: Record<string, unknown>; reviewed_data: Record<string, unknown> | null; review_notes: string | null; confirmed_at: string | null; confirmed_by: string | null }
type Job = { id: string; job_number: string | null; title: string | null; production_title: string | null }

const emptyReview: Review = { employee: "", date: "", labour: [], travel_hours: "", travel_notes: "", materials: [], notes: "" }
const str = (value: unknown) => value == null ? "" : String(value)
function parseReview(value: Record<string, unknown> | null | undefined): Review {
  if (!value) return { ...emptyReview, labour: [], materials: [] }
  return {
    employee: str(value.employee || value.person_name), date: str(value.date || value.work_date).slice(0, 10),
    labour: Array.isArray(value.labour) ? value.labour.map((row: Record<string, unknown>) => ({ hours: str(row.hours), type: str(row.type || row.labour_type || "Workshop"), description: str(row.description) })) : [],
    travel_hours: str(value.travel_hours), travel_notes: str(value.travel_notes),
    materials: Array.isArray(value.materials) ? value.materials.map((row: Record<string, unknown>) => ({ description: str(row.description), qty: str(row.qty), unit: str(row.unit), cost: str(row.cost) })) : [],
    notes: str(value.notes),
  }
}

export default function ScannedJobCardReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [scan, setScan] = useState<Scan | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobId, setJobId] = useState("")
  const [jobSearch, setJobSearch] = useState("")
  const [review, setReview] = useState<Review>(emptyReview)
  const [fileUrl, setFileUrl] = useState("")
  const [confirmedName, setConfirmedName] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      const [scanResult, jobsResult] = await Promise.all([
        supabase.from("job_card_scans").select("id,subject,attachment_name,storage_path,mime_type,status,job_id,detected_job_number,extracted_data,reviewed_data,review_notes,confirmed_at,confirmed_by").eq("id", id).single(),
        supabase.from("costing_jobs").select("id,job_number,title,production_title").eq("is_template", false).order("job_number", { ascending: false }).limit(500),
      ])
      if (!active) return
      if (scanResult.error) toast.error(scanResult.error.message)
      if (jobsResult.error) toast.error(jobsResult.error.message)
      const card = scanResult.data as Scan | null
      const jobRows = (jobsResult.data || []) as Job[]
      setScan(card)
      setJobs(jobRows)
      setJobId(card?.job_id || jobRows.find(j => j.job_number && j.job_number === card?.detected_job_number)?.id || "")
      setReview(parseReview(card?.reviewed_data || card?.extracted_data))
      if (card?.storage_path) {
        const signed = await supabase.storage.from("job-card-scans").createSignedUrl(card.storage_path, 3600)
        if (active && signed.data?.signedUrl) setFileUrl(signed.data.signedUrl)
        if (active && signed.error) toast.error(`Could not open scan: ${signed.error.message}`)
      }
      if (card?.confirmed_by) {
        const profile = await supabase.from("users").select("name,email").eq("id", card.confirmed_by).maybeSingle()
        if (active) setConfirmedName(profile.data?.name || profile.data?.email || card.confirmed_by)
      }
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [id, supabase])

  const confirmed = scan?.status === "processed"
  const editable = Boolean(scan && !confirmed && scan.status !== "deleted")
  const visibleJobs = jobs.filter(job => `${job.job_number || ""} ${job.production_title || job.title || ""}`.toLowerCase().includes(jobSearch.toLowerCase())).slice(0, 80)
  const setField = (key: keyof Review, value: string) => setReview(current => ({ ...current, [key]: value }))

  async function attachOriginal(file: File) {
    if (!scan) return
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) return toast.error("Choose a PDF, JPG or PNG file")
    setBusy(true)
    const path = `${scan.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`
    try {
      const uploaded = await supabase.storage.from("job-card-scans").upload(path, file, { contentType: file.type, upsert: false })
      if (uploaded.error) throw uploaded.error
      const attached = await supabase.rpc("attach_scanned_job_card", { p_scan_id: scan.id, p_path: path, p_name: file.name, p_mime: file.type })
      if (attached.error) throw attached.error
      const signed = await supabase.storage.from("job-card-scans").createSignedUrl(path, 3600)
      setScan({ ...scan, storage_path: path, attachment_name: file.name, mime_type: file.type, review_notes: null })
      setFileUrl(signed.data?.signedUrl || "")
      toast.success("Original card attached")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not attach card") }
    finally { setBusy(false) }
  }

  async function confirm() {
    if (!scan || !jobId || !review.date || !scan.storage_path) return toast.error("Select a job, date and original card")
    if (!review.labour.length && !review.materials.length && !(Number(review.travel_hours) > 0)) return toast.error("Add labour, travel or materials before posting")
    if (!window.confirm("Confirm this scanned card and post its entries to the selected job?")) return
    setBusy(true)
    const { error } = await supabase.rpc("confirm_scanned_job_card", { p_scan_id: scan.id, p_job_id: jobId, p_review: review })
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success("Job card confirmed and posted")
    router.push("/quoting/time?tab=scans")
  }

  if (loading) return <DashboardLayout><PageShell><div className="p-8 text-sm">Loading scanned card…</div></PageShell></DashboardLayout>
  if (!scan) return <DashboardLayout><PageShell><div className="p-8 text-sm">Scanned card not found.</div></PageShell></DashboardLayout>
  return <DashboardLayout><PageShell>
    <Button variant="ghost" size="sm" onClick={() => router.push("/quoting/time?tab=scans")}><ArrowLeft/>Scanned Job Cards</Button>
    <PageHeader icon={FileText} kicker="Time & Materials" title={confirmed ? "Confirmed job card" : "Review scanned job card"} description={scan.attachment_name || scan.subject || "Incoming job card"}/>
    {confirmed && <div className="mb-4 rounded-md border bg-muted/40 p-3 text-sm">Confirmed {scan.confirmed_at ? new Date(scan.confirmed_at).toLocaleString("en-NZ") : ""}{confirmedName ? ` by ${confirmedName}` : ""}. Entries are already posted.</div>}
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3">
        <h2 className="font-semibold">Original card</h2>
        {fileUrl ? scan.mime_type?.startsWith("image/") ? <div className="relative h-[700px] w-full rounded-md border"><Image src={fileUrl} alt="Original scanned job card" fill unoptimized className="object-contain"/></div> : <iframe src={fileUrl} title="Original scanned job card" className="h-[700px] w-full rounded-md border"/> : <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No original file is stored for this email. {scan.review_notes || "Attach the PDF, JPG or PNG before confirming."}</div>}
        {fileUrl && <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">Open original in a new tab</a>}
        {editable && !scan.storage_path && <div><Label htmlFor="scan-file">Attach original card</Label><Input id="scan-file" type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void attachOriginal(file) }}/></div>}
      </section>
      <section className="space-y-5">
        {editable && !Object.keys(scan.extracted_data || {}).length && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">No details were extracted from this card. Enter the information from the original before confirming.</p>}
        <div className="space-y-2"><Label htmlFor="job-search">Match to RPM job</Label><Input id="job-search" placeholder="Search job number or title" value={jobSearch} onChange={e => setJobSearch(e.target.value)} disabled={!editable}/><select aria-label="RPM job" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={jobId} onChange={e => setJobId(e.target.value)} disabled={!editable}><option value="">Choose a job…</option>{visibleJobs.map(job => <option key={job.id} value={job.id}>{job.job_number || "No number"} — {job.production_title || job.title}</option>)}{jobId && !visibleJobs.some(job => job.id === jobId) && jobs.find(job => job.id === jobId) && <option value={jobId}>{jobs.find(job => job.id === jobId)?.job_number} — {jobs.find(job => job.id === jobId)?.title}</option>}</select>{scan.detected_job_number && <p className="text-xs text-muted-foreground">Detected job number: {scan.detected_job_number}</p>}</div>
        <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="employee">Employee</Label><Input id="employee" value={review.employee} onChange={e => setField("employee", e.target.value)} disabled={!editable}/></div><div><Label htmlFor="work-date">Work date</Label><Input id="work-date" type="date" value={review.date} onChange={e => setField("date", e.target.value)} disabled={!editable}/></div></div>
        <div className="space-y-2"><div className="flex items-center justify-between"><h2 className="font-semibold">Labour</h2>{editable && <Button size="sm" variant="outline" onClick={() => setReview(r => ({ ...r, labour: [...r.labour, { hours: "", type: "Workshop", description: "" }] }))}><Plus/>Add labour</Button>}</div>{review.labour.map((row, index) => <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[90px_130px_1fr_auto]"><Input aria-label={`Labour hours ${index + 1}`} type="number" min="0" step="0.25" placeholder="Hours" value={row.hours} disabled={!editable} onChange={e => setReview(r => ({ ...r, labour: r.labour.map((v,i) => i === index ? { ...v, hours: e.target.value } : v) }))}/><Input aria-label={`Labour type ${index + 1}`} placeholder="Type" value={row.type} disabled={!editable} onChange={e => setReview(r => ({ ...r, labour: r.labour.map((v,i) => i === index ? { ...v, type: e.target.value } : v) }))}/><Input aria-label={`Labour description ${index + 1}`} placeholder="Work done" value={row.description} disabled={!editable} onChange={e => setReview(r => ({ ...r, labour: r.labour.map((v,i) => i === index ? { ...v, description: e.target.value } : v) }))}/>{editable && <Button variant="ghost" size="icon" aria-label={`Remove labour ${index + 1}`} onClick={() => setReview(r => ({ ...r, labour: r.labour.filter((_,i) => i !== index) }))}><Trash2/></Button>}</div>)}</div>
        <div className="space-y-2"><h2 className="font-semibold">Travel</h2><div className="grid gap-2 sm:grid-cols-[120px_1fr]"><Input aria-label="Travel hours" type="number" min="0" step="0.25" placeholder="Hours" value={review.travel_hours} disabled={!editable} onChange={e => setField("travel_hours", e.target.value)}/><Input aria-label="Travel notes" placeholder="Travel notes" value={review.travel_notes} disabled={!editable} onChange={e => setField("travel_notes", e.target.value)}/></div></div>
        <div className="space-y-2"><div className="flex items-center justify-between"><h2 className="font-semibold">Materials</h2>{editable && <Button size="sm" variant="outline" onClick={() => setReview(r => ({ ...r, materials: [...r.materials, { description: "", qty: "1", unit: "", cost: "" }] }))}><Plus/>Add material</Button>}</div>{review.materials.map((row,index) => <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_75px_75px_90px_auto]"><Input aria-label={`Material description ${index + 1}`} placeholder="Description" value={row.description} disabled={!editable} onChange={e => setReview(r => ({ ...r, materials: r.materials.map((v,i) => i === index ? { ...v, description: e.target.value } : v) }))}/><Input aria-label={`Material quantity ${index + 1}`} type="number" min="0" step="any" placeholder="Qty" value={row.qty} disabled={!editable} onChange={e => setReview(r => ({ ...r, materials: r.materials.map((v,i) => i === index ? { ...v, qty: e.target.value } : v) }))}/><Input aria-label={`Material unit ${index + 1}`} placeholder="Unit" value={row.unit} disabled={!editable} onChange={e => setReview(r => ({ ...r, materials: r.materials.map((v,i) => i === index ? { ...v, unit: e.target.value } : v) }))}/><Input aria-label={`Material cost ${index + 1}`} type="number" min="0" step="any" placeholder="Cost" value={row.cost} disabled={!editable} onChange={e => setReview(r => ({ ...r, materials: r.materials.map((v,i) => i === index ? { ...v, cost: e.target.value } : v) }))}/>{editable && <Button variant="ghost" size="icon" aria-label={`Remove material ${index + 1}`} onClick={() => setReview(r => ({ ...r, materials: r.materials.filter((_,i) => i !== index) }))}><Trash2/></Button>}</div>)}</div>
        <div><Label htmlFor="card-notes">Notes</Label><Textarea id="card-notes" value={review.notes} disabled={!editable} onChange={e => setField("notes", e.target.value)}/></div>
        {editable && <Button onClick={confirm} disabled={busy || !scan.storage_path || !jobId}>{busy ? "Saving…" : "Confirm & Post to Job"}</Button>}
      </section>
    </div>
  </PageShell></DashboardLayout>
}
