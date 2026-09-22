"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, FileText, Printer } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

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
  clients?: { name?: string | null } | null
  stores?: { name?: string | null } | null
}

const SECTION_HEADING_CODE = "__RPM_SECTION_HEADING__"

function qtyFor(item: Item) {
  return item.mode === "build" ? (item.build_qty ?? item.qty ?? 1) : (item.qty ?? 1)
}

export default function JobPackPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = useMemo(() => createClient(), [])
  const [job, setJob] = useState<Job | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [includeSummary, setIncludeSummary] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const [{ data: jobData }, { data: itemData }] = await Promise.all([
        supabase.from("costing_jobs").select("id,title,job_number,xero_invoice_number,clients(name),stores(name)").eq("id", id).single(),
        supabase.from("costing_items").select("id,name,sign_code,mode,qty,build_qty,size,details,delivery,sort").eq("job_id", id).order("sort"),
      ])
      const nextItems = ((itemData || []) as Item[]).filter((item) => item.sign_code !== SECTION_HEADING_CODE)
      setJob(jobData as Job)
      setItems(nextItems)
      setSelected(nextItems.filter((item) => item.mode === "build").map((item) => item.id))
      setLoading(false)
    })()
  }, [id, supabase])

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading job pack...</div>
  if (!job) return <div className="p-8 text-sm text-muted-foreground">Job not found.</div>

  const builds = items.filter((item) => item.mode === "build")
  const client = [job.clients?.name, job.stores?.name].filter(Boolean).join(" · ")
  const number = (job.job_number || job.xero_invoice_number || "").replace(/^INV-/i, "")

  const toggle = (itemId: string) => {
    setSelected((current) => current.includes(itemId) ? current.filter((x) => x !== itemId) : [...current, itemId])
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-5xl p-6">
        <Link href={`/quoting/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to job
        </Link>

        <div className="mt-4 rounded-xl border bg-background p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Job pack</div>
              <h1 className="mt-1 text-2xl font-semibold">{number ? `${number} · ` : ""}{job.title}</h1>
              {client && <p className="mt-1 text-sm text-muted-foreground">{client}</p>}
            </div>
            <Link href={`/quoting/${id}/job-summary`} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted">
              <FileText className="size-4" /> Open summary
            </Link>
          </div>

          <div className="mt-6 rounded-lg border">
            <label className="flex cursor-pointer items-start gap-3 border-b p-4">
              <input type="checkbox" checked={includeSummary} onChange={(e) => setIncludeSummary(e.target.checked)} className="mt-1 size-4" />
              <div>
                <div className="font-medium">Job summary</div>
                <div className="text-sm text-muted-foreground">Top-level items only — no individual BOM lines.</div>
              </div>
            </label>

            {builds.length ? builds.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-start justify-between gap-4 border-b p-4 last:border-b-0">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} className="mt-1 size-4" />
                  <div>
                    <div className="font-medium">{item.name}</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">
                      Qty {qtyFor(item)}{item.size ? ` · ${item.size}` : ""}
                    </div>
                    {item.details && <div className="mt-1 max-w-2xl whitespace-pre-wrap text-sm">{item.details}</div>}
                  </div>
                </div>
                <Link href={`/quoting/${id}/job-card?item=${item.id}`} target="_blank" onClick={(e) => e.stopPropagation()} className="shrink-0 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                  Open job card
                </Link>
              </label>
            )) : (
              <div className="p-4 text-sm text-muted-foreground">This job has no BOM/build items. The summary is the only printout required.</div>
            )}
          </div>

          <div className="mt-5 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
            <strong className="text-foreground">Selected pack:</strong> {includeSummary ? "Summary" : "No summary"}
            {selected.length ? ` + ${selected.length} BOM job card${selected.length === 1 ? "" : "s"}` : ""}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {includeSummary && (
              <Link href={`/quoting/${id}/job-summary`} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-medium text-background">
                <Printer className="size-4" /> Print summary
              </Link>
            )}
            {selected.map((itemId) => {
              const item = builds.find((x) => x.id === itemId)
              if (!item) return null
              return (
                <Link key={itemId} href={`/quoting/${id}/job-card?item=${itemId}`} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted">
                  <Printer className="size-4" /> {item.name}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
