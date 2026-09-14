"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Clock, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { CostingJob, CostingTimeEntry } from "@/types/database"

const LABOUR_TYPES = ["Admin", "Design", "Workshop", "Install", "Welding", "Other"]

export function TimeEntries({ job }: { job: CostingJob }) {
  const supabase = useMemo(() => createClient(), [])
  const [entries, setEntries] = useState<CostingTimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [person, setPerson] = useState("")
  const [userId, setUserId] = useState<string | null>(null)
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [labourType, setLabourType] = useState("Admin")
  const [hours, setHours] = useState("")
  const [description, setDescription] = useState("")

  async function loadEntries() {
    const { data, error } = await supabase
      .from("costing_time_entries")
      .select("*")
      .eq("job_id", job.id)
      .order("work_date", { ascending: false })
      .order("created_at", { ascending: false })
    if (error) toast.error(error.message)
    setEntries((data as CostingTimeEntry[]) || [])
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      const [{ data: authData }, { data: timeData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("costing_time_entries").select("*").eq("job_id", job.id).order("work_date", { ascending: false }).order("created_at", { ascending: false }),
      ])
      if (!active) return
      setEntries((timeData as CostingTimeEntry[]) || [])
      const currentUser = authData.user
      if (currentUser) {
        setUserId(currentUser.id)
        const { data: profile } = await supabase.from("users").select("name,email").eq("id", currentUser.id).single()
        if (!active) return
        const displayName = profile?.name?.trim() || profile?.email?.split("@")[0] || currentUser.email?.split("@")[0] || ""
        setPerson(displayName)
      }
      setLoading(false)
    })()
    return () => { active = false }
  }, [job.id, supabase])

  const totalHours = entries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0)
  const totalsByType = entries.reduce<Record<string, number>>((acc, entry) => {
    const key = entry.labour_type || "Other"
    acc[key] = (acc[key] || 0) + Number(entry.hours || 0)
    return acc
  }, {})

  async function addEntry() {
    const numericHours = Number(hours)
    if (!workDate) return toast.error("Choose a date")
    if (!numericHours || numericHours <= 0) return toast.error("Enter hours greater than zero")
    if (!person.trim()) return toast.error("Enter a person")

    setSaving(true)
    const { error } = await supabase.from("costing_time_entries").insert({
      job_id: job.id,
      work_date: workDate,
      user_id: userId,
      person_name: person.trim(),
      hours: numericHours,
      description: description.trim() || null,
      labour_type: labourType,
      created_by: userId,
    })
    setSaving(false)
    if (error) return toast.error(error.message)
    setHours("")
    setDescription("")
    toast.success("Time entry added")
    await loadEntries()
  }

  async function deleteEntry(id: string) {
    const previous = entries
    setEntries((rows) => rows.filter((row) => row.id !== id))
    const { error } = await supabase.from("costing_time_entries").delete().eq("id", id)
    if (error) {
      setEntries(previous)
      toast.error(error.message)
    }
  }

  if (loading) return <div className="mt-6 h-40 rounded-lg bg-muted/40 animate-pulse" />

  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <div className="flex items-center justify-between bg-muted/40 px-4 py-2.5">
          <h3 className="text-sm font-semibold flex items-center gap-1.5"><Clock className="size-3.5" /> Add time</h3>
          <span className="text-xs text-muted-foreground tabular-nums">{totalHours.toFixed(2)} hrs total</span>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-12">
          <div className="grid gap-1.5 md:col-span-2"><Label>Date</Label><Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} /></div>
          <div className="grid gap-1.5 md:col-span-2"><Label>Person</Label><Input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Name" /></div>
          <div className="grid gap-1.5 md:col-span-2"><Label>Type</Label><Select value={labourType} onValueChange={setLabourType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LABOUR_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid gap-1.5 md:col-span-2"><Label>Hours</Label><Input type="number" min="0" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0.00" /></div>
          <div className="grid gap-1.5 md:col-span-4"><Label>Note</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was done" className="min-h-10" /></div>
          <div className="md:col-span-12 flex justify-end"><Button onClick={addEntry} disabled={saving} className="gap-1.5"><Plus className="size-3.5" />{saving ? "Saving…" : "Add time"}</Button></div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(totalsByType).sort(([a], [b]) => a.localeCompare(b)).map(([type, total]) => (
          <div key={type} className="rounded-md border border-border/60 px-3 py-2 text-xs"><span className="text-muted-foreground">{type}</span><span className="ml-2 font-semibold tabular-nums">{total.toFixed(2)} hrs</span></div>
        ))}
      </div>

      <section className="rounded-lg border border-border/60 overflow-hidden">
        <div className="bg-muted/40 px-4 py-2.5"><h3 className="text-sm font-semibold">Time entries</h3></div>
        {entries.length === 0 ? (
          <div className="px-4 py-8 text-sm text-muted-foreground text-center">No time has been entered against this job yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="text-left border-b border-border/60"><th className="font-medium px-3 py-2 w-32">Date</th><th className="font-medium px-2 py-2 w-36">Person</th><th className="font-medium px-2 py-2 w-28">Type</th><th className="font-medium px-2 py-2 w-24 text-right">Hours</th><th className="font-medium px-2 py-2">Note</th><th className="w-10" /></tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/40 last:border-0 group">
                    <td className="px-3 py-2">{entry.work_date ? new Date(`${entry.work_date}T00:00:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                    <td className="px-2 py-2">{entry.person_name || "—"}</td>
                    <td className="px-2 py-2">{entry.labour_type || "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{Number(entry.hours || 0).toFixed(2)}</td>
                    <td className="px-2 py-2 text-muted-foreground">{entry.description || "—"}</td>
                    <td className="px-2 py-2 text-right"><button onClick={() => deleteEntry(entry.id)} className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" title="Delete time entry"><Trash2 className="size-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
