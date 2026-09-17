"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Printer,
  Shirt,
  Footprints,
  Glasses,
  Hand,
  Headphones,
  HardHat,
  ShieldCheck,
  Wind,
  Phone,
  MapPin,
  Cross,
  Hospital,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { CostingJob } from "@/types/database"

const GREEN = "#155f4c"
const DEPARTMENTS = ["Main", "CNC", "Metal", "Fab", "Electrical", "Vinyl", "Install"]
const rows = (n: number) => Array.from({ length: n })
const fmt = (v?: string | null) => v
  ? new Date(`${v.slice(0, 10)}T00:00:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })
  : ""

const beforeYouStart = [
  "Site induction completed (if required)",
  "Read and understand the job scope",
  "Discuss any risks with the team / site contact",
  "Check required PPE is available and in good condition",
  "Inspect tools and equipment",
  "Ensure permits (hot work, EWP, electrical, etc.) are authorised",
  "Identify and isolate any hazards",
  "Take a moment - plan the job",
]

const onSite = [
  "Keep work area clean and organised",
  "Use barriers / signage where required",
  "Keep the public clear of the work area",
  "Follow site rules and client requirements",
  "Report any incidents, near misses or hazards",
  "Take photos of work in progress and completion",
  "Do not work under the influence of drugs or alcohol",
  "If unsure - stop and ask",
]

const procedures = [
  "Follow client site induction and specific requirements (e.g. McDonalds)",
  "Comply with all relevant NZ Health & Safety legislation",
  "Use correct tools, equipment and PPE for the task",
  "Ensure electrical work is carried out by a qualified person",
  "Isolate power before working on electrical components",
  "Use EWP / ladders correctly and follow height safety procedures",
  "Secure signage and components to prevent falling objects",
  "Ensure waste is disposed of correctly",
  "Report any variations to the job scope to your supervisor",
  "Complete all paperwork and time/materials accurately",
]

const ppe = [
  { label: "Hi-vis\nClothing", Icon: Shirt },
  { label: "Safety\nFootwear", Icon: Footprints },
  { label: "Eye\nProtection", Icon: Glasses },
  { label: "Gloves", Icon: Hand },
  { label: "Hearing\nProtection", Icon: Headphones },
  { label: "Hard Hat", Icon: HardHat },
  { label: "Fall\nProtection", Icon: ShieldCheck },
  { label: "Respiratory\nProtection", Icon: Wind },
]

type JobItem = {
  id: string
  name: string
  mode: string
  qty: number | null
  build_qty: number | null
  sort: number | null
}

type BomLine = {
  id: string
  item_id: string | null
  section: string | null
  subsection: string | null
  description: string
  qty: number | null
  internal_note: string | null
  sort: number | null
  materials?: { unit?: string | null; is_labour?: boolean | null } | { unit?: string | null; is_labour?: boolean | null }[] | null
}

function materialMeta(line: BomLine) {
  return Array.isArray(line.materials) ? line.materials[0] : line.materials
}

function prettyQty(value: number | null | undefined) {
  const n = Number(value || 0)
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
}

export default function JobCardPage() {
  const supabase = useMemo(() => createClient(), [])
  const { id } = useParams<{ id: string }>()
  const [job, setJob] = useState<CostingJob | null>(null)
  const [items, setItems] = useState<JobItem[]>([])
  const [bomLines, setBomLines] = useState<BomLine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    ;(async () => {
      const [{ data: jobData }, { data: itemData }, { data: lineData }] = await Promise.all([
        supabase
          .from("costing_jobs")
          .select(`*, clients ( name ), stores ( name, address, manager_name, manager_phone )`)
          .eq("id", id)
          .single(),
        supabase
          .from("costing_items")
          .select("id,name,mode,qty,build_qty,sort")
          .eq("job_id", id)
          .order("sort"),
        supabase
          .from("costing_lines")
          .select("id,item_id,section,subsection,description,qty,internal_note,sort,materials(unit,is_labour)")
          .eq("job_id", id)
          .order("sort"),
      ])
      if (live) {
        setJob(jobData as CostingJob)
        setItems((itemData || []) as JobItem[])
        setBomLines((lineData || []) as BomLine[])
        setLoading(false)
      }
    })()
    return () => { live = false }
  }, [supabase, id])

  if (loading) return <div className="p-10 text-sm text-muted-foreground">Loading job card...</div>
  if (!job) return <div className="p-10 text-sm text-muted-foreground">Job not found.</div>

  const j = job as CostingJob & {
    quote_contact?: string | null
    due_date?: string | null
    completion_date?: string | null
    production_title?: string | null
    production_details?: string | null
    production_contact_name?: string | null
    stores?: {
      name?: string | null
      address?: string | null
      manager_name?: string | null
      manager_phone?: string | null
    } | null
  }
  const title = j.production_title || job.title
  const details = j.production_details ?? job.details ?? ""
  const customer = [job.clients?.name, j.stores?.name].filter(Boolean).join(" ") || "Ad-hoc / wholesale"
  const number = (job.job_number || job.xero_invoice_number || "").replace(/^INV-/i, "")
  const contact = j.production_contact_name || j.quote_contact || job.contact_name || j.stores?.manager_name || ""
  const phone = j.stores?.manager_phone || ""
  const requiredBy = j.completion_date || j.due_date || null
  const buildItems = items.filter((item) => item.mode === "build")
  const buildSummary = buildItems.length
    ? buildItems.map((item) => `${item.name}: ${prettyQty(item.build_qty ?? item.qty ?? 1)}`).join(" · ")
    : ""
  const itemNames = new Map(items.map((item) => [item.id, item.name]))

  const routingText = `${title || ""} ${details || ""} ${bomLines.map((line) => `${line.section || ""} ${line.subsection || ""} ${line.description || ""}`).join(" ")}`.toLowerCase()
  const autoDepartments = new Set<string>()
  if (/\bcnc\b|router|routing|milling|lathe/.test(routingText)) autoDepartments.add("CNC")
  if (/steel|aluminium|aluminum|weld|metal|fabricat|bracket|shs|rhs/.test(routingText)) autoDepartments.add("Metal")
  if (/fabricat|assemble|assembly|fold|press|guillotine/.test(routingText)) autoDepartments.add("Fab")
  if (/illumin|electrical|\bled\b|light|wiring|power|transformer/.test(routingText)) autoDepartments.add("Electrical")
  if (/vinyl|graphic|print|laminat/.test(routingText)) autoDepartments.add("Vinyl")
  if (/servic|repair|site|install|maintenance/.test(routingText)) autoDepartments.add("Install")

  const qrUrl = typeof window !== "undefined"
    ? `https://quickchart.io/qr?size=180&margin=0&text=${encodeURIComponent(window.location.href)}`
    : ""

  return (
    <div className="min-h-screen bg-neutral-900/90 print:bg-white text-black">
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          .no-print { display: none !important; }
          .sheet { margin: 0 !important; box-shadow: none !important; page-break-after: always; break-after: page; }
          .sheet:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-2.5">
        <Link href={`/quoting/jobs/${id}`} className="inline-flex items-center gap-1.5 text-sm text-neutral-600">
          <ArrowLeft className="size-4" /> Back to job
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
          <Printer className="size-4" /> Print / Save as PDF
        </button>
      </div>

      <Sheet>
        <JobHeader
          number={number}
          customer={customer}
          site={j.stores?.address || ""}
          title={title}
          issued={fmt(job.created_at)}
          due={fmt(requiredBy)}
          contact={contact}
          phone={phone}
          qrUrl={qrUrl}
        />

        <div className="mt-[2.5mm] grid grid-cols-[1.4fr_1fr] gap-[2mm]">
          <Box title="JOB DETAILS / SCOPE OF WORK" className="h-[30mm]">
            {buildSummary && <div className="mb-[1.2mm] font-bold">Build qty — {buildSummary}</div>}
            <div className="whitespace-pre-wrap">{details || title}</div>
          </Box>
          <Box title="SPECIAL INSTRUCTIONS" className="h-[30mm]">
            <ul className="list-disc space-y-[.8mm] pl-[4mm]">
              <li>Work safely and follow site induction requirements</li>
              <li>Coordinate with site management</li>
              <li>Take photos of completed work</li>
              <li>Report any additional work required</li>
              <li>Keep site clean and tidy</li>
            </ul>
          </Box>
        </div>

        <Bar>DEPARTMENTS</Bar>
        <div className="flex h-[9mm] items-center justify-between border border-t-0 border-[#b9c5c1] px-[2.5mm]">
          {DEPARTMENTS.map((d) => (
            <span key={d} className="inline-flex items-center gap-[2mm] whitespace-nowrap text-[10.2px]">
              <CheckBox checked={autoDepartments.has(d)} />{d}
            </span>
          ))}
        </div>

        <Bar>TIME LOG</Bar>
        <JobGrid />
        <div className="flex h-[9.5mm] items-center justify-end gap-[2.5mm] pr-[38mm] text-[10.5px] font-bold">
          <span>Total Hours:</span><span className="h-[8mm] w-[17mm] border border-[#7b9e92] bg-white" />
        </div>

        <Bar noTop>MATERIALS / PARTS USED</Bar>
        <MaterialsGrid />

        <div className="mt-[6mm] grid grid-cols-[1.15fr_.92fr_1fr] gap-[2mm]">
          <Box title="ADDITIONAL NOTES / ISSUES" className="h-[42mm]" />
          <Box title="JOB STATUS (tick when complete)" className="h-[42mm]">
            <Checks items={["Work completed", "Site left clean and tidy", "Photos taken", "All materials used", "Any variations noted and reported"]} />
          </Box>
          <Box title="SIGN OFF" className="h-[42mm]">
            <div className="space-y-[5mm] pt-[2mm]">
              <SignLine label="Name" />
              <SignLine label="Signature" />
              <div className="flex items-end gap-[2mm]"><span className="w-[13mm]">Date:</span><span className="flex-1 border-b border-neutral-700 text-center">____ / ____ / ______</span></div>
            </div>
          </Box>
        </div>
      </Sheet>

      <Sheet>
        <ProductionHeader number={number} title={title} customer={customer} buildSummary={buildSummary} requiredBy={fmt(requiredBy)} />
        <div className="mt-[3mm]">
          <Bar>BOM / MATERIALS &amp; WORK REQUIRED</Bar>
          <BomTable lines={bomLines} itemNames={itemNames} />
        </div>
        <div className="mt-[4mm] grid grid-cols-2 gap-[2mm]">
          <Box title="PRODUCTION NOTES" className="h-[40mm]" />
          <Box title="VARIATIONS / SUBSTITUTIONS" className="h-[40mm]" />
        </div>
        <p className="mt-[3mm] text-[8.5px] text-neutral-500">Quantities shown are the RPM BOM quantities for the complete build. No cost or sell pricing is shown on this job card.</p>
      </Sheet>

      <Sheet>
        <Header safety />

        <div className="mt-[3.5mm] grid grid-cols-[1fr_1fr] gap-[2mm]">
          <Box title="OUR SAFETY COMMITMENT" className="h-[56mm]">
            <p className="pt-[2mm] text-[10.8px] leading-[1.55]">
              At Rodier we value the health and safety of our people, our clients and the public. We all share responsibility for a safe workplace and must work in a way that prevents harm.
            </p>
            <div className="mt-[6mm] text-[11.5px] font-black tracking-[.03em]" style={{ color: GREEN }}>
              THINK SAFE&nbsp;&nbsp;|&nbsp;&nbsp;WORK SAFE&nbsp;&nbsp;|&nbsp;&nbsp;HOME SAFE
            </div>
          </Box>
          <Box title="BEFORE YOU START" className="h-[56mm]">
            <Checks items={beforeYouStart} tight />
          </Box>

          <Box title="REQUIRED PPE" suffix="(as applicable)" className="h-[61mm]">
            <div className="grid grid-cols-4 gap-x-[2mm] gap-y-[4mm] pt-[2mm]">
              {ppe.map(({ label, Icon }) => (
                <div key={label} className="flex flex-col items-center text-center">
                  <div className="grid h-[15mm] w-[15mm] place-items-center rounded-full bg-[#0871b7] text-white">
                    <Icon className="h-[9mm] w-[9mm]" strokeWidth={1.8} />
                  </div>
                  <div className="mt-[1.2mm] whitespace-pre-line text-[9.2px] font-medium leading-tight">{label}</div>
                </div>
              ))}
            </div>
          </Box>
          <Box title="ON SITE" className="h-[61mm]">
            <Checks items={onSite} tight />
          </Box>
        </div>

        <div className="mt-[2.5mm] grid grid-cols-[1.45fr_1fr] gap-[2mm]">
          <Box title="KEY PROCEDURES" className="h-[68mm]">
            <ul className="list-disc space-y-[1.45mm] pl-[4.5mm] pt-[1mm] text-[9.8px] leading-tight">
              {procedures.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </Box>
          <Box title="EMERGENCY INFORMATION" className="h-[68mm]">
            <div className="space-y-[3.5mm] pt-[1mm]">
              <Emergency icon="phone" color="#ef3d35" title="Emergency (Fire / Police / Ambulance)" value="111" bold />
              <Emergency icon="assembly" color="#159157" title="Site Assembly Point" />
              <Emergency icon="firstaid" color="#159157" title="First Aid Location" />
              <Emergency icon="hospital" color="#ef3d35" title="Nearest Medical Centre" />
            </div>
          </Box>
        </div>

        <div className="mt-[2.5mm] grid grid-cols-[1fr_1fr] gap-[2mm]">
          <Box title="CUSTOMER SITE SPECIFIC NOTES" className="h-[48mm]" />
          <Box title="ADDITIONAL INFORMATION" className="h-[48mm]">
            <div className="px-[1mm] pt-[1mm]">
              {rows(6).map((_, i) => <div key={i} className="h-[7mm] border-b border-[#b8c8c3]" />)}
            </div>
          </Box>
        </div>
      </Sheet>
    </div>
  )
}

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="sheet box-border mx-auto my-6 h-[297mm] w-[210mm] overflow-hidden bg-white px-[10mm] py-[6mm] text-[10.2px] leading-[1.32] shadow-2xl">
      {children}
    </div>
  )
}

