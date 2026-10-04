"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { isWorkDateTbc } from "@/lib/hs-work-date"
import { Button } from "@/components/ui/button"

type JobHsRecord = { id: string; title: string; kind: "swms" | "toolbox"; status: string; work_date: string; site: string | null; revision: number; body?: { date_tbc?: boolean } }
type JobIncident = { id: string; summary: string; category: string; status: string; occurred_at: string }

export function JobHealthSafety({ jobId }: { jobId: string }) {
  const db = useMemo(() => createClient(), [])
  const [records, setRecords] = useState<JobHsRecord[]>([])
  const [incidents, setIncidents] = useState<JobIncident[]>([])
  const [error, setError] = useState("")
  useEffect(() => {
    void (async () => {
      const [recordResult, incidentResult] = await Promise.all([
        db.from("hs_records").select("id,title,kind,status,work_date,site,revision,body").eq("job_id", jobId).order("work_date", { ascending: false }),
        db.from("hs_incidents").select("id,summary,category,status,occurred_at").eq("job_id", jobId).order("occurred_at", { ascending: false }),
      ])
      setRecords((recordResult.data || []) as JobHsRecord[])
      setIncidents((incidentResult.data || []) as JobIncident[])
      setError(recordResult.error?.message || incidentResult.error?.message || "")
    })()
  }, [db, jobId])
  return <div className="space-y-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Health & Safety</h2><p className="text-sm text-muted-foreground">SWMS/TAs, toolbox meetings and permitted incident reports linked to this job.</p></div><Button asChild size="sm"><Link href={`/health-safety?job=${jobId}`}>Open H&S register</Link></Button></div>
    {error && <p className="text-sm text-destructive">{error}</p>}
    {records.map(r => <div key={r.id} className="flex flex-wrap justify-between gap-2 border-t py-2 text-sm"><span><strong>{r.title}</strong> · {r.kind === "swms" ? "SWMS/TA" : "Toolbox"} · {r.site || "No site"}</span><span>{isWorkDateTbc(r) ? "TBC" : r.work_date} · {r.status} · rev {r.revision}</span></div>)}
    {incidents.map(i => <div key={i.id} className="flex flex-wrap justify-between gap-2 border-t py-2 text-sm"><Link className="text-primary underline" href={`/health-safety?job=${jobId}&tab=incidents`}><strong>{i.summary}</strong> · {i.category.replace("_", " ")}</Link><span>{new Date(i.occurred_at).toLocaleDateString("en-NZ")} · {i.status.replace("_", " ")}</span></div>)}
    {!records.length && !incidents.length && !error && <p className="text-sm text-muted-foreground">No H&S records linked yet.</p>}
  </div>
}

