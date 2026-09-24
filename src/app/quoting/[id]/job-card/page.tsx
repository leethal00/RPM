"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
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
import { paginateJobCard, type JobCardPagePlan } from "@/lib/job-card-pagination"
import type { CostingJob } from "@/types/database"

const GREEN = "#155f4c"
const DEPARTMENTS = ["Main", "CNC", "Metal", "Fab", "Electrical", "Vinyl", "Install"]
const SECTION_HEADING_CODE = "__RPM_SECTION_HEADING__"
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
  sign_code: string | null
  mode: string
  qty: number | null
  build_qty: number | null
  size: string | null
  details: string | null
  delivery: string | null
  internal_notes: string | null
  sort: number | null
  image_path: string | null
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

type MaterialEntry = { key: string; line: BomLine | null }

function materialMeta(line: BomLine) {
  return Array.isArray(line.materials) ? line.materials[0] : line.materials
}

function prettyQty(value: number | null | undefined) {
  const n = Number(value || 0)
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
}

function deliveryLabel(value?: string | null) {
  if (!value) return ""
  if (value.toLowerCase() === "ex-factory") return "Ex-factory"
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function inferDepartments(title: string, details: string, lines: BomLine[]) {
  const result = new Set<string>()

  // Department names in the BOM section/subsection are the strongest signal.
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

  // Descriptions are only a fallback. Strip obvious exclusions so text such as
  // "no allowance for vinyl work" does not incorrectly route the job to Vinyl.
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

  // Do not infer Fab from generic words like "folded" or "fabricated" in a
  // customer description; Fab should come from the BOM routing itself.
  return Array.from(result)
}

export default function JobCardPage() {
  const supabase = useMemo(() => createClient(), [])
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const itemId = searchParams.get("item")
  const [job, setJob] = useState<CostingJob | null>(null)
  const [items, setItems] = useState<JobItem[]>([])
  const [bomLines, setBomLines] = useState<BomLine[]>([])
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([])
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
          .select("id,name,sign_code,mode,qty,build_qty,size,details,delivery,internal_notes,sort,image_path")
          .eq("job_id", id)
          .order("sort"),
        supabase
          .from("costing_lines")
          .select("id,item_id,section,subsection,description,qty,internal_note,sort,materials(unit,is_labour)")
          .eq("job_id", id)
          .order("sort"),
      ])
      if (live) {
        const nextJob = jobData as CostingJob & { production_title?: string | null; production_details?: string | null }
        const nextLines = (lineData || []) as BomLine[]
        setJob(nextJob)
        setItems((itemData || []) as JobItem[])
        setBomLines(nextLines)
        const departmentLines = itemId ? nextLines.filter((line) => line.item_id === itemId) : nextLines
        const selectedItem = ((itemData || []) as JobItem[]).find((item) => item.id === itemId)
        setSelectedDepartments(inferDepartments(selectedItem?.name || nextJob.production_title || nextJob.title || "", selectedItem?.details ?? nextJob.production_details ?? nextJob.details ?? "", departmentLines))
        setLoading(false)
      }
    })()
    return () => { live = false }
  }, [supabase, id, itemId])

  useEffect(() => {
    if (!job) return
    const oldTitle = document.title
    const clientName = [job.clients?.name, job.stores?.name].filter(Boolean).join(" ") || "Ad-hoc"
    const baseJobNumber = (job.job_number || job.xero_invoice_number || "").replace(/^INV-/i, "")
    const buildItems = items.filter((item) => item.sign_code !== SECTION_HEADING_CODE && item.mode === "build")
    const activeBuildIndex = itemId ? buildItems.findIndex((item) => item.id === itemId) : -1
    const displayJobNumber = activeBuildIndex >= 0 && baseJobNumber ? `${baseJobNumber}-${activeBuildIndex + 1}` : baseJobNumber
    const activeBuildName = activeBuildIndex >= 0 ? buildItems[activeBuildIndex]?.name : null
    document.title = [displayJobNumber, activeBuildName || job.title].filter(Boolean).join(" - ")
    return () => { document.title = oldTitle }
  }, [job, items, itemId])

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
  const allQuoteItems = items.filter((item) => item.sign_code !== SECTION_HEADING_CODE)
  const activeItem = itemId ? allQuoteItems.find((item) => item.id === itemId) || null : null
  const drawingPath = activeItem?.image_path || (!itemId ? allQuoteItems.find((item) => item.image_path)?.image_path : null)
  const drawingUrl = drawingPath ? supabase.storage.from("job-attachments").getPublicUrl(drawingPath).data.publicUrl : null
  const buildItems = allQuoteItems.filter((item) => item.mode === "build")
  const activeBuildIndex = activeItem ? buildItems.findIndex((item) => item.id === activeItem.id) : -1
  const baseNumber = (job.job_number || job.xero_invoice_number || "").replace(/^INV-/i, "")
  const number = activeBuildIndex >= 0 && baseNumber ? `${baseNumber}-${activeBuildIndex + 1}` : baseNumber
  const contact = j.production_contact_name || j.quote_contact || job.contact_name || j.stores?.manager_name || ""
  const phone = j.stores?.manager_phone || ""
  const requiredBy = j.completion_date || j.due_date || null
  const quoteItems = activeItem ? [activeItem] : allQuoteItems
  const internalBomNotes = quoteItems.filter((item) => item.mode === "build" && item.internal_notes?.trim())
  const materialRows = bomLines.filter((line) => {
    if (activeItem && line.item_id !== activeItem.id) return false
    const meta = materialMeta(line)
    if (!line.description?.trim()) return false
    if (meta?.is_labour || /labou?r/i.test(line.section || "")) return false
    if (/\bargon\b/i.test(line.description)) return false
    if (/\bfreight\b/i.test(line.description)) return false
    if (/misc\s*-?\s*consumables?/i.test(line.description)) return false
    return Number(line.qty || 0) !== 0
  })
  const materialEntries: MaterialEntry[] = [
    ...materialRows.map((line) => ({ key: line.id, line })),
    ...rows(Math.max(0, 6 - materialRows.length)).map((_, index) => ({ key: `blank-${index}`, line: null })),
  ]

  const toggleDepartment = (department: string) => {
    setSelectedDepartments((current) => current.includes(department)
      ? current.filter((item) => item !== department)
      : [...current, department])
  }

  const qrUrl = typeof window !== "undefined"
    ? `https://quickchart.io/qr?size=180&margin=0&text=${encodeURIComponent(window.location.href)}`
    : ""

  const header = (
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
  )

  return (
    <div className="job-card-page min-h-screen bg-neutral-900/90 print:bg-white text-black">
      <style>{`
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body {
            width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .job-card-page { width: 210mm; min-height: 0; margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .job-card-measure { display: none !important; }
          .sheet, .sheet * { box-sizing: border-box; }
          .sheet {
            width: 210mm;
            height: 297mm;
            min-height: 0;
            margin: 0 !important;
            padding: 6mm 10mm;
            box-shadow: none !important;
            break-inside: avoid;
            page-break-inside: avoid;
            break-after: page;
            page-break-after: always;
          }
          .sheet:last-child { break-after: auto; page-break-after: auto; }
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
      <PaginatedJobCard number={number} materialEntries={materialEntries} intro={<>
        {header}

        <Bar>DEPARTMENTS <span className="font-normal">(auto-selected from BOM — adjust if needed)</span></Bar>
        <div className="flex h-[9mm] items-center justify-between border border-t-0 border-[#b9c5c1] px-[2.5mm]">
          {DEPARTMENTS.map((d) => (
            <button type="button" key={d} onClick={() => toggleDepartment(d)} className="inline-flex items-center gap-[2mm] whitespace-nowrap text-[11.6px]">
              <CheckBox checked={selectedDepartments.includes(d)} />{d}
            </button>
          ))}
        </div>

        <div className="mt-[2mm] grid grid-cols-[1.08fr_.92fr] items-stretch gap-[2mm]">
          <Box title="JOB DETAILS / SCOPE OF WORK" className="min-h-[60mm]">
            <div className="space-y-[2.5mm]">
              {quoteItems.length ? quoteItems.map((item) => (
                <div key={item.id} className="space-y-[.8mm] text-[12px]">
                  {item.mode === "build" && item.name?.trim() && <div className="break-words font-bold">{item.name}</div>}
                  <div><strong>Qty:</strong> {prettyQty(item.build_qty ?? item.qty ?? 1)}</div>
                  {item.size && <div><strong>Size:</strong> {item.size}</div>}
                  {item.details && <div className="whitespace-pre-wrap">{item.details}</div>}
                  {item.delivery && <div>{deliveryLabel(item.delivery)}</div>}
                </div>
              )) : (
                <div className="whitespace-pre-wrap text-[12px]">{details || title}</div>
              )}
            </div>
          </Box>
          <Box title="DRAWING / SKETCH" className="min-h-[60mm]">
            <div className="flex h-[48mm] items-center justify-center overflow-hidden border border-[#d5dfdc] text-center text-[10.5px] text-neutral-400">
              {drawingUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={drawingUrl} alt={`Drawing of ${activeItem?.name || "product"}`} className="h-full w-full object-contain" />
              ) : "Sketch here or attach manufacture drawings"}
            </div>
          </Box>
        </div>

      </>} timeLog={<>
        <Bar>TIME LOG</Bar>
        <JobGrid />
        <div className="flex h-[8mm] items-center justify-end gap-[2.5mm] pr-[38mm] text-[11.8px] font-bold">
          <span>Total Hours:</span><span className="h-[7mm] w-[17mm] border border-[#7b9e92] bg-white" />
        </div>
      </>} closeout={<>
        <div className="mt-[2.5mm] grid grid-cols-[1.35fr_.86fr_.9fr] items-start gap-[2mm]">
          <Box title="ADDITIONAL NOTES / ISSUES" className="min-h-[44mm]">
            <div className="space-y-[1.5mm] break-words text-[11.5px]">
              {internalBomNotes.map((item) => (
                <div key={item.id} className="whitespace-pre-wrap">{item.internal_notes?.trim()}</div>
              ))}
            </div>
          </Box>
          <Box title="JOB STATUS (tick)" className="h-[38mm]">
            <Checks items={["Cutting complete", "Fabrication complete", "Electrical complete", "Powder coat complete", "Ready for install", "Job complete"]} tight />
          </Box>
          <Box title="SIGN OFF" className="h-[38mm]">
            <div className="space-y-[4mm] pt-[.5mm] text-[11.5px]">
              <SignLine label="Name" />
              <SignLine label="Signature" />
              <div className="flex items-end gap-[2mm]"><span className="w-[13mm]">Date:</span><span className="flex-1 border-b border-neutral-700" /></div>
            </div>
          </Box>
        </div>
      </>} />

      <Sheet className="safety-sheet">
        {header}

        <div className="mt-[3mm] text-center">
          <div className="text-[22px] font-black tracking-tight" style={{ color: GREEN }}>SAFETY INFORMATION</div>
          <div className="text-[12px] font-bold" style={{ color: GREEN }}>OUR SAFETY COMMITMENT</div>
          <p className="mx-auto mt-[2.5mm] max-w-[165mm] text-[11.4px] leading-[1.42]">
            At Rodier we value the health and safety of our people, our clients and the public. We all share responsibility for a safe workplace and must work in a way that prevents harm.
          </p>
          <div className="mt-[2.5mm] text-[12.6px] font-black tracking-[.03em]" style={{ color: GREEN }}>
            THINK SAFE&nbsp;&nbsp;|&nbsp;&nbsp;WORK SAFE&nbsp;&nbsp;|&nbsp;&nbsp;HOME SAFE
          </div>
        </div>

        <div className="mt-[4mm] grid grid-cols-2 gap-[2mm]">
          <Box title="REQUIRED PPE" suffix="(as applicable)" className="h-[62mm]">
            <div className="grid grid-cols-4 gap-x-[2mm] gap-y-[4mm] pt-[2mm]">
              {ppe.map(({ label, Icon }) => (
                <div key={label} className="flex flex-col items-center text-center">
                  <div className="grid h-[15mm] w-[15mm] place-items-center rounded-full bg-[#0871b7] text-white">
                    <Icon className="h-[9mm] w-[9mm]" strokeWidth={1.8} />
                  </div>
                  <div className="mt-[1.2mm] whitespace-pre-line text-[10.2px] font-medium leading-tight">{label}</div>
                </div>
              ))}
            </div>
          </Box>
          <Box title="BEFORE YOU START" className="h-[62mm]">
            <Checks items={beforeYouStart} tight />
          </Box>

          <Box title="ON SITE" className="h-[61mm]">
            <Checks items={onSite} tight />
          </Box>
          <Box title="KEY PROCEDURES" className="h-[61mm]">
            <ul className="list-disc space-y-[1.1mm] pl-[4.5mm] pt-[.5mm] text-[10.2px] leading-tight">
              {procedures.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </Box>
        </div>

        <div className="mt-[2mm]">
          <Box title="EMERGENCY INFORMATION" className="h-[47mm]">
            <div className="grid grid-cols-4 gap-[3mm] pt-[2mm]">
              <Emergency icon="phone" color="#ef3d35" title="Emergency (Fire / Police / Ambulance)" value="111" bold />
              <Emergency icon="assembly" color="#159157" title="Site Assembly Point" />
              <Emergency icon="firstaid" color="#159157" title="First Aid Location" />
              <Emergency icon="hospital" color="#ef3d35" title="Nearest Medical Centre" />
            </div>
          </Box>
        </div>

        <div className="mt-[2mm]">
          <Box title="NOTES" className="h-[39mm]">
            <div className="space-y-[5mm] pt-[1mm]">
              {rows(5).map((_, i) => <div key={i} className="border-b border-[#c7d1ce]" />)}
            </div>
          </Box>
        </div>
      </Sheet>
    </div>
  )
}

function PaginatedJobCard({
  number,
  materialEntries,
  intro,
  timeLog,
  closeout,
}: {
  number: string
  materialEntries: MaterialEntry[]
  intro: React.ReactNode
  timeLog: React.ReactNode
  closeout: React.ReactNode
}) {
  const measureRef = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<JobCardPagePlan[] | null>(null)

  useLayoutEffect(() => {
    const root = measureRef.current
    if (!root) return
    const sheet = root.querySelector<HTMLElement>(".sheet")
    const introSection = root.querySelector<HTMLElement>("[data-measure-intro]")
    const continuationSection = root.querySelector<HTMLElement>("[data-measure-continuation]")
    const materialsSection = root.querySelector<HTMLElement>("[data-measure-materials]")
    const timeSection = root.querySelector<HTMLElement>("[data-measure-time]")
    const closeoutSection = root.querySelector<HTMLElement>("[data-measure-closeout]")
    const firstRow = materialsSection?.querySelector<HTMLElement>("[data-material-row]")
    if (!sheet || !introSection || !continuationSection || !materialsSection || !timeSection || !closeoutSection || !firstRow) return

    let active = true
    const measure = () => {
      if (!active) return
      const sheetHeight = sheet.getBoundingClientRect().height
      if (sheetHeight === 0) {
        // Environments without layout measurements (for example JSDOM) can
        // still render the complete card content.
        setPages([{ materialIndexes: materialEntries.map((_, index) => index), showTimeLog: true, showCloseout: true }])
        return
      }
      const sheetStyle = getComputedStyle(sheet)
      // Leave space for the printed continuation cue and a small rounding allowance.
      const availableHeight = sheetHeight
        - parseFloat(sheetStyle.paddingTop) - parseFloat(sheetStyle.paddingBottom)
        - 10 * 96 / 25.4
      setPages(paginateJobCard({
        availableHeight,
        introHeight: introSection.getBoundingClientRect().height,
        continuationHeight: continuationSection.getBoundingClientRect().height,
        materialsHeadingHeight: firstRow.getBoundingClientRect().top - materialsSection.getBoundingClientRect().top,
        materialRowHeights: Array.from(materialsSection.querySelectorAll<HTMLElement>("[data-material-row]"), (row) => row.getBoundingClientRect().height),
        timeLogHeight: timeSection.getBoundingClientRect().height,
        closeoutHeight: closeoutSection.getBoundingClientRect().height,
      }))
    }

    measure()
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    ;[introSection, continuationSection, materialsSection, timeSection, closeoutSection].forEach((section) => observer?.observe(section))
    document.fonts?.ready.then(measure)
    window.addEventListener("resize", measure)
    return () => { active = false; observer?.disconnect(); window.removeEventListener("resize", measure) }
  }, [intro, materialEntries, number, timeLog, closeout])

  return <>
    <div ref={measureRef} className="job-card-measure pointer-events-none invisible absolute -left-[10000px] top-0" aria-hidden="true">
      <Sheet>
        <div data-measure-intro className="flow-root">{intro}</div>
        <div data-measure-continuation className="flow-root"><ContinuationHeader number={number} /></div>
        <section data-measure-materials className="flow-root"><Bar>MATERIALS / PARTS USED</Bar><MaterialsGrid entries={materialEntries} /></section>
        <section data-measure-time className="flow-root">{timeLog}</section>
        <section data-measure-closeout className="flow-root">{closeout}</section>
      </Sheet>
    </div>
    {pages?.map((page, index) => <Sheet key={index} className="job-card-sheet">
      {index === 0 ? <div className="flow-root">{intro}</div> : <ContinuationHeader number={number} />}
      {page.materialIndexes.length > 0 && <section className="flow-root">
        <Bar>MATERIALS / PARTS USED{index > 0 ? " (continued)" : ""}</Bar>
        <MaterialsGrid entries={page.materialIndexes.map((rowIndex) => materialEntries[rowIndex]).filter((entry): entry is MaterialEntry => !!entry)} />
      </section>}
      {page.showTimeLog && <section className="flow-root">{timeLog}</section>}
      {page.showCloseout && <section className="flow-root">{closeout}</section>}
      <div className="absolute bottom-[4mm] right-[10mm] text-[10px] font-bold tracking-wide" style={{ color: GREEN }}>
        {index < pages.length - 1 ? "Continued on next page →" : "Safety information on next page →"}
      </div>
    </Sheet>)}
  </>
}

function ContinuationHeader({ number }: { number: string }) {
  return <div className="flex h-[12mm] items-center justify-between border-b-2 border-[#155f4c] text-[14px] font-black" style={{ color: GREEN }}>
    <span>JOB CARD — CONTINUED</span><span className="text-[12px]">Job No. {number}</span>
  </div>
}

function Sheet({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`sheet relative box-border mx-auto my-6 h-[297mm] w-[210mm] bg-white px-[10mm] py-[6mm] text-[11.8px] leading-[1.28] shadow-2xl ${className}`}>
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
    <div className="grid min-h-[31mm] grid-cols-[23mm_1fr_22mm_29mm] items-stretch gap-[2.5mm] border border-[#c2cbc8] bg-[#f3f5f4] px-[2.5mm] py-[2mm]">
      <div className="flex items-center justify-center bg-white">
        <img src="/R-2025.svg" alt="Rodier" className="h-[20mm] w-[20mm] object-contain" />
      </div>

      <div className="grid grid-cols-[1fr_1fr] content-start gap-x-[4mm] gap-y-[1.15mm] pt-[.5mm] text-[11px] leading-[1.1]">
        <div className="col-span-2 flex gap-[1.8mm]"><span className="font-bold">Client:</span><span className="font-bold">{customer}</span></div>
        <div className="flex gap-[1.8mm]"><span className="font-bold">Contact:</span><span>{contact}</span></div>
        <div className="flex gap-[1.8mm]"><span className="font-bold">Phone:</span><span>{phone}</span></div>
        <div className="col-span-2 flex gap-[1.8mm]"><span className="font-bold">Site:</span><span>{site}</span></div>
        <div className="col-span-2 flex gap-[1.8mm]"><span className="font-bold">Job Title:</span><span className="font-bold">{title}</span></div>
        <div className="flex gap-[1.8mm]"><span className="font-bold">Date Issued:</span><span>{issued}</span></div>
        <div className="flex gap-[1.8mm]"><span className="font-bold">Required By:</span><span>{due}</span></div>
      </div>

      <div className="flex flex-col items-center justify-center bg-white">
        {qrUrl ? <img src={qrUrl} alt="RPM job QR code" className="h-[18mm] w-[18mm]" /> : <div className="h-[18mm] w-[18mm] border border-black" />}
        <div className="mt-[.8mm] text-center text-[7.4px] leading-none">Scan to view in RPM</div>
      </div>

      <div className="flex flex-col items-center justify-center border-l border-[#c2cbc8] bg-white px-[1mm]">
        <div className="text-[8.5px] font-bold leading-none">Job No.</div>
        <div
          className="mt-[1mm] font-black leading-none tracking-tight whitespace-nowrap"
          style={{ color: GREEN, fontSize: number.length <= 4 ? "36px" : number.length <= 6 ? "30px" : "25px" }}
        >
          {number}
        </div>
      </div>
    </div>
  )
}

function Bar({ children, noTop = false }: { children: React.ReactNode; noTop?: boolean }) {
  return (
    <div className={`${noTop ? "" : "mt-[2.1mm]"} h-[6mm] px-[2.5mm] py-[.7mm] text-[12px] font-black text-white`} style={{ background: GREEN }}>
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
    <div className={`box-border border border-[#b9c5c1] bg-white ${className}`}>
      <div className="flex h-[6mm] items-center px-[2.5mm] text-[12px] text-white" style={{ background: GREEN }}>
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
    <div className={tight ? "space-y-[.8mm]" : "space-y-[1.5mm]"}>
      {items.map((x) => (
        <div key={x} className="flex items-start gap-[2mm]">
          <CheckBox />
          <span className={tight ? "text-[10.6px] leading-[1.02]" : "text-[11.2px] leading-tight"}>{x}</span>
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
      <thead><tr className="bg-[#eef2f1]">{headers.map((h) => <th key={h} className="h-[5.2mm] border border-[#b9c5c1] px-[1mm] text-center text-[10.3px] font-bold">{h}</th>)}</tr></thead>
      <tbody>{rows(8).map((_, r) => <tr key={r}>{headers.map((h) => <td key={h} className="h-[5.2mm] border border-[#b9c5c1]" />)}</tr>)}</tbody>
    </table>
  )
}

function MaterialsGrid({ entries }: { entries: MaterialEntry[] }) {
  const headers = ["Date", "Item / Description", "Qty", "Unit", "Notes"]
  const widths = ["9%", "44%", "9%", "9%", "29%"]
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <thead><tr className="bg-[#eef2f1]">{headers.map((h) => <th key={h} className="h-[5.2mm] border border-[#b9c5c1] px-[1mm] text-center text-[10.3px] font-bold">{h}</th>)}</tr></thead>
      <tbody>
        {entries.map(({ key, line }) => (
          <tr key={key} data-material-row>
            <td className="h-[5.8mm] border border-[#b9c5c1]" />
            <td className="h-[5.8mm] break-words border border-[#b9c5c1] px-[1.5mm] text-[10.5px]">{line?.description || ""}</td>
            <td className="h-[5.8mm] border border-[#b9c5c1]" />
            <td className="h-[5.8mm] border border-[#b9c5c1] px-[1mm] text-center text-[10.5px]">{line ? materialMeta(line)?.unit || "" : ""}</td>
            <td className="h-[5.8mm] border border-[#b9c5c1]" />
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Emergency({ icon, color, title, value, bold = false }: { icon: "phone" | "assembly" | "firstaid" | "hospital"; color: string; title: string; value?: string; bold?: boolean }) {
  const iconClass = "h-[7mm] w-[7mm] text-white"
  return (
    <div className="flex flex-col items-center text-center">
      <div className="grid h-[11mm] w-[11mm] place-items-center rounded-full" style={{ background: color }}>
        {icon === "phone" && <Phone className={iconClass} fill="white" />}
        {icon === "assembly" && <MapPin className={iconClass} />}
        {icon === "firstaid" && <Cross className={iconClass} strokeWidth={3} />}
        {icon === "hospital" && <Hospital className={iconClass} />}
      </div>
      <div className="mt-[1.5mm] text-[9.2px] leading-tight">{title}</div>
      {value ? <div className={bold ? "mt-[1mm] text-[18px] font-black leading-none" : "text-[11.5px] font-bold"}>{value}</div> : <div className="mt-[4mm] w-[28mm] border-b border-neutral-500" />}
    </div>
  )
}

