"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { SwmsPrintDocument, type RecordRow, type Attendee, type Attachment } from "@/components/health-safety/swms-print-document"
import { createClient } from "@/lib/supabase/client"

export default function SwmsPrintPage() {
  const db = useMemo(() => createClient(), [])
  const [record, setRecord] = useState<RecordRow | null>(null)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id")
    let active = true
    void (async () => {
      const { data: auth } = await db.auth.getUser()
      if (!active) return
      if (!id) {
        setError("No SWMS/TA record was specified.")
        setLoading(false)
        return
      }
      if (!auth.user) {
        setError("Please sign in to view this SWMS/TA.")
        setLoading(false)
        return
      }
      const { data, error: recordError } = await db.from("hs_records")
        .select("id,title,status,job_reference,site,work_date,body,revision,template_version,completed_at,created_at")
        .eq("id", id).eq("kind", "swms").single()
      if (!active) return
      if (recordError || !data) {
        setError("This SWMS/TA could not be found or you do not have access to it.")
        setLoading(false)
        return
      }
      const [people, files] = await Promise.all([
        db.from("hs_attendees").select("id,name,signed_at").eq("record_id", id).order("created_at"),
        db.from("hs_attachments").select("id,file_name").eq("record_id", id).order("created_at"),
      ])
      if (!active) return
      setRecord(data as RecordRow)
      setAttendees((people.data || []) as Attendee[])
      setAttachments((files.data || []) as Attachment[])
      setLoading(false)
    })().catch(() => {
      if (active) {
        setError("The SWMS/TA could not be loaded.")
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [db])

  return <>
    <div className="print-actions"><Link href="/health-safety">Back to Health &amp; Safety</Link>{record && <button type="button" onClick={() => window.print()}>Print SWMS/TA</button>}</div>
    {loading && <p>Loading SWMS/TA…</p>}
    {error && <p role="alert">{error}</p>}
    {record && <SwmsPrintDocument record={record} attendees={attendees} attachments={attachments} />}
  </>
}
