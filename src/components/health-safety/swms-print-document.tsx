import Image from "next/image"
import { isWorkDateTbc } from "@/lib/hs-work-date"

type WorkStep = { task?: string; hazard?: string; risk?: string; control?: string; responsible?: string }
type Body = {
  scope?: string; hazards?: string; controls?: string; emergency?: string; actions?: string; notes?: string
  principal?: string; client?: string; responsible?: string; duration?: string; notification?: string
  permits?: string; ppe?: string; plant?: string; signage?: string; approvals?: string
  checks?: string; qualifications?: string; steps?: WorkStep[]; date_tbc?: boolean
}
export type RecordRow = {
  id: string; title: string; status: "draft" | "completed"; job_reference: string | null
  site: string | null; work_date: string; body: Body | null; revision: number
  template_version: number | null; completed_at: string | null; created_at: string
}
export type Attendee = { id: string; name: string; signed_at: string | null }
export type Attachment = { id: string; file_name: string }

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


const likelihoods = ["Almost certain", "Likely", "Possible", "Unlikely", "Rare"]
const riskMatrix = [
  { label: "Fatality", values: [5, 5, 4, 3, 3] },
  { label: "Major injury/illness", values: [5, 4, 3, 3, 2] },
  { label: "Moderate injury/illness", values: [4, 3, 3, 3, 2] },
  { label: "Minor injury/illness", values: [3, 3, 3, 2, 1] },
  { label: "First aid treatment", values: [3, 2, 2, 1, 1] },
]
const riskLevels = [
  { level: 5, label: "Critical Risk", action: "Urgent attention required — life threatening. STOP ALL ACTIVITIES immediately and take urgent action to eliminate the risk." },
  { level: 4, label: "High Risk", action: "Requires immediate corrective action, usually within 24 hours." },
  { level: 3, label: "Medium Risk", action: "Corrective action usually required within 1 week." },
  { level: 2, label: "Low Risk", action: "Corrective action usually required within 1 month." },
  { level: 1, label: "Very Low Risk", action: "No corrective action usually required. Record accordingly and proceed with care." },
]
function StepColumns() {
  return <colgroup><col className="col-task"/><col className="col-hazard"/><col className="col-risk"/><col className="col-control"/><col className="col-responsible"/></colgroup>
}
function StepHead() {
  return <thead><tr><th scope="col">Task / step</th><th scope="col">Potential hazards</th><th scope="col">Risk (1–5)</th><th scope="col">Hazard controls</th><th scope="col">Responsible</th></tr></thead>
}

