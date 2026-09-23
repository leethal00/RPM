"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Printer } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

const GREEN = "#155f4c"
const SECTION_HEADING_CODE = "__RPM_SECTION_HEADING__"

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
  clients?: { name?: string | null } | null
  stores?: { name?: string | null; address?: string | null } | null
}

function prettyQty(value: number | null | undefined) {
  const n = Number(value || 0)
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
}

function itemQty(item: Item) {
  return item.mode === "build" ? (item.build_qty ?? item.qty ?? 1) : (item.qty ?? 1)
}

export default function JobSummaryPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = useMemo(() => createClient(), [])
  const [job, setJob] = useState<Job | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const [{ data: jobData }, { data: itemData }] = await Promise.all([
        supabase.from("costing_jobs").select("id,title,job_number,xero_invoice_number,created_at,clients(name),stores(name,address)").eq("id", id).single(),
        supabase.from("costing_items").select("id,name,sign_code,mode,qty,build_qty,size,details,delivery,sort").eq("job_id", id).order("sort"),
      ])
      setJob(jobData as Job)
      setItems(((itemData || []) as Item[]).filter((item) => item.sign_code !== SECTION_HEADING_CODE))
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
  const client = [job.clients?.name, job.stores?.name].filter(Boolean).join(" · ")
  const buildItems = items.filter((item) => item.mode === "build")

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
        <div className="grid grid-cols-[24mm_1fr_31mm] items-stretch gap-[3mm] border border-[#c2cbc8] bg-[#f3f5f4] p-[2.5mm]">
          <div className="flex items-center justify-center bg-white">
            <img src="/R-2025.svg" alt="Rodier" className="h-[20mm] w-[20mm] object-contain" />
          </div>
          <div>
            <div className="text-[15px] font-black" style={{ color: GREEN }}>JOB SUMMARY</div>
            <div className="mt-[1.5mm]"><strong>Client:</strong> {client || "Ad-hoc / wholesale"}</div>
            <div><strong>Job:</strong> {job.title}</div>
            {job.stores?.address && <div><strong>Site:</strong> {job.stores.address}</div>}
          </div>
          <div className="flex flex-col items-center justify-center border-l border-[#c2cbc8] bg-white px-[1mm]">
            <div className="text-[8.5px] font-bold">Job No.</div>
            <div className="mt-[1mm] text-[34px] font-black leading-none tracking-tight" style={{ color: GREEN }}>{number}</div>
          </div>
        </div>

        <div className="mt-[4mm]">
          <div className="h-[7mm] px-[2.5mm] py-[1.2mm] text-[12px] font-black text-white" style={{ background: GREEN }}>PROJECT ITEMS</div>
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col style={{ width: "14%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "23%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "32%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead>
              <tr className="bg-[#eef2f1]">
                {["Workshop Ref", "Qty", "Item", "Size", "Description", "Type"].map((h) => <th key={h} className="border border-[#b9c5c1] px-[1.5mm] py-[1.5mm] text-left text-[10.5px]">{h}</th>)}
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
                  <td className="border border-[#b9c5c1] px-[1.5mm] py-[2mm]">{item.mode === "build" ? "BOM" : "Simple"}</td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={6} className="border border-[#b9c5c1] p-4 text-center text-neutral-500">No items on this job.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
