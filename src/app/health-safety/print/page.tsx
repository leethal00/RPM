"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

type WorkStep = { task?: string; hazard?: string; risk?: string; control?: string; responsible?: string }
type Body = {
  scope?: string; hazards?: string; controls?: string; emergency?: string; actions?: string; notes?: string
  principal?: string; client?: string; responsible?: string; duration?: string; notification?: string
  permits?: string; ppe?: string; plant?: string; signage?: string; approvals?: string
  checks?: string; qualifications?: string; steps?: WorkStep[]
}
type RecordRow = {
  id: string; title: string; status: "draft" | "completed"; job_reference: string | null
  site: string | null; work_date: string; body: Body | null; revision: number
  template_version: number | null; completed_at: string | null; created_at: string
}
type Attendee = { id: string; name: string; signed_at: string | null }
type Attachment = { id: string; file_name: string }

function nzDate(value: string | null | undefined, includeTime = false) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric", month: "short", year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date)
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return <div className="print-field"><div className="print-label">{label}</div><div className="print-value">{value?.trim() || "—"}</div></div>
}

function Narrative({ title, value }: { title: string; value?: string | null }) {
  if (!value?.trim()) return null
  return <section className="print-section"><h2>{title}</h2><p className="print-copy">{value}</p></section>
}