export function SwmsPrintDocument({ record, attendees, attachments }: { record: RecordRow; attendees: Attendee[]; attachments: Attachment[] }) {
  const body: Body = record.body || {}
  const projectReference = record.job_reference?.trim().replace(/^INV-\s*/i, "") || ""
  const steps = (body.steps || []).filter(step => Object.values(step).some(value => value?.trim()))
  return <main className="print-root">
    <style>{`
      @page { size: A4 landscape; margin: 44mm 12mm 12mm; }
      .print-root { min-height: 100vh; background: #f1f4f7; color: #172b46; font-family: var(--font-geist-sans), Arial, sans-serif; line-height: 1.4; -webkit-font-smoothing: antialiased; }
      .print-actions { max-width: 1120px; margin: 0 auto; padding: 18px 24px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
      .print-actions a { color: #225a91; text-decoration: underline; }
      .print-actions button { border: 0; border-radius: 6px; background: #225a91; color: white; padding: 10px 18px; cursor: pointer; }
      .print-sheet { max-width: 1120px; margin: 0 auto 32px; padding: 32px 40px; background: white; box-shadow: 0 10px 40px #19345112; }
      .print-head { display: flex; align-items: flex-start; gap: 20px; break-inside: avoid; border-bottom: 2px solid #172b46; padding-bottom: 16px; margin-bottom: 18px; }
      .print-logo { flex: 0 0 auto; width: 96px; height: 96px; object-fit: contain; }
      .print-heading { min-width: 0; flex: 1; }
      .print-part { margin: 20px 0 12px; padding: 8px 12px; background: #f2f6fa; color: #172b46; border-left: 3px solid #225a91; border-bottom: 1px solid #dce5ee; font-size: 16px; font-weight: 650; letter-spacing: -.02em; break-after: avoid; }
      .print-kicker { text-transform: uppercase; letter-spacing: .14em; font-size: 10px; font-weight: 600; color: #52647b; }
      .print-head h1 { margin: 6px 0 10px; font-size: 28px; font-weight: 650; letter-spacing: -.035em; line-height: 1.15; }
      .print-meta { font-size: 11px; color: #637389; line-height: 1.5; }
      .print-status { display: inline-block; padding: 2px 9px; background: #f2f6fa; border: 1px solid #dce5ee; border-radius: 999px; font-size: 10px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
      .print-status.draft { color: #87520e; background: #fff8ea; border-color: #ead8b5; }
      .print-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; margin: 12px 0 16px; }
      .print-field { break-inside: avoid; padding: 8px 10px; border: 1px solid #d5dfe9; border-radius: 4px; background: white; }
      .print-label { margin-bottom: 3px; font-size: 9px; text-transform: uppercase; letter-spacing: .09em; font-weight: 600; color: #637389; }
      .print-value { font-size: 12px; font-weight: 450; white-space: pre-wrap; overflow-wrap: anywhere; }
      .print-section { margin: 18px 0; break-inside: avoid; }
      .print-section h2 { font-size: 13px; font-weight: 600; color: #172b46; border-bottom: 1px solid #dce5ee; padding-bottom: 6px; margin: 0 0 8px; }
      .print-copy { margin: 0; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
      .print-section .print-copy { padding: 8px 10px; border: 1px solid #d5dfe9; border-radius: 4px; }
      .print-table { width: 100%; border-collapse: collapse; font-size: 11px; line-height: 1.3; }
      .print-table th, .print-table td { border: 1px solid #d5dfe9; padding: 7px; text-align: left; vertical-align: top; white-space: pre-wrap; overflow-wrap: anywhere; }
      .print-table th { background: #f2f6fa; color: #172b46; font-weight: 600; }
      .print-steps tbody tr:nth-child(even) td { background: #fafbfd; }
      .print-table tr { break-inside: avoid; }
      .print-steps { table-layout: fixed; }
      .print-steps .col-task { width: 19%; }
      .print-steps .col-hazard { width: 23%; }
      .print-steps .col-risk { width: 8%; }
      .print-steps .col-control { width: 35%; }
      .print-steps .col-responsible { width: 15%; }
      .print-steps th, .print-steps td { overflow-wrap: break-word; word-break: normal; hyphens: none; }
      .print-steps th:nth-child(3), .print-steps th:nth-child(5) { white-space: nowrap; }
      .print-section-title { margin: 12px 0 8px; font-size: 13px; font-weight: 600; color: #172b46; }
      .print-risk-layout { display: grid; grid-template-columns: 1fr 1.2fr; gap: 24px; align-items: start; }
      .print-risk-table { table-layout: fixed; }
      .print-risk-table th, .print-risk-table td { overflow-wrap: normal; white-space: normal; }
      .print-risk-table th:first-child { width: 26%; }
      .print-risk-table td { text-align: center; font-weight: 700; }
      .print-risk-legend td { text-align: left; font-weight: normal; }
      .print-risk-legend th:first-child { width: auto; }
      .print-risk-legend td:first-child { text-align: center; font-weight: 700; }
      .risk-5 { background: #ff0000; color: black; }
      .risk-4 { background: #f99c3c; color: black; }
      .risk-3 { background: #ffff00; color: black; }
      .risk-2 { background: #92d050; color: black; }
      .risk-1 { background: #00b0e8; color: black; }
      .print-blank-row { height: 16mm; }
      .print-on-site { margin-top: 30px; border-top: 2px solid #225a91; padding-top: 10px; }
      @media screen and (max-width: 700px) {
        .print-sheet { padding: 20px 12px; overflow-x: auto; }
        .print-steps { min-width: 760px; }
        .print-risk-layout { grid-template-columns: 1fr; }
      }
      .print-list { margin: 0; padding-left: 18px; font-size: 12px; }
      .print-empty { color: #52647b; font-size: 12px; }
      @media print {
        html, body { background: white !important; }
        .print-root { background: white; color: black; }
        .print-actions { display: none !important; }
        .print-sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; }
        .print-head { padding-bottom: 12px; margin-bottom: 14px; }
        .print-head h1 { font-size: 22px; margin: 4px 0 6px; }
        /* Fixed print elements repeat on every page. Reserve the top page margin
           for the header so continuation tables never overlap it. */
        .print-document-head { position: fixed; top: -32mm; left: 0; right: 0; margin: 0; background: white; }
        .print-grid { gap: 6px 16px; margin: 8px 0 10px; }
        .print-field { padding: 4px 8px; }
        .print-section .print-copy { padding: 5px 8px; }
        .print-label { margin-bottom: 2px; }
        .print-section { margin: 12px 0; break-inside: auto; }
        .print-table { line-height: 1.2; }
        .print-table th, .print-table td { padding: 5px 7px; }
        .print-section h2 { break-after: avoid; }
        .print-table thead { display: table-header-group; }
        .print-table th, .print-risk-table td, .print-part { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .print-part-page { break-before: page; }
        .print-risk-section { break-inside: avoid; }
        .print-on-site { break-before: page; break-inside: avoid; margin-top: 0; border-top: 0; padding-top: 0; }
        .print-on-site .print-head { display: none; }
        .print-on-site .print-part { margin-top: 12px; }
        .print-on-site .print-steps tbody tr td { background: white; }
      }
    `}</style>
    <article className="print-sheet">
      <>
        <header className="print-head print-document-head">
          <Image src="/rodier-logo.png" alt="Rodier logo" width={96} height={96} loading="eager" unoptimized className="print-logo" />
          <div className="print-heading">
          <div className="print-kicker">Health &amp; Safety · SWMS / Task Analysis</div>
          <h1>{record.title}</h1>
          <div className="print-meta"><span className={"print-status " + record.status}>{record.status}</span> &nbsp; Revision {record.revision} {record.template_version ? "· Template version " + record.template_version : ""} · Created {nzDate(record.created_at, true)} {record.completed_at ? "· Completed " + nzDate(record.completed_at, true) : ""}</div>
          <div className="print-meta">Project number: {projectReference || "\u2014"} &middot; Work date: {isWorkDateTbc(record) ? "TBC" : nzDate(record.work_date)}</div>
          </div>
        </header>
        <h2 className="print-part">Part 1 · Company and job details</h2>
        <div className="print-grid">
          <Field label="Work date" value={isWorkDateTbc(record) ? "TBC" : nzDate(record.work_date)} />
          <Field label="Project number" value={projectReference} />
          <Field label="Site / location" value={record.site} />
          <Field label="Principal contractor" value={body.principal} />
          <Field label="Client" value={body.client} />
          <Field label="Person responsible" value={body.responsible} />
        </div>
        <h3 className="print-section-title">Site requirements and preparation</h3>
        <div className="print-grid">
          <Field label="Duration" value={body.duration} />
          <Field label="Notifications" value={body.notification} />
          <Field label="Permits" value={body.permits} />
          <Field label="PPE" value={body.ppe} />
          <Field label="Plant / equipment" value={body.plant} />
          <Field label="Signage" value={body.signage} />
          <Field label="Approvals" value={body.approvals} />
          <Field label="Pre-start checks" value={body.checks} />
        </div>
        <Narrative title="Scope of work" value={body.scope} />
        <Narrative title="Hazards" value={body.hazards} />
        <Narrative title="Controls" value={body.controls} />
        <h2 className="print-part print-part-page">Part 2 · Safe work steps</h2>
        <section className="print-section">
          {steps.length ? <table className="print-table print-steps"><StepColumns /><StepHead /><tbody>
            {steps.map((step, index) => <tr key={index}><td>{step.task}</td><td>{step.hazard}</td><td>{step.risk}</td><td>{step.control}</td><td>{step.responsible}</td></tr>)}
          </tbody></table> : <p className="print-empty">No work steps recorded.</p>}
        </section>
        <h2 className="print-part print-part-page">Part 3 · Qualifications and team sign-off</h2>
        <Narrative title="Qualifications, training and duties" value={body.qualifications} />
        <Narrative title="Emergency arrangements" value={body.emergency} />
        <Narrative title="Actions" value={body.actions} />
        <Narrative title="Notes" value={body.notes} />
        <section className="print-section"><h2>Attendees and sign-off</h2>
          {attendees.length ? <table className="print-table"><thead><tr><th>Name</th><th>Acknowledgement</th></tr></thead><tbody>
            {attendees.map(person => <tr key={person.id}><td>{person.name}</td><td>{person.signed_at ? "Signed " + nzDate(person.signed_at, true) : "Pending"}</td></tr>)}
          </tbody></table> : <p className="print-empty">No attendees recorded.</p>}
        </section>
        {attachments.length > 0 && <section className="print-section"><h2>Attachments / photos</h2><ul className="print-list">{attachments.map(file => <li key={file.id}>{file.file_name}</li>)}</ul></section>}
        <section className="print-risk-section print-part-page">
          <h2 className="print-part">Level of risk · Assessment chart</h2>
          <p className="print-copy">Rate the possible hazards by considering how serious the injury would be and the likelihood of being injured.</p>
          <div className="print-risk-layout">
            <table className="print-table print-risk-table">
              <caption className="print-section-title">Likelihood of being injured</caption>
              <thead><tr><th scope="col">Seriousness of the injury</th>{likelihoods.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
              <tbody>{riskMatrix.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{row.values.map((value, index) => <td key={index} className={`risk-${value}`}>{value}</td>)}</tr>)}</tbody>
            </table>
            <table className="print-table print-risk-table print-risk-legend">
              <caption className="print-section-title">Level of risk and required action</caption>
              <colgroup><col style={{ width: "10%" }}/><col style={{ width: "23%" }}/><col style={{ width: "67%" }}/></colgroup>
              <thead><tr><th scope="col">Level</th><th scope="col">Risk</th><th scope="col">Required action</th></tr></thead>
              <tbody>{riskLevels.map(row => <tr key={row.level}><td className={`risk-${row.level}`}>{row.level}</td><td><strong>{row.label}</strong></td><td>{row.action}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
        <section className="print-on-site" aria-label="Additional on-site work steps">
          <header className="print-head"><Image src="/rodier-logo.png" alt="Rodier logo" width={96} height={96} loading="eager" unoptimized className="print-logo" /><div className="print-heading"><div className="print-kicker">SWMS / Task Analysis · Additional on-site steps</div><h1>{record.title}</h1><div className="print-meta">Project number: {projectReference || "\u2014"} · Revision {record.revision} · Work date: {isWorkDateTbc(record) ? "TBC" : nzDate(record.work_date)}</div></div></header>
          <h2 className="print-part">Part 2 · Additional steps — fill out on site as required</h2>
          <p className="print-copy">Site: {record.site || "________________"} · Date of additions: ________________ · Reviewed / briefed by: ________________________</p>
          <table className="print-table print-steps"><StepColumns /><StepHead /><tbody>{Array.from({ length: 7 }, (_, index) => <tr className="print-blank-row" key={index}>{Array.from({ length: 5 }, (_, column) => <td key={column}>&nbsp;</td>)}</tr>)}</tbody></table>
        </section>
      </>
    </article>
  </main>
}