function JobHeader({
  number,
  customer,
  site,
  title,
  issued,
  due,
  contact,
  phone,
  qrUrl,
}: {
  number: string
  customer: string
  site: string
  title: string
  issued: string
  due: string
  contact: string
  phone: string
  qrUrl: string
}) {
  return (
    <div className="grid h-[43mm] grid-cols-[25mm_1fr_28mm] gap-[3mm] border border-[#c2cbc8] bg-[#f3f5f4] px-[3mm] py-[2.5mm]">
      <div className="flex items-center justify-center bg-white">
        <img src="/R-2025.svg" alt="Rodier" className="h-[20mm] w-[20mm] object-contain" />
      </div>

      <div className="grid grid-cols-[1.2fr_.9fr] gap-x-[5mm] gap-y-[2.1mm] self-center text-[12px] leading-[1.18]">
        <div className="col-span-2 grid grid-cols-[22mm_1fr] gap-[2mm]">
          <span className="font-bold">Customer:</span>
          <span className="font-bold">{customer}</span>
        </div>
        <div className="col-span-2 grid grid-cols-[22mm_1fr] gap-[2mm]">
          <span className="font-bold">Site:</span>
          <span>{site}</span>
        </div>
        <div className="col-span-2 grid grid-cols-[22mm_1fr] gap-[2mm]">
          <span className="font-bold">Job Title:</span>
          <span className="font-bold">{title}</span>
        </div>
        <div className="grid grid-cols-[22mm_1fr] gap-[2mm]">
          <span className="font-bold">Date Issued:</span>
          <span>{issued}</span>
        </div>
        <div className="grid grid-cols-[23mm_1fr] gap-[2mm]">
          <span className="font-bold">Required By:</span>
          <span>{due}</span>
        </div>
        <div className="grid grid-cols-[22mm_1fr] gap-[2mm]">
          <span className="font-bold">Contact:</span>
          <span>{contact}</span>
        </div>
        <div className="grid grid-cols-[23mm_1fr] gap-[2mm]">
          <span className="font-bold">Phone:</span>
          <span>{phone}</span>
        </div>
      </div>

      <div className="flex flex-col items-center justify-between bg-white py-[1.5mm]">
        <div className="w-[25mm] rounded-[1.2mm] border border-[#9baaaa] bg-[#f2f5f4] px-[1.2mm] py-[1mm] text-center">
          <div className="text-[7.5px] leading-none">Job No / Invoice No</div>
          <div className="mt-[.5mm] text-[19px] font-black leading-none">{number}</div>
        </div>
        {qrUrl ? <img src={qrUrl} alt="RPM job QR code" className="h-[18mm] w-[18mm]" /> : <div className="h-[18mm] w-[18mm] border border-black" />}
        <div className="text-center text-[7px] leading-none">Scan to view in RPM</div>
      </div>
    </div>
  )
}

