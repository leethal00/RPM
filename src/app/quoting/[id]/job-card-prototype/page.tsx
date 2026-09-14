"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Printer, RotateCcw } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { CostingItem, CostingJob, CostingLine } from "@/types/database"

const GREEN = "#155f4c"
const DEPARTMENTS = ["Main", "CNC", "Metal", "Fab", "Electrical", "Vinyl", "Install"] as const
type Department = (typeof DEPARTMENTS)[number]

type JobWithStore = CostingJob & {
  quote_contact?: string | null
  due_date?: string | null
  stores?: { name?: string | null; address?: string | null } | null
  clients?: { name?: string | null } | null
}

const fmt = (v?: string | null) => v
  ? new Date(`${v.slice(0, 10)}T00:00:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })
  : ""

function includesAny(text: string, words: string[]) {
  const t = text.toLowerCase()
  return words.some((w) => t.includes(w))
}

function inferLineDepartments(line: CostingLine): Department[] {
  const text = `${line.section} ${line.subsection || ""} ${line.description}`.toLowerCase()
  const result = new Set<Department>()

  if (line.section === "Wiring - LED" || includesAny(text, ["led", "module", "driver", "transformer", "power supply", "wiring", "electrical", "cable"])) result.add("Electrical")
  if (line.section === "Steel" || includesAny(text, ["steel", "rhs", "shs", "aluminium angle", "aluminium extrusion", "galvan", "weld", "fabricat", "powdercoat"])) {
    result.add("Metal")
    result.add("Fab")
  }
  if (includesAny(text, ["vinyl", "digital print", "print", "laminate", "graphic", "decal"])) result.add("Vinyl")
  if (includesAny(text, ["cnc", "router", "acm", "acrylic", "polycarbonate", "multiboard", "dibond", "cut letter"])) result.add("CNC")
  if (includesAny(text, ["install", "site labour", "site time", "site install"])) result.add("Install")
  if (includesAny(text, ["factory labour", "general labour", "assembly"])) result.add("Main")

  return [...result]
}

function inferItemDepartments(item: CostingItem, lines: CostingLine[]): Department[] {
  const result = new Set<Department>()
  const text = `${item.name} ${item.details || ""} ${item.delivery || ""}`.toLowerCase()

  lines.filter((l) => l.item_id === item.id).forEach((line) => inferLineDepartments(line).forEach((d) => result.add(d)))

  if (item.delivery === "install" || includesAny(text, ["install", "site install"])) result.add("Install")
  if (includesAny(text, ["vinyl", "graphic", "decal", "print"])) result.add("Vinyl")
  if (includesAny(text, ["illuminated", "led", "lightbox", "neon", "electrical"])) result.add("Electrical")
  if (includesAny(text, ["fabricated", "fabrication", "welded", "steel", "aluminium frame"])) result.add("Fab")
  if (includesAny(text, ["router", "cnc", "acrylic", "acm", "cut letter"])) result.add("CNC")

  if (result.size === 0) result.add("Main")
  return [...result]
}

function factorySafety(dept: Department) {
  const common = [
    "Wear required PPE for the task and machine.",
    "Inspect tools, leads, guards and work area before starting.",
    "Keep walkways and work areas clear and tidy.",
    "Stop and ask if the method, drawing or risk is unclear.",
  ]
  const specific: Record<Department, string[]> = {
    Main: ["Use correct manual handling technique and lifting assistance.", "Confirm job scope before assembly or packing."],
    CNC: ["Confirm guards/extraction are operating before cutting.", "Keep hands clear of moving tooling and secure material correctly."],
    Metal: ["Control sharp edges, swarf and hot material.", "Use correct lifting equipment for long or heavy sections."],
    Fab: ["Use welding screens/fume extraction and hot-work controls as required.", "Check fabricated parts are stable before grinding or welding."],
    Electrical: ["Isolate and prove dead before electrical work where applicable.", "Use correct rated components and test completed assemblies."],
    Vinyl: ["Use knives and heat tools safely; retract/store blades when not in use.", "Maintain ventilation when using cleaners, primers or adhesives."],
    Install: ["Complete site induction and identify public/traffic interfaces.", "Confirm EWP, height, lifting and electrical isolation controls before work."],
  }
  return [...common, ...specific[dept]]
}

export default function JobCardPrototypePage() {
  const supabase = useMemo(() => createClient(), [])
  const { id } = useParams<{ id: string }>()
  const [job, setJob] = useState<JobWithStore | null>(null)
  const [items, setItems] = useState<CostingItem[]>([])
  const [lines, setLines] = useState<CostingLine[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Record<Department, boolean>>(() => Object.fromEntries(DEPARTMENTS.map((d) => [d, false])) as Record<Department, boolean>)

  const itemDepartments = useMemo(() => {
    const map: Record<string, Department[]> = {}
    items.forEach((item) => { map[item.id] = inferItemDepartments(item, lines) })
    return map
  }, [items, lines])

  const detected = useMemo(() => {
    const set = new Set<Department>()
    Object.values(itemDepartments).flat().forEach((d) => set.add(d))
    if (set.size === 0) set.add("Main")
    return set
  }, [itemDepartments])

  useEffect(() => {
    let live = true
    ;(async () => {
      const [jobRes, itemRes, lineRes] = await Promise.all([
        supabase.from("costing_jobs").select(`*, clients ( name ), stores ( name, address )`).eq("id", id).single(),
        supabase.from("costing_items").select("*").eq("job_id", id).order("sort"),
        supabase.from("costing_lines").select("*").eq("job_id", id).order("sort"),
      ])
      if (!live) return
      setJob(jobRes.data as JobWithStore | null)
      setItems((itemRes.data || []) as CostingItem[])
      setLines((lineRes.data || []) as CostingLine[])
      setLoading(false)
    })()
    return () => { live = false }
  }, [supabase, id])

  useEffect(() => {
    if (loading) return
    setSelected(Object.fromEntries(DEPARTMENTS.map((d) => [d, detected.has(d)])) as Record<Department, boolean>)
  }, [loading, detected])

  if (loading) return <div className="p-10 text-sm text-muted-foreground">Loading department pack prototype...</div>
  if (!job) return <div className="p-10 text-sm text-muted-foreground">Job not found.</div>

  const chosen = DEPARTMENTS.filter((d) => selected[d])
  const customer = [job.clients?.name, job.stores?.name].filter(Boolean).join(" ") || "Ad-hoc / wholesale"
  const number = (job.job_number || job.xero_invoice_number || "").replace(/^INV-/i, "")

  function resetDepartments() {
    setSelected(Object.fromEntries(DEPARTMENTS.map((d) => [d, detected.has(d)])) as Record<Department, boolean>)
  }

  return (
    <div className="min-h-screen bg-neutral-200 text-black print:bg-white">
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .pack { break-after: page; page-break-after: always; }
          .pack:last-child { break-after: auto; page-break-after: auto; }
          .hs-page { break-before: page; page-break-before: always; }
          .keep { break-inside: avoid; page-break-inside: avoid; }
          .paper { margin: 0 !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-20 border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href={`/quoting/${id}/job-card`} className="inline-flex items-center gap-1.5 text-sm text-neutral-600">
            <ArrowLeft className="size-4" /> Back to current job card
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={resetDepartments} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm">
              <RotateCcw className="size-4" /> Reset suggestions
            </button>
            <button disabled={chosen.length === 0} onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-40">
              <Printer className="size-4" /> Print {chosen.length} department {chosen.length === 1 ? "pack" : "packs"}
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-4">
          <div className="rounded-lg border bg-neutral-50 p-3">
            <div className="mb-2 text-sm font-semibold">Departments for this job</div>
            <div className="flex flex-wrap gap-3">
              {DEPARTMENTS.map((dept) => (
                <label key={dept} className="flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm">
                  <input type="checkbox" checked={selected[dept]} onChange={(e) => setSelected((p) => ({ ...p, [dept]: e.target.checked }))} />
                  <span>{dept}</span>
                  {detected.has(dept) && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">AUTO</span>}
                </label>
              ))}
            </div>
            <div className="mt-2 text-xs text-neutral-500">AUTO is RPM's current suggestion from the line items and BOM. Tick or untick any department to override it for this print run.</div>
          </div>
        </div>
      </div>

      <div className="py-6 print:py-0">
        {chosen.length === 0 && <div className="no-print mx-auto max-w-3xl rounded-lg border bg-white p-8 text-center text-neutral-500">Select at least one department to preview its job pack.</div>}
        {chosen.map((dept) => (
          <DepartmentPack
            key={dept}
            dept={dept}
            job={job}
            number={number}
            customer={customer}
            items={items}
            lines={lines}
            itemDepartments={itemDepartments}
          />
        ))}
      </div>
    </div>
  )
}

function DepartmentPack({
  dept,
  job,
  number,
  customer,
  items,
  lines,
  itemDepartments,
}: {
  dept: Department
  job: JobWithStore
  number: string
  customer: string
  items: CostingItem[]
  lines: CostingLine[]
  itemDepartments: Record<string, Department[]>
}) {
  const relevant = dept === "Main" ? items : items.filter((item) => itemDepartments[item.id]?.includes(dept))

  return (
    <section className="pack">
      <div className="paper mx-auto mb-6 min-h-[297mm] w-[210mm] bg-white px-[10mm] py-[7mm] shadow-xl print:mb-0">
        <div className="grid grid-cols-[42mm_1fr_33mm] items-center gap-[4mm] border-b-2 pb-[4mm]" style={{ borderColor: GREEN }}>
          <img src="/R.jpg" alt="Rodier" className="h-[24mm] w-[40mm] object-contain" />
          <div>
            <div className="text-[20px] font-black tracking-tight">JOB {number}</div>
            <div className="text-[11px] font-bold" style={{ color: GREEN }}>{dept.toUpperCase()} COPY</div>
          </div>
          <div className="rounded border bg-neutral-50 px-[2mm] py-[2mm] text-center">
            <div className="text-[7px]">Department pack</div>
            <div className="text-[15px] font-black">{dept}</div>
          </div>
        </div>

        <div className="mt-[4mm] grid grid-cols-2 gap-x-[8mm] gap-y-[2mm] rounded border bg-neutral-50 p-[3mm] text-[8.5px]">
          <Field label="Customer" value={customer} />
          <Field label="Date Issued" value={fmt(job.created_at)} />
          <Field label="Site" value={job.stores?.address || ""} />
          <Field label="Required By" value={fmt(job.due_date)} />
          <Field label="Job Title" value={job.title} strong />
          <Field label="Contact" value={job.quote_contact || job.contact_name || ""} />
        </div>

        <SectionTitle>JOB SUMMARY / LINE ITEMS</SectionTitle>
        <div className="overflow-hidden border border-neutral-300">
          <div className="grid grid-cols-[8mm_13mm_1fr_31mm] bg-neutral-100 text-[7.5px] font-bold">
            <div className="border-r p-[1.5mm]">#</div><div className="border-r p-[1.5mm]">Qty</div><div className="border-r p-[1.5mm]">Item / Description</div><div className="p-[1.5mm]">Departments</div>
          </div>
          {items.length === 0 ? (
            <div className="p-[3mm] text-[8px] text-neutral-500">No structured line items have been added to this job yet.</div>
          ) : items.map((item, idx) => (
            <div key={item.id} className={`grid grid-cols-[8mm_13mm_1fr_31mm] border-t text-[8px] ${relevant.some((x) => x.id === item.id) ? "bg-white" : "bg-neutral-50 text-neutral-400"}`}>
              <div className="border-r p-[1.5mm]">{idx + 1}</div>
              <div className="border-r p-[1.5mm] text-center">{item.qty}</div>
              <div className="border-r p-[1.5mm]"><div className="font-semibold">{item.name}</div>{item.details && <div className="mt-[.5mm] text-[7.3px]">{item.details}</div>}</div>
              <div className="p-[1.5mm] text-[7px]">{(itemDepartments[item.id] || ["Main"]).join(", ")}</div>
            </div>
          ))}
        </div>

        <SectionTitle>{dept.toUpperCase()} - RELEVANT PRODUCTION ITEMS</SectionTitle>
        {relevant.length === 0 ? (
          <div className="rounded border border-dashed p-[5mm] text-[8px] text-neutral-500">This department was manually included, but RPM did not automatically route a specific line item to it.</div>
        ) : relevant.map((item) => {
          const bom = lines.filter((l) => l.item_id === item.id)
          return (
            <div key={item.id} className="keep mb-[3mm] rounded border border-neutral-300">
              <div className="flex items-start justify-between gap-[4mm] px-[3mm] py-[2mm] text-white" style={{ background: GREEN }}>
                <div><span className="font-bold">{item.name}</span>{item.size && <span className="ml-[2mm] text-[7.5px] opacity-90">{item.size}</span>}</div>
                <div className="text-[7px]">Qty {item.qty} · {item.mode === "build" ? "BOM" : "Simple item"}</div>
              </div>
              {item.details && <div className="border-b px-[3mm] py-[2mm] text-[8px]">{item.details}</div>}
              {bom.length > 0 ? (
                <table className="w-full table-fixed border-collapse text-[7.3px]">
                  <thead><tr className="bg-neutral-100"><th className="w-[24mm] border-r px-[2mm] py-[1.5mm] text-left">Section</th><th className="border-r px-[2mm] py-[1.5mm] text-left">BOM line</th><th className="w-[15mm] px-[2mm] py-[1.5mm] text-center">Qty</th></tr></thead>
                  <tbody>{bom.map((line) => <tr key={line.id} className="border-t"><td className="border-r px-[2mm] py-[1.5mm]">{line.subsection || line.section}</td><td className="border-r px-[2mm] py-[1.5mm]">{line.description}</td><td className="px-[2mm] py-[1.5mm] text-center">{line.qty}</td></tr>)}</tbody>
                </table>
              ) : <div className="px-[3mm] py-[2.5mm] text-[7.5px] text-neutral-500">No BOM attached - simple line item.</div>}
            </div>
          )
        })}

        <SectionTitle>DEPARTMENT H&S / PROCESS NOTES</SectionTitle>
        <div className="keep grid grid-cols-2 gap-[3mm] rounded border border-neutral-300 p-[3mm] text-[8px]">
          {factorySafety(dept).map((note) => <div key={note} className="flex gap-[2mm]"><span className="mt-[.3mm] inline-block h-[3.5mm] w-[3.5mm] shrink-0 border border-neutral-500" /><span>{note}</span></div>)}
        </div>

        <div className="mt-[5mm] grid grid-cols-2 gap-[3mm]">
          <div className="h-[28mm] border border-neutral-300"><div className="px-[2mm] py-[1.5mm] text-[8px] font-bold text-white" style={{ background: GREEN }}>DEPARTMENT NOTES</div></div>
          <div className="h-[28mm] border border-neutral-300"><div className="px-[2mm] py-[1.5mm] text-[8px] font-bold text-white" style={{ background: GREEN }}>SIGN OFF</div><div className="space-y-[4mm] p-[3mm] text-[8px]"><div>Name: __________________________</div><div>Date: ____ / ____ / ______</div></div></div>
        </div>
      </div>

      <div className="hs-page paper mx-auto min-h-[297mm] w-[210mm] bg-white px-[10mm] py-[7mm] shadow-xl">
        <div className="flex items-start justify-between border-b-2 pb-[4mm]" style={{ borderColor: GREEN }}>
          <img src="/R.jpg" alt="Rodier" className="h-[24mm] w-[90mm] object-contain object-left" />
          <div className="rounded border bg-neutral-50 px-[5mm] py-[2.5mm] text-center"><div className="text-[17px] font-black">JOB CARD</div><div className="text-[9px] font-bold">SAFETY &amp; PROCESSES</div></div>
        </div>
        <div className="mt-[5mm] grid grid-cols-2 gap-[3mm]">
          <SafetyBox title="OUR SAFETY COMMITMENT"><p>At Rodier we value the health and safety of our people, our clients and the public. We all share responsibility for a safe workplace and must work in a way that prevents harm.</p><div className="mt-[5mm] font-black" style={{ color: GREEN }}>THINK SAFE | WORK SAFE | HOME SAFE</div></SafetyBox>
          <SafetyBox title="BEFORE YOU START"><Checks items={["Read and understand the job scope", "Discuss risks with the team / supervisor", "Check required PPE", "Inspect tools and equipment", "Identify and isolate hazards", "Confirm permits / authorisations where required", "Take a moment - plan the job"]} /></SafetyBox>
          <SafetyBox title={`${dept.toUpperCase()} SAFETY FOCUS`}><Checks items={factorySafety(dept)} /></SafetyBox>
          <SafetyBox title="ON SITE / IN FACTORY"><Checks items={["Keep the work area clean and organised", "Use barriers / signage where required", "Keep others clear of the work area", "Follow site and factory rules", "Report incidents, near misses or hazards", "If unsure - stop and ask"]} /></SafetyBox>
        </div>
        <div className="mt-[3mm] grid grid-cols-[1.35fr_1fr] gap-[3mm]">
          <SafetyBox title="KEY PROCEDURES"><Checks items={["Use the correct tools and equipment for the task", "Follow machine guarding and isolation procedures", "Use lifting aids for heavy or awkward items", "Electrical work to be carried out by an appropriately qualified person", "Use extraction / ventilation where dust, fumes or solvents are present", "Report variations or unexpected hazards", "Complete job records accurately"]} /></SafetyBox>
          <SafetyBox title="EMERGENCY INFORMATION"><div className="text-[21px] font-black">111</div><div className="mb-[6mm] text-[8px]">Fire / Police / Ambulance</div><div className="space-y-[7mm]"><div>Assembly point: __________________</div><div>First aid: ________________________</div><div>Medical centre: ___________________</div></div></SafetyBox>
        </div>
        <div className="mt-[3mm] grid grid-cols-2 gap-[3mm]"><SafetyBox title="CUSTOMER / SITE SPECIFIC NOTES"><div className="h-[55mm]" /></SafetyBox><SafetyBox title="ADDITIONAL INFORMATION"><div className="h-[55mm]" /></SafetyBox></div>
      </div>
    </section>
  )
}

function Field({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="grid grid-cols-[22mm_1fr] gap-[2mm]"><span className="font-semibold">{label}:</span><span className={strong ? "font-bold" : ""}>{value}</span></div>
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="mt-[4mm] px-[2.5mm] py-[1.5mm] text-[9px] font-black text-white" style={{ background: GREEN }}>{children}</div>
}

function SafetyBox({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="keep min-h-[52mm] border border-neutral-300"><div className="px-[2.5mm] py-[1.5mm] text-[9px] font-black text-white" style={{ background: GREEN }}>{title}</div><div className="p-[3mm] text-[8.5px] leading-relaxed">{children}</div></div>
}

function Checks({ items }: { items: string[] }) {
  return <div className="space-y-[2mm]">{items.map((x) => <div key={x} className="flex items-start gap-[2mm]"><span className="mt-[.4mm] inline-block h-[3.5mm] w-[3.5mm] shrink-0 border border-neutral-500" /><span>{x}</span></div>)}</div>
}
