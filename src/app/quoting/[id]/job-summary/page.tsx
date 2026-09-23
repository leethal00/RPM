"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Printer } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

const GREEN = "#155f4c"
const DEPARTMENTS = ["Main", "CNC", "Metal", "Fab", "Electrical", "Vinyl", "Install"]
const SECTION_HEADING_CODE = "__RPM_SECTION_HEADING__"
const fmt = (v?: string | null) => v
  ? new Date(`${v.slice(0, 10)}T00:00:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })
  : ""

type Item = {
  id: string
  name: string
  sign_code: string | null
  mode: "simple" | "build"
  qty: number
  build_qty: number | null
  size: string | null
  details: string | null
  delivery: string | null
  sort: number
}

type Job = {
  id: string
  title: string
  job_number: string | null
  xero_invoice_number: string | null
  created_at: string
  contact_name?: string | null
  quote_contact?: string | null
  production_contact_name?: string | null
  completion_date?: string | null
  due_date?: string | null
  clients?: { name?: string | null } | null
  stores?: {
    name?: string | null
    address?: string | null
    manager_name?: string | null
    manager_phone?: string | null
  } | null
}

type BomLine = {
  id: string
  item_id: string | null
  section: string | null
  subsection: string | null
  description: string
}

function prettyQty(value: number | null | undefined) {
  const n = Number(value || 0)
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
}

function itemQty(item: Item) {
  return item.mode === "build" ? (item.build_qty ?? item.qty ?? 1) : (item.qty ?? 1)
}

function inferDepartments(title: string, details: string, lines: BomLine[]) {
  const result = new Set<string>()
  const sectionText = lines
    .map((line) => `${line.section || ""} ${line.subsection || ""}`)
    .join(" ")
    .toLowerCase()

  if (/\bcnc\b|router|routing|milling|lathe/.test(sectionText)) result.add("CNC")
  if (/metal|steel|aluminium|aluminum|weld|fabricat|bracket|shs|rhs/.test(sectionText)) result.add("Metal")
  if (/\bfab\b|fabrication|assembly|assemble|fold|press|guillotine/.test(sectionText)) result.add("Fab")
  if (/electrical|illumin|\bled\b|wiring|power|transformer/.test(sectionText)) result.add("Electrical")
  if (/vinyl|graphic|print|laminat/.test(sectionText)) result.add("Vinyl")
  if (/install|site work|service|repair|maintenance/.test(sectionText)) result.add("Install")

  const descriptiveText = `${title} ${details} ${lines.map((line) => line.description || "").join(" ")}`
    .toLowerCase()
    .replace(/no allowance for[^.\n]*/g, "")
    .replace(/no [^.\n]*work/g, "")
    .replace(/exclude(?:d|s|ing)?[^.\n]*/g, "")
    .replace(/not included[^.\n]*/g, "")
    .replace(/not required[^.\n]*/g, "")

  if (/\bcnc\b|router|routing|milling|lathe/.test(descriptiveText)) result.add("CNC")
  if (/steel|aluminium|aluminum|weld|metal|bracket|shs|rhs/.test(descriptiveText)) result.add("Metal")
  if (/illumin|electrical|\bled\b|wiring|power|transformer/.test(descriptiveText)) result.add("Electrical")
  if (/vinyl|graphic|print|laminat/.test(descriptiveText)) result.add("Vinyl")
  if (/servic|repair|site work|install|maintenance/.test(descriptiveText)) result.add("Install")

  return Array.from(result)
}

export default function JobSummaryPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = useMemo(() => createClient(), [])
  const [job, setJob] = useState<Job | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [bomLines, setBomLines] = useState<BomLine[]>([])
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const [{ data: jobData }, { data: itemData }, { data: lineData }] = await Promise.all([
        supabase.from("costing_jobs").select("*,clients(name),stores(name,address,manager_name,manager_phone)").eq("id", id).single(),
        supabase.from("costing_items").select("id,name,sign_code,mode,qty,build_qty,size,details,delivery,sort").eq("job_id", id).order("sort"),
        supabase.from("costing_lines").select("id,item_id,section,subsection,description").eq("job_id", id).order("sort"),
      ])
      const nextJob = jobData as Job
      const nextItems = ((itemData || []) as Item[]).filter((item) => item.sign_code !== SECTION_HEADING_CODE)
      const nextLines = (lineData || []) as BomLine[]
      setJob(nextJob)
      setItems(nextItems)
      setBomLines(nextLines)
      setSelectedDepartments(inferDepartments(nextJob.title || "", nextItems.map((item) => item.details || "").join(" "), nextLines))
      setLoading(false)
    })()
  }, [id, supabase])

  useEffect(() => {
    if (!job) return
    const previous = document.title
    const number = (job.job_number || job.xero_invoice_number || "").replace(/^INV-/i, "")
    document.title = [number, job.clients?.name, job.title, "Summary"].filter(Boolean).join(" - ")
    return () => { document.title = previous }
  }, [job])

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading summary...</div>
  if (!job) return <div className="p-8 text-sm text-muted-foreground">Job not found.</div>

  const number = (job.job_number || job.xero_invoice_number || "").replace(/^INV-/i, "")
  const client = [job.clients?.name, job.stores?.name].filter(Boolean).join(" ") || "Ad-hoc / wholesale"
  const contact = job.production_contact_name || job.quote_contact || job.contact_name || job.stores?.manager_name || ""
  const phone = job.stores?.manager_phone || ""
  const requiredBy = job.completion_date || job.due_date || null
  const qrUrl = typeof window !== "undefined"
    ? `https://quickchart.io/qr?size=180&margin=0&text=${encodeURIComponent(window.location.href)}`
    : ""
  const buildItems = items.filter((item) => item.mode === "build")

  const toggleDepartment = (department: string) => {
    setSelectedDepartments((current) => current.includes(department)
      ? current.filter((item) => item !== department)
      : [...current, department])
  }

  const workshopRef = (item: Item) => {
    if (item.mode !== "build" || !number) return ""
    const index = buildItems.findIndex((buildItem) => buildItem.id === item.id)
    return index >= 0 ? `${number}-${index + 1}` : ""
  }

  return (
    <div className="min-h-screen bg-neutral-900/90 print:bg-white">
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          .no-print { display: none !important; }
          .sheet { margin: 0 !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-2.5">
        <Link href={`/quoting/${id}/job-pack`} className="inline-flex items-center gap-1.5 text-sm text-neutral-600">
          <ArrowLeft className="size-4" /> Back to job pack
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
          <Printer className="size-4" /> Print / Save as PDF
        </button>
      </div>

      <div className="sheet box-border mx-auto my-6 min-h-[297mm] w-[210mm] bg-white px-[10mm] py-[8mm] text-[11.5px] leading-[1.3] shadow-2xl">
        <div className="grid min-h-[31mm] grid-cols-[23mm_1fr_22mm_29mm] items-stretch gap-[2.5mm] border border-[#c2cbc8] bg-[#f3f5f4] px-[2.5mm] py-[2mm]">
          <div className="flex items-center justify-center bg-white">
            <img src="/R-2025.svg" alt="Rodier" className="h-[20mm] w-[20mm] object-contain" />
          </div>
          <div className="grid grid-cols-[1fr_1fr] content-start gap-x-[4mm] gap-y-[1.15mm] pt-[.5mm] text-[11px] leading-[1.1]">
            <div className="col-span-2 flex gap-[1.8mm]"><span className="font-bold">Client:</span><span className="font-bold">{client}</span></div>
            <div className="flex gap-[1.8mm]"><span className="font-bold">Contact:</span><span>{contact}</span></div>
            <div className="flex gap-[1.8mm]"><span className="font-bold">Phone:</span><span>{phone}</span></div>
            <div className="col-span-2 flex gap-[1.8mm]"><span className="font-bold">Site:</span><span>{job.stores?.address || ""}</span></div>
            <div className="col-span-2 flex gap-[1.8mm]"><span className="font-bold">Job Title:</span><span className="font-bold">{job.title}</span></div>
            <div className="flex gap-[1.8mm]"><span className="font-bold">Date Issued:</span><span>{fmt(job.created_at)}</span></div>
            <div className="flex gap-[1.8mm]"><span className="font-bold">Required By:</span><span>{fmt(requiredBy)}</span></div>
          </div>
          <div className="flex flex-col items-center justify-center bg-white">
            {qrUrl ? <img src={qrUrl} alt="RPM job summary QR code" className="h-[18mm] w-[18mm]" /> : <div className="h-[18mm] w-[18mm] border border-black" />}
            <div className="mt-[.8mm] text-center text-[7.4px] leading-none">Scan to view in RPM</div>
          </div>
          <div className="flex flex-col items-center justify-center border-l border-[#c2cbc8] bg-white px-[1mm]">
            <div className="text-[8.5px] font-bold leading-none">Job No.</div>
            <div className="mt-[1mm] text-[34px] font-black leading-none tracking-tight whitespace-nowrap" style={{ color: GREEN }}>{number}</div>
          </div>
        </div>

        <div className="mt-[2.1mm] h-[6mm] px-[2.5mm] py-[.7mm] text-[12px] font-black text-white" style={{ background: GREEN }}>
          DEPARTMENTS <span className="font-normal">(auto-selected from BOM — adjust if needed)</span>
        </div>
        <div className="flex h-[9mm] items-center justify-between border border-t-0 border-[#b9c5c1] px-[2.5mm]">
          {DEPARTMENTS.map((department) => (
            <button type="button" key={department} onClick={() => toggleDepartment(department)} className="inline-flex items-center gap-[2mm] whitespace-nowrap text-[11.6px]">
              <i className={`inline-grid h-[4mm] w-[4mm] shrink-0 place-items-center border text-[9px] not-italic leading-none ${selectedDepartments.includes(department) ? "border-[#155f4c] bg-[#155f4c] font-black text-white" : "border-neutral-500 bg-white"}`}>
                {selectedDepartments.includes(department) ? "✓" : ""}
              </i>
              {department}
            </button>
          ))}
        </div>

        <div className="mt-[4mm]">
          <div className="h-[7mm] px-[2.5mm] py-[1.2mm] text-[12px] font-black text-white" style={{ background: GREEN }}>JOB SUMMARY / PROJECT ITEMS</div>
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col style={{ width: "15%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "27%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "32%" }} />
            </colgroup>
            <thead>
              <tr className="bg-[#eef2f1]">
                {["Workshop Ref", "Qty", "Item", "Size", "Description"].map((h) => <th key={h} className="border border-[#b9c5c1] px-[1.5mm] py-[1.5mm] text-left text-[10.5px]">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="border border-[#b9c5c1] px-[1.5mm] py-[2mm] font-black" style={{ color: item.mode === "build" ? GREEN : undefined }}>{workshopRef(item)}</td>
                  <td className="border border-[#b9c5c1] px-[1.5mm] py-[2mm] font-bold">{prettyQty(itemQty(item))}</td>
                  <td className="border border-[#b9c5c1] px-[1.5mm] py-[2mm] font-bold">{item.name}</td>
                  <td className="border border-[#b9c5c1] px-[1.5mm] py-[2mm]">{item.size || ""}</td>
                  <td className="border border-[#b9c5c1] px-[1.5mm] py-[2mm]">
                    <div className="whitespace-pre-wrap">{item.details || ""}</div>
                    {item.delivery && <div className="mt-[1mm] text-neutral-600">{item.delivery}</div>}
                  </td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={5} className="border border-[#b9c5c1] p-4 text-center text-neutral-500">No items on this job.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