export default function SwmsPrintPage() {
  const db = useMemo(() => createClient(), [])
  const [record, setRecord] = useState<RecordRow | null>(null)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id")
    if (!id) {
      setError("No SWMS/TA record was specified.")
      setLoading(false)
      return
    }
    let active = true
    void (async () => {
      const { data: auth } = await db.auth.getUser()
      if (!active) return
      if (!auth.user) {
        setError("Please sign in to view this SWMS/TA.")
        setLoading(false)
        return
      }
      const { data, error: recordError } = await db.from("hs_records")
        .select("id,title,status,job_reference,site,work_date,body,revision,template_version,completed_at,created_at")
        .eq("id", id).eq("kind", "swms").single()
      if (!active) return
      if (recordError || !data) {
        setError("This SWMS/TA could not be found or you do not have access to it.")
        setLoading(false)
        return
      }
      const [people, files] = await Promise.all([
        db.from("hs_attendees").select("id,name,signed_at").eq("record_id", id).order("created_at"),
        db.from("hs_attachments").select("id,file_name").eq("record_id", id).order("created_at"),
      ])
      if (!active) return
      setRecord(data as RecordRow)
      setAttendees((people.data || []) as Attendee[])
      setAttachments((files.data || []) as Attachment[])
      setLoading(false)
    })().catch(() => {
      if (active) {
        setError("The SWMS/TA could not be loaded.")
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [db])

  const body: Body = record?.body || {}
  const steps = (body.steps || []).filter(step => Object.values(step).some(value => value?.trim()))
  return <main className="print-root">
    <style>{`
      @page { size: A4; margin: 14mm; }
      .print-root { min-height: 100vh; background: #edf2f7; color: #172b46; font-family: Arial, Calibri, sans-serif; }
      .print-actions { max-width: 920px; margin: 0 auto; padding: 18px 24px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
      .print-actions a { color: #225a91; text-decoration: underline; }
      .print-actions button { border: 0; border-radius: 6px; background: #225a91; color: white; padding: 10px 18px; cursor: pointer; }
      .print-sheet { max-width: 920px; margin: 0 auto 32px; padding: 32px 40px; background: white; box-shadow: 0 6px 25px #19345119; }
      .print-head { border-bottom: 4px solid #225a91; padding-bottom: 16px; margin-bottom: 20px; }
      .print-kicker { text-transform: uppercase; letter-spacing: .12em; font-size: 11px; font-weight: 700; color: #225a91; }
      .print-head h1 { margin: 5px 0 8px; font-size: 26px; line-height: 1.2; }
      .print-meta { font-size: 12px; color: #52647b; }
      .print-status { display: inline-block; padding: 3px 8px; border: 1px solid #8295aa; border-radius: 4px; font-weight: 700; text-transform: uppercase; }
      .print-status.draft { color: #a34d00; border-color: #a34d00; }
      .print-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px 24px; margin: 18px 0 22px; }
      .print-field { break-inside: avoid; }
      .print-label { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; color: #52647b; }
      .print-value { font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
      .print-section { margin: 18px 0; break-inside: avoid; }
      .print-section h2 { font-size: 14px; color: #225a91; border-bottom: 1px solid #c9d8e8; padding-bottom: 5px; margin: 0 0 8px; }
      .print-copy { margin: 0; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
      .print-table { width: 100%; border-collapse: collapse; font-size: 11px; }
      .print-table th, .print-table td { border: 1px solid #bdcbd9; padding: 6px; text-align: left; vertical-align: top; white-space: pre-wrap; overflow-wrap: anywhere; }
      .print-table th { background: #e8f0f8; color: #1c426b; }
      .print-table tr { break-inside: avoid; }
      .print-list { margin: 0; padding-left: 18px; font-size: 12px; }
      .print-empty { color: #52647b; font-size: 12px; }
      @media print {
        html, body { background: white !important; }
        .print-root { background: white; color: black; }
        .print-actions { display: none !important; }
        .print-sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; }
        .print-section { break-inside: auto; }
        .print-section h2 { break-after: avoid; }
        .print-table thead { display: table-header-group; }
        .print-table th { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      }
    `}</style>
    <div className="print-actions"><Link href="/health-safety">Back to Health &amp; Safety</Link>{record && <button type="button" onClick={() => window.print()}>Print SWMS/TA</button>}</div>
    <article className="print-sheet">
      {loading && <p>Loading SWMS/TA…</p>}
      {error && <p role="alert">{error}</p>}
      {record && <>
        <header className="print-head">
          <div className="print-kicker">Health &amp; Safety · SWMS / Task Analysis</div>
          <h1>{record.title}</h1>
          <div className="print-meta"><span className={"print-status " + record.status}>{record.status}</span> &nbsp; Revision {record.revision} {record.template_version ? "· Template version " + record.template_version : ""} · Created {nzDate(record.created_at, true)} {record.completed_at ? "· Completed " + nzDate(record.completed_at, true) : ""}</div>
        </header>
        <div className="print-grid">
          <Field label="Work date" value={nzDate(record.work_date)} />
          <Field label="RPM job" value={record.job_reference} />
          <Field label="Site / location" value={record.site} />
          <Field label="Principal contractor" value={body.principal} />
          <Field label="Client" value={body.client} />
          <Field label="Person responsible" value={body.responsible} />
          <Field label="Duration" value={body.duration} />
          <Field label="Notifications" value={body.notification} />
          <Field label="Permits" value={body.permits} />
          <Field label="PPE" value={body.ppe} />
          <Field label="Plant / equipment" value={body.plant} />
          <Field label="Signage" value={body.signage} />
          <Field label="Approvals" value={body.approvals} />
          <Field label="Pre-start checks" value={body.checks} />
          <Field label="Qualifications" value={body.qualifications} />
        </div>
        <Narrative title="Scope of work" value={body.scope} />
        <Narrative title="Hazards" value={body.hazards} />
        <Narrative title="Controls" value={body.controls} />
        <section className="print-section"><h2>Safe work steps</h2>
          {steps.length ? <table className="print-table"><thead><tr><th>Task / step</th><th>Hazard</th><th>Risk</th><th>Control</th><th>Responsible</th></tr></thead><tbody>
            {steps.map((step, index) => <tr key={index}><td>{step.task}</td><td>{step.hazard}</td><td>{step.risk}</td><td>{step.control}</td><td>{step.responsible}</td></tr>)}
          </tbody></table> : <p className="print-empty">No work steps recorded.</p>}
        </section>
        <Narrative title="Emergency arrangements" value={body.emergency} />
        <Narrative title="Actions" value={body.actions} />
        <Narrative title="Notes" value={body.notes} />
        <section className="print-section"><h2>Attendees and sign-off</h2>
          {attendees.length ? <table className="print-table"><thead><tr><th>Name</th><th>Acknowledgement</th></tr></thead><tbody>
            {attendees.map(person => <tr key={person.id}><td>{person.name}</td><td>{person.signed_at ? "Signed " + nzDate(person.signed_at, true) : "Pending"}</td></tr>)}
          </tbody></table> : <p className="print-empty">No attendees recorded.</p>}
        </section>
        {attachments.length > 0 && <section className="print-section"><h2>Attachments / photos</h2><ul className="print-list">{attachments.map(file => <li key={file.id}>{file.file_name}</li>)}</ul></section>}
      </>}
    </article>
  </main>
}