function ProductionHeader({ number, title, customer, buildSummary, requiredBy }: { number: string; title: string; customer: string; buildSummary: string; requiredBy: string }) {
  return (
    <div className="flex items-start justify-between border-b border-[#b9c5c1] pb-[3mm]">
      <div className="flex items-start gap-[4mm]">
        <img src="/R-2025.svg" alt="Rodier" className="h-[20mm] w-[20mm] object-contain" />
        <div>
          <div className="text-[19px] font-black">PRODUCTION / BOM</div>
          <div className="mt-[1mm] text-[12px] font-bold">{title}</div>
          <div className="mt-[.5mm] text-[9.5px]">{customer}</div>
          {buildSummary && <div className="mt-[1mm] text-[10px]"><strong>Build qty:</strong> {buildSummary}</div>}
        </div>
      </div>
      <div className="text-right text-[10px]">
        <div><strong>Job:</strong> {number}</div>
        <div className="mt-[1mm]"><strong>Required by:</strong> {requiredBy || "—"}</div>
      </div>
    </div>
  )
}

function Header({ safety = false }: { number?: string; safety?: boolean }) {
  return (
    <div className="flex h-[25mm] items-start justify-between">
      <img src="/R-2025.svg" alt="Rodier" className="h-[20mm] w-[20mm] object-contain object-left" />
      {safety && (
        <div className="mt-[1mm] min-w-[58mm] rounded-[1.5mm] border border-[#9baaaa] bg-[#f2f5f4] px-[5mm] py-[2.5mm] text-center">
          <div className="text-[20px] font-black tracking-tight">JOB CARD</div>
          <div className="mt-[1mm] text-[10.5px] font-bold">SAFETY &amp; PROCESSES</div>
        </div>
      )}
    </div>
  )
}

