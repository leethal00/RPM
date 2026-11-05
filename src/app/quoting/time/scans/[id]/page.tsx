"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
import { ArrowLeft, FileText } from "lucide-react"
import { toast } from "sonner"
import { emptyScanReview, parseScanReview, scanReviewError, type ScanReview as Review } from '@/lib/scan-review'
import { ScanReviewEntries } from '@/components/scan-review-entries'

type Scan = { id: string; subject: string | null; attachment_name: string | null; storage_path: string | null; mime_type: string | null; status: string; job_id: string | null; detected_job_number: string | null; extracted_data: Record<string, unknown>; reviewed_data: Record<string, unknown> | null; review_notes: string | null; confirmed_at: string | null; confirmed_by: string | null }
type Job = { id: string; job_number: string | null; title: string | null; production_title: string | null }

export default function ScannedJobCardReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [scan, setScan] = useState<Scan | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobId, setJobId] = useState("")
  const [jobSearch, setJobSearch] = useState("")
  const [review, setReview] = useState<Review>(emptyScanReview)
  const [fileUrl, setFileUrl] = useState("")
  const [confirmedName, setConfirmedName] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [qrReading, setQrReading] = useState(false)
  const [qrMessage, setQrMessage] = useState('')
  const [qrAttempt, setQrAttempt] = useState(0)
  const jobEdited = useRef(false)

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
      setReview(parseScanReview(card?.reviewed_data || card?.extracted_data))
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

  const scanId = scan?.id
  const scanPath = scan?.storage_path
  const scanStatus = scan?.status
  const savedJob = scan?.job_id
  useEffect(() => {
    if (!scanId || !scanPath || ['processed', 'deleted'].includes(scanStatus || '') || (savedJob && !qrAttempt)) return
    const controller = new AbortController()
    async function detect() {
      setQrReading(true)
      setQrMessage('Reading the card’s QR code…')
      try {
        const response = await fetch('/api/job-cards/detect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scanId }), signal: controller.signal })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not read QR code')
        if (controller.signal.aborted) return
        if (result.matched && result.job) {
          const matched = result.job as Job
          setJobs(current => current.some(job => job.id === matched.id) ? current : [matched, ...current])
          const conflict = result.saved === false || (savedJob && savedJob !== matched.id)
          if (!jobEdited.current && !conflict) setJobId(matched.id)
          setQrMessage(`QR code identifies ${matched.job_number || 'job'} — ${matched.title || ''}. ${conflict ? 'An existing job match differs; it has been kept. Check the job selection before posting.' : 'Check the selected job and enter the time and material details below.'}`)
        } else setQrMessage(result.message || 'Select the job manually.')
      } catch (cause) {
        if (!controller.signal.aborted) setQrMessage(cause instanceof Error ? cause.message : 'Could not read QR code. Select the job manually.')
      } finally { if (!controller.signal.aborted) setQrReading(false) }
    }
    void detect()
    return () => controller.abort()
  }, [scanId, scanPath, scanStatus, savedJob, qrAttempt])

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
    if (!scan || !jobId || !scan.storage_path) return toast.error("Select a job and original card")
    const validation = scanReviewError(review)
    if (validation) return toast.error(validation)
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
        {editable && !Object.keys(scan.extracted_data || {}).length && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Time and materials have not been extracted. Enter each row from the original card before confirming.</p>}
        {editable && scan.storage_path && <div className="space-y-2 rounded-md border p-3 text-sm"><p role="status">{qrMessage || (scan.job_id ? `Matched job: ${scan.detected_job_number || "selected below"}.` : "The QR code will be checked when the card opens.")}</p><Button size="sm" variant="outline" disabled={qrReading || busy} onClick={() => setQrAttempt(value => value + 1)}>{qrReading ? "Reading QR…" : "Read QR again"}</Button></div>}
        <div className="space-y-2"><Label htmlFor="job-search">Match to RPM job</Label><Input id="job-search" placeholder="Search job number or title" value={jobSearch} onChange={e => setJobSearch(e.target.value)} disabled={!editable}/><select aria-label="RPM job" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={jobId} onChange={e => { jobEdited.current = true; setJobId(e.target.value) }} disabled={!editable}><option value="">Choose a job…</option>{visibleJobs.map(job => <option key={job.id} value={job.id}>{job.job_number || "No number"} — {job.production_title || job.title}</option>)}{jobId && !visibleJobs.some(job => job.id === jobId) && jobs.find(job => job.id === jobId) && <option value={jobId}>{jobs.find(job => job.id === jobId)?.job_number} — {jobs.find(job => job.id === jobId)?.title}</option>}</select>{scan.detected_job_number && <p className="text-xs text-muted-foreground">Detected job number: {scan.detected_job_number}</p>}</div>
        <ScanReviewEntries review={review} onChange={setReview} editable={editable && !busy}/>
        <div><Label htmlFor="card-notes">Notes</Label><Textarea id="card-notes" value={review.notes} disabled={!editable} onChange={e => setField("notes", e.target.value)}/></div>
        {editable && <Button onClick={confirm} disabled={busy || qrReading || !scan.storage_path || !jobId}>{busy ? "Saving…" : "Confirm & Post to Job"}</Button>}
      </section>
    </div>
  </PageShell></DashboardLayout>
}
