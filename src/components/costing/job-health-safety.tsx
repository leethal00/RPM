"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

type JobHsRecord = { id: string; title: string; kind: "swms" | "toolbox"; status: string; work_date: string; site: string | null; revision: number }

export function JobHealthSafety({ jobId }: { jobId: string }) {
  const db = useMemo(() => createClient(), [])
  const [records, setRecords] = useState<JobHsRecord[]>([])
  const [error, setError] = useState("")
  useEffect(() => {
    void (async () => {
      const { data, error } = await db.from("hs_records").select("id,title,kind,status,work_date,site,revision").eq("job_id", jobId).order("work_date", { ascending: false })
      setRecords((data || []) as JobHsRecord[])
      setError(error?.message || "")
    })()
  }, [db, jobId])
  return <div className="space-y-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Health & Safety</h2><p className="text-sm text-muted-foreground">SWMS/TAs and toolbox meetings linked to this job.</p></div><Button asChild size="sm"><Link href={`/health-safety?job=${jobId}`}>Open H&S register</Link></Button></div>
    {error && <p className="text-sm text-destructive">{error}</p>}
    {records.map(r => <div key={r.id} className="flex flex-wrap justify-between gap-2 border-t py-2 text-sm"><span><strong>{r.title}</strong> · {r.kind === "swms" ? "SWMS/TA" : "Toolbox"} · {r.site || "No site"}</span><span>{r.work_date} · {r.status} · rev {r.revision}</span></div>)}
    {!records.length && !error && <p className="text-sm text-muted-foreground">No H&S records linked yet.</p>}
  </div>
}