function Bar({ children, noTop = false }: { children: React.ReactNode; noTop?: boolean }) {
  return (
    <div className={`${noTop ? "" : "mt-[2.5mm]"} h-[6mm] px-[2.5mm] py-[1mm] text-[10.7px] font-black text-white`} style={{ background: GREEN }}>
      {children}
    </div>
  )
}

function Box({
  title,
  suffix,
  children,
  className = "",
}: {
  title: string
  suffix?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={`box-border overflow-hidden border border-[#b9c5c1] bg-white ${className}`}>
      <div className="flex h-[6mm] items-center px-[2.5mm] text-[10.7px] text-white" style={{ background: GREEN }}>
        <span className="font-black">{title}</span>{suffix && <span className="ml-[1.2mm] font-normal">{suffix}</span>}
      </div>
      <div className="box-border p-[2mm]">{children}</div>
    </div>
  )
}

function SignLine({ label }: { label: string }) {
  return <div className="flex items-end gap-[2mm]"><span className="w-[13mm]">{label}:</span><span className="flex-1 border-b border-neutral-700" /></div>
}

function CheckBox({ checked = false }: { checked?: boolean }) {
  return (
    <i className={`inline-grid h-[4mm] w-[4mm] shrink-0 place-items-center border text-[9px] not-italic leading-none ${checked ? "border-[#155f4c] bg-[#155f4c] font-black text-white" : "border-neutral-500 bg-white"}`}>
      {checked ? "✓" : ""}
    </i>
  )
}

