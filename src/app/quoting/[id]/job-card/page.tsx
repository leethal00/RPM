"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Printer } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { CostingJob } from "@/types/database"

const DEPARTMENTS = ["Main", "CNC", "Metal", "Fab", "Electrical", "Vinyl", "Install"]
const rows = (n: number) => Array.from({ length: n })
const fmt = (v?: string | null) => v ? new Date(`${v.slice(0,10)}T00:00:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : ""

export default function JobCardPage() {
  const supabase = useMemo(() => createClient(), [])
  const { id } = useParams<{ id: string }>()
  const [job, setJob] = useState<CostingJob | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data } = await supabase.from("costing_jobs").select(`*, clients ( name ), stores ( name, address )`).eq("id", id).single()
      if (live) { setJob(data as CostingJob); setLoading(false) }
    })()
    return () => { live = false }
  }, [supabase, id])

  if (loading) return <div className="p-10 text-sm text-muted-foreground">Loading job card…</div>
  if (!job) return <div className="p-10 text-sm text-muted-foreground">Job not found.</div>

  const j = job as CostingJob & { quote_contact?: string | null; due_date?: string | null; stores?: { name?: string | null; address?: string | null } | null }
  const customer = [job.clients?.name, j.stores?.name].filter(Boolean).join(" ") || "Ad-hoc / wholesale"
  const number = (job.job_number || job.xero_invoice_number || "").replace(/^INV-/i, "")

  return <div className="min-h-screen bg-neutral-100 print:bg-white text-black">
    <style>{`@page { size:A4; margin:0; } @media print { .no-print{display:none!important}.sheet{box-shadow:none!important;margin:0!important;page-break-after:always}.sheet:last-child{page-break-after:auto} }`}</style>
    <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-2.5">
      <Link href={`/quoting/jobs/${id}`} className="inline-flex items-center gap-1.5 text-sm text-neutral-600"><ArrowLeft className="size-4"/> Back to job</Link>
      <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white"><Printer className="size-4"/> Print / Save as PDF</button>
    </div>

    <Sheet>
      <Header number={number}/>
      <div className="grid grid-cols-[1fr_1fr_35mm] gap-3 bg-neutral-50 p-3">
        <div className="space-y-2"><Line label="Customer" value={customer}/><Line label="Site" value={j.stores?.address || ""}/><Line label="Job Title" value={job.title}/></div>
        <div className="space-y-2"><Line label="Date Issued" value={fmt(job.created_at)}/><Line label="Required By" value={fmt(j.due_date)}/><Line label="Contact" value={j.quote_contact || ""}/><Line label="Phone" value=""/></div>
        <div className="grid place-items-center border border-neutral-300 bg-white p-2 text-center text-[9px]"><div><div className="mx-auto mb-2 grid size-20 place-items-center border-4 border-black text-[9px] font-bold">RPM<br/>JOB<br/>{number}</div>Scan to view in RPM</div></div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2"><Box title="JOB DETAILS / SCOPE OF WORK" className="col-span-2 min-h-[35mm]">{job.details || job.title}</Box><Box title="SPECIAL INSTRUCTIONS" className="min-h-[35mm]"><ul className="list-disc pl-4 space-y-1"><li>Work safely and follow site induction requirements</li><li>Coordinate with site management</li><li>Take photos of completed work</li><li>Report any additional work required</li><li>Keep site clean and tidy</li></ul></Box></div>
      <Bar>DEPARTMENTS</Bar><div className="flex justify-between border border-t-0 border-neutral-300 px-3 py-2">{DEPARTMENTS.map(d => <span key={d} className="inline-flex items-center gap-2"><i className="size-4 border border-neutral-500"/>{d}</span>)}</div>
      <Bar>TIME LOG</Bar><Grid headers={["Date","Employee Name","Department","Start Time","Finish Time","Break (hrs)","Hours","Notes"]} count={9}/>
      <Bar>MATERIALS USED</Bar><Grid headers={["Date","Item / Description","Qty","Unit","Notes"]} count={7}/>
      <div className="mt-3 grid grid-cols-[1.25fr_.9fr_.9fr] gap-2">
        <Box title="ADDITIONAL NOTES / ISSUES" className="h-[38mm]" />
        <Box title="JOB STATUS (tick when complete)" className="h-[38mm]"><Checks items={["Work completed","Site left clean and tidy","Photos taken","All materials used","Any variations noted and reported"]}/></Box>
        <Box title="SIGN OFF" className="h-[38mm]"><div className="space-y-4 pt-1"><Line label="Name" value="________________"/><Line label="Signature" value="________________"/><Line label="Date" value="____ / ____ / ______"/></div></Box>
      </div>
    </Sheet>

    <Sheet>
      <Header number={number} safety />
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Box title="OUR SAFETY COMMITMENT" className="min-h-[38mm]">At Rodier we value the health and safety of our people, our clients and the public. We all share responsibility for a safe workplace and must work in a way that prevents harm.<div className="mt-4 font-bold tracking-wider text-emerald-900">THINK SAFE   |   WORK SAFE   |   HOME SAFE</div></Box>
        <Box title="BEFORE YOU START" className="min-h-[38mm]"><Checks items={["Site induction completed (if required)","Read and understand the job scope","Discuss any risks with the team / site contact","Check required PPE is available and in good condition","Inspect tools and equipment","Ensure permits (hot work, EWP, electrical, etc.) are authorised","Identify and isolate any hazards","Take a moment — plan the job"]}/></Box>
        <Box title="REQUIRED PPE (as applicable)" className="min-h-[50mm]"><Checks items={["Hi-vis clothing","Safety footwear","Eye protection","Gloves","Hearing protection","Hard hat","Fall protection","Respiratory protection"]}/></Box>
        <Box title="ON SITE" className="min-h-[50mm]"><Checks items={["Keep work area clean and organised","Use barriers / signage where required","Keep the public clear of the work area","Follow site rules and client requirements","Report any incidents, near misses or hazards","Take photos of work in progress and completion","Do not work under the influence of drugs or alcohol","If unsure — stop and ask"]}/></Box>
      </div>
      <div className="grid grid-cols-[1.4fr_.8fr] gap-3 mt-3"><Box title="KEY PROCEDURES" className="min-h-[62mm]"><ul className="list-disc pl-4 space-y-1.5"><li>Follow client site induction and specific requirements</li><li>Comply with relevant NZ Health & Safety legislation</li><li>Use correct tools, equipment and PPE for the task</li><li>Ensure electrical work is carried out by a qualified person</li><li>Isolate power before working on electrical components</li><li>Use EWP / ladders correctly and follow height safety procedures</li><li>Secure signage and components to prevent falling objects</li><li>Dispose of waste correctly</li><li>Report variations to the job scope to your supervisor</li><li>Complete all paperwork and time/materials accurately</li></ul></Box><Box title="EMERGENCY INFORMATION" className="min-h-[62mm]"><div className="text-xl font-bold">111</div><div className="text-[9px] mb-4">Emergency — Fire / Police / Ambulance</div><Line label="Assembly Point" value=""/><div className="h-5"/><Line label="First Aid" value=""/><div className="h-5"/><Line label="Medical Centre" value=""/></Box></div>
      <div className="grid grid-cols-2 gap-3 mt-3"><Box title="CUSTOMER SITE SPECIFIC NOTES" className="h-[65mm]"/><Box title="ADDITIONAL INFORMATION" className="h-[65mm]">{rows(8).map((_,i)=><div key={i} className="h-6 border-b border-neutral-200"/>)}</Box></div>
    </Sheet>
  </div>
}

function Sheet({children}:{children:React.ReactNode}){return <div className="sheet mx-auto my-6 w-[210mm] min-h-[297mm] bg-white p-[10mm] text-[10px] leading-snug shadow-sm">{children}</div>}
function Header({number,safety=false}:{number:string;safety?:boolean}){return <div className="flex items-start justify-between mb-4"><div className="flex items-center gap-3"><div className="grid size-16 place-items-center rounded-full border-[5px] border-black text-3xl font-black">R</div><div><div className="text-4xl font-black tracking-tight">RODIER</div><div className="tracking-[.32em] text-[11px]">CREATORS OF UNIQUE THINGS</div></div></div><div className="min-w-[48mm] rounded-lg border border-neutral-400 bg-neutral-50 px-4 py-2 text-center"><div className="font-semibold">{safety?"JOB CARD — SAFETY & PROCESSES":"Job No / Invoice No"}</div>{!safety&&<div className="text-3xl font-bold">{number}</div>}</div></div>}
function Bar({children}:{children:React.ReactNode}){return <div className="mt-3 bg-emerald-900 px-3 py-1.5 font-bold text-white text-[11px]">{children}</div>}
function Box({title,children,className=""}:{title:string;children?:React.ReactNode;className?:string}){return <div className={`border border-neutral-300 ${className}`}><div className="bg-emerald-900 px-3 py-1.5 font-bold text-white text-[11px]">{title}</div><div className="p-2">{children}</div></div>}
function Line({label,value}:{label:string;value:string}){return <div className="flex gap-2"><span className="w-20 shrink-0 font-semibold">{label}:</span><span className="font-medium">{value}</span></div>}
function Checks({items}:{items:string[]}){return <div className="space-y-1">{items.map(x=><div key={x} className="flex items-start gap-2"><i className="mt-px size-3.5 shrink-0 border border-neutral-500"/><span>{x}</span></div>)}</div>}
function Grid({headers,count}:{headers:string[];count:number}){return <table className="w-full table-fixed border-collapse"><thead><tr className="bg-neutral-100">{headers.map(h=><th key={h} className="border border-neutral-300 px-1 py-1 text-center font-semibold">{h}</th>)}</tr></thead><tbody>{rows(count).map((_,r)=><tr key={r}>{headers.map(h=><td key={h} className="h-7 border border-neutral-300"/>)}</tr>)}</tbody></table>}