function Checks({ items, tight = false }: { items: string[]; tight?: boolean }) {
  return (
    <div className={tight ? "space-y-[1.25mm]" : "space-y-[1.8mm]"}>
      {items.map((x) => (
        <div key={x} className="flex items-start gap-[2mm]">
          <CheckBox />
          <span className={tight ? "text-[9.7px] leading-[1.06]" : "text-[10px] leading-tight"}>{x}</span>
        </div>
      ))}
    </div>
  )
}

function JobGrid() {
  const headers = ["Date", "Employee Name", "Department", "Start Time", "Finish Time", "Break (hrs)", "Hours", "Notes"]
  const widths = ["8%", "19%", "14%", "10%", "10%", "10%", "9%", "20%"]
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <thead><tr className="bg-[#eef2f1]">{headers.map((h) => <th key={h} className="h-[5.5mm] border border-[#b9c5c1] px-[1mm] text-center text-[9px] font-bold">{h}</th>)}</tr></thead>
      <tbody>{rows(7).map((_, r) => <tr key={r}>{headers.map((h) => <td key={h} className="h-[5.8mm] border border-[#b9c5c1]" />)}</tr>)}</tbody>
    </table>
  )
}

function MaterialsGrid() {
  const headers = ["Date", "Item / Description", "Qty", "Unit", "Notes"]
  const widths = ["9%", "44%", "9%", "9%", "29%"]
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <thead><tr className="bg-[#eef2f1]">{headers.map((h) => <th key={h} className="h-[5.5mm] border border-[#b9c5c1] px-[1mm] text-center text-[9px] font-bold">{h}</th>)}</tr></thead>
      <tbody>{rows(5).map((_, r) => <tr key={r}>{headers.map((h) => <td key={h} className="h-[6.5mm] border border-[#b9c5c1]" />)}</tr>)}</tbody>
    </table>
  )
}

function BomTable({ lines, itemNames }: { lines: BomLine[]; itemNames: Map<string, string> }) {
  const visible = lines.filter((line) => line.description?.trim() && Number(line.qty || 0) !== 0)
  const headers = ["Item", "Section", "Description", "Qty", "Unit", "Notes"]
  const widths = ["15%", "17%", "36%", "8%", "8%", "16%"]
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <thead>
        <tr className="bg-[#eef2f1]">
          {headers.map((h) => <th key={h} className="h-[6mm] border border-[#b9c5c1] px-[1mm] text-left text-[8.7px] font-bold">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {visible.length ? visible.map((line) => {
          const meta = materialMeta(line)
          const unit = meta?.unit || (/labour/i.test(line.section || "") ? "hr" : "")
          const section = [line.section, line.subsection].filter(Boolean).join(" / ")
          return (
            <tr key={line.id}>
              <td className="border border-[#b9c5c1] px-[1mm] py-[1mm] align-top text-[8.7px]">{line.item_id ? itemNames.get(line.item_id) || "" : ""}</td>
              <td className="border border-[#b9c5c1] px-[1mm] py-[1mm] align-top text-[8.7px]">{section}</td>
              <td className="border border-[#b9c5c1] px-[1mm] py-[1mm] align-top text-[8.7px] font-medium">{line.description}</td>
              <td className="border border-[#b9c5c1] px-[1mm] py-[1mm] text-right align-top text-[8.7px]">{prettyQty(line.qty)}</td>
              <td className="border border-[#b9c5c1] px-[1mm] py-[1mm] align-top text-[8.7px]">{unit}</td>
              <td className="border border-[#b9c5c1] px-[1mm] py-[1mm] align-top text-[8.2px]">{line.internal_note || ""}</td>
            </tr>
          )
        }) : (
          <tr><td colSpan={6} className="border border-[#b9c5c1] px-[2mm] py-[4mm] text-center text-[9px] text-neutral-500">No BOM lines are recorded for this job.</td></tr>
        )}
      </tbody>
    </table>
  )
}

function Emergency({ icon, color, title, value, bold = false }: { icon: "phone" | "assembly" | "firstaid" | "hospital"; color: string; title: string; value?: string; bold?: boolean }) {
  const iconClass = "h-[7mm] w-[7mm] text-white"
  return (
    <div className="grid grid-cols-[14mm_1fr] items-center gap-[3mm]">
      <div className="grid h-[11mm] w-[11mm] place-items-center rounded-full" style={{ background: color }}>
        {icon === "phone" && <Phone className={iconClass} fill="white" />}
        {icon === "assembly" && <MapPin className={iconClass} />}
        {icon === "firstaid" && <Cross className={iconClass} strokeWidth={3} />}
        {icon === "hospital" && <Hospital className={iconClass} />}
      </div>
      <div>
        <div className="text-[9px]">{title}</div>
        {value ? <div className={bold ? "text-[18px] font-black leading-none" : "text-[11px] font-bold"}>{value}</div> : <div className="mt-[3mm] border-b border-neutral-500" />}
      </div>
    </div>
  )
}
