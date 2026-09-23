"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Briefcase, Clock, Package, ArrowLeft, RefreshCw } from "lucide-react"

type ProductionJob = { id: string; title: string; job_number: string | null; status: string; completion_date: string | null; estimated_hours: number | null; actual_hours: number; progress: number }
type Line = { id: string; material_id: string | null; description: string; qty: number; unit: string | null; section: string }
type BomNote = { item_id: string; name: string; notes: string }
type Workspace = {
    department: string | null; department_id: string; jobs: ProductionJob[];
    job?: ProductionJob & { instructions: string; details: string | null; job_lead_name: string | null };
    lines?: Line[];
    bom_notes?: BomNote[];
    time?: { id: string; work_date: string; hours: number; description: string; own: boolean }[];
    actuals?: { id: string; order_date: string; description: string; qty: number; unit: string; own: boolean; costing_line_id: string | null }[];
}

const today = () => new Date().toLocaleDateString("en-CA")
const fieldClass = "w-full rounded-md border bg-background px-3 py-2 text-sm"
const panel = "rounded-xl border bg-card p-5 shadow-sm"

export function ProductionWorkspace() {
    const [data, setData] = useState<Workspace | null>(null)
    const [jobId, setJobId] = useState<string | null>(null)
    const [search, setSearch] = useState("")
    const [error, setError] = useState("")
    const [notice, setNotice] = useState("")
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [lineId, setLineId] = useState("")
    const [progress, setProgress] = useState(0)
    const load = useCallback(async () => {
        setLoading(true); setError("")
        const client = createClient()
        const [result, notesResult] = await Promise.all([
            client.rpc("production_workspace", { p_job_id: jobId }),
            jobId ? client.rpc("production_bom_notes", { p_job_id: jobId }) : Promise.resolve(null),
        ])
        if (result.error) { setData(null); setError(result.error.message) }
        else {
            if (notesResult?.error) setError(notesResult.error.message)
            setData({ ...(result.data as Workspace), bom_notes: (notesResult?.data as BomNote[] | null) ?? [] })
            setProgress(result.data.job?.progress ?? 0)
        }
        setLoading(false)
    }, [jobId])
    useEffect(() => {
        // Fetch the selected job from the external database; refreshes also reuse this loader.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load()
    }, [load])

    async function save(kind: string, values: Record<string, unknown>, form?: HTMLFormElement) {
        if (!jobId || saving) return
        setSaving(true); setError(""); setNotice("")
        try {
            const result = await createClient().rpc("production_record", { p_job_id: jobId, p_kind: kind, p_data: values, p_department_id: data?.department_id })
            if (result.error) throw result.error
            form?.reset(); setLineId("")
            await load(); setNotice(kind === "progress" ? "Progress updated." : "Entry saved.")
        } catch (e) { setError(e instanceof Error ? e.message : (e as { message?: string }).message || "Could not save. Please try again.") }
        finally { setSaving(false) }
    }
    function submit(event: FormEvent<HTMLFormElement>, kind: string) {
        event.preventDefault()
        const form = event.currentTarget
        void save(kind, Object.fromEntries(new FormData(form)), form)
    }
    const job = data?.job
    const rows = data?.jobs.filter(j => `${j.title} ${j.job_number || ""}`.toLowerCase().includes(search.toLowerCase())) ?? []
    const writable = job?.status === "approved" || job?.status === "in_progress"
    const selectedLine = data?.lines?.find(l => l.id === lineId)
    const hours = data?.time?.reduce((sum,t) => sum + Number(t.hours),0) ?? 0

    return <DashboardLayout><main className="mx-auto w-full max-w-6xl space-y-5 py-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">RPM · Production</p><h1 className="mt-1 text-3xl font-semibold">{data?.department || "Department"} workspace</h1><p className="mt-2 text-sm text-muted-foreground">Assigned jobs, workshop instructions and actual usage.</p></div>
            <Button variant="outline" onClick={() => void load()} disabled={loading || saving}><RefreshCw className="size-4" />Refresh</Button>
        </header>
        {error && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</div>}
        {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
        {loading ? <p role="status">Loading jobs…</p> : !data ? null : !data.department ? <div className={panel}>Your account needs a department assignment. Ask an administrator to set this up.</div> : !jobId ? <>
            <div className="grid gap-3 sm:grid-cols-3">{[
                ["Active jobs", data.jobs.filter(j => ["approved","in_progress"].includes(j.status)).length, Briefcase],
                ["Department hours logged", data.jobs.reduce((s,j) => s + Number(j.actual_hours),0).toFixed(2), Clock],
                ["Jobs ready to review", data.jobs.filter(j => j.progress === 100).length, Package],
            ].map(([label,value,Icon]) => { const I = Icon as typeof Clock; return <div key={String(label)} className={panel}><I className="mb-3 size-5 text-muted-foreground"/><p className="text-2xl font-semibold">{String(value)}</p><p className="text-sm text-muted-foreground">{String(label)}</p></div> })}</div>
            <Label htmlFor="job-search">Find a job</Label><Input id="job-search" placeholder="Search job number or title" value={search} onChange={e=>setSearch(e.target.value)} />
            {!rows.length && <div className={panel}>{data.jobs.length ? "No jobs match your search." : "No jobs assigned yet. Your administrator can assign approved jobs to your department."}</div>}
            <div className="grid gap-4 md:grid-cols-2">{rows.map(j => <button key={j.id} onClick={()=>{setJobId(j.id);setNotice("");setLineId("")}} className={`${panel} text-left transition hover:border-primary focus-visible:outline-2 focus-visible:outline-primary`}>
                <div className="flex justify-between gap-2 text-xs text-muted-foreground"><span>{j.job_number || "Job number pending"}</span><span className="capitalize">{j.status.replaceAll("_"," ")}</span></div>
                <h2 className="my-2 text-lg font-semibold">{j.title}</h2><p className="text-sm text-muted-foreground">Complete by {j.completion_date || "not set"}</p>
                <div className="mt-4 flex justify-between text-sm"><span>{j.actual_hours} h logged{j.estimated_hours !== null ? ` / ${j.estimated_hours} h estimated` : " · no estimate"}</span><span>{j.progress}%</span></div>
                <progress aria-label={`${j.title} progress`} max={100} value={j.progress} className="mt-2 h-2 w-full accent-primary"/>
            </button>)}</div>
        </> : job ? <>
            <Button variant="ghost" onClick={()=>{setJobId(null);setNotice("")}}><ArrowLeft className="size-4"/>All department jobs</Button>
            <section className={panel}><div className="flex flex-wrap justify-between gap-3"><div><p className="text-sm text-muted-foreground">{job.job_number}</p><h2 className="text-2xl font-semibold">{job.title}</h2></div><p className="text-sm">Complete by <strong>{job.completion_date || "not set"}</strong></p></div><p className="mt-2 text-sm text-muted-foreground">Job lead: {job.job_lead_name || "not set"}</p>
                <h3 className="mt-5 font-semibold">Workshop instructions</h3><p className="mt-2 whitespace-pre-wrap text-sm">{job.instructions || job.details || "No workshop instructions have been added."}</p>
                {!!data.bom_notes?.length && <div className="mt-4 border-t pt-4"><h3 className="font-semibold">Internal BOM notes</h3><div className="mt-2 space-y-3">{data.bom_notes.map(note => <div key={note.item_id} className="rounded-md bg-muted/40 px-3 py-2 text-sm"><p className="font-medium">{note.name}</p><p className="mt-1 whitespace-pre-wrap">{note.notes}</p></div>)}</div></div>}
                <div className="mt-5 border-t pt-4"><p className="font-medium">{hours.toFixed(2)} h actual{job.estimated_hours !== null ? ` / ${job.estimated_hours} h estimated` : " · department estimate not set"}</p><p className="mt-1 text-xs text-muted-foreground">Department totals. Progress is recorded separately from time spent.</p><div className="mt-3 flex items-end gap-3"><div><Label htmlFor="progress">Progress (%)</Label><Input id="progress" type="number" min={0} max={100} step={1} value={progress} onChange={e=>setProgress(Number(e.target.value))} disabled={!writable || saving} className="mt-1 w-24"/></div><Button onClick={()=>void save("progress",{progress})} disabled={!writable || saving}>Save progress</Button></div></div>
            </section>
            {!writable && <p className="rounded-lg bg-muted p-3 text-sm">This job is closed. Existing records are available to review.</p>}
            <section className={panel}><h3 className="mb-3 text-lg font-semibold">Planned materials & labour</h3><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2">Description</th><th>Planned quantity</th><th>Department used</th></tr></thead><tbody>{data.lines?.map(l=><tr className="border-b" key={l.id}><td className="py-3 pr-3">{l.description}<span className="block text-xs text-muted-foreground">{l.section}</span></td><td>{l.qty} {l.unit}</td><td>{l.section === "Labour" ? "See hours above" : `${data.actuals?.filter(a=>a.costing_line_id===l.id).reduce((s,a)=>s+Number(a.qty),0) || 0} ${l.unit || ""}`}</td></tr>)}</tbody></table></div>{!data.lines?.length && <p className="text-sm text-muted-foreground">No planned materials have been added.</p>}<p className="mt-3 text-xs text-muted-foreground">Planned quantities cover the whole job; usage shown is for this department.</p></section>
            <div className="grid gap-5 lg:grid-cols-2">
                <section className={panel}><h3 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Clock className="size-5"/>Record my time</h3><form onSubmit={e=>submit(e,"time")}><fieldset disabled={!writable || saving} className="space-y-3"><div><Label htmlFor="time-date">Work date</Label><Input id="time-date" name="date" type="date" defaultValue={today()} max={today()} required/></div><div><Label htmlFor="hours">Hours</Label><Input id="hours" name="hours" type="number" min="0.01" max="24" step="0.01" placeholder="e.g. 1.5" required/></div><div><Label htmlFor="time-description">Work completed</Label><textarea id="time-description" name="description" className={fieldClass} maxLength={2000} required placeholder="Setup, cutting, finishing…"/></div><Button type="submit">{saving ? "Saving…" : "Save my time"}</Button></fieldset></form></section>
                <section className={panel}><h3 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Package className="size-5"/>Record material used</h3><form onSubmit={e=>submit(e,"material")}><fieldset disabled={!writable || saving} className="space-y-3"><div><Label htmlFor="material-date">Usage date</Label><Input id="material-date" name="date" type="date" defaultValue={today()} max={today()} required/></div><div><Label htmlFor="material-line">Material</Label><select id="material-line" name="line_id" className={fieldClass} value={lineId} onChange={e=>setLineId(e.target.value)}><option value="">Other material</option>{data.lines?.filter(l=>l.section!=="Labour").map(l=><option key={l.id} value={l.id}>{l.description}</option>)}</select></div>{!lineId && <div><Label htmlFor="material-description">Description</Label><Input id="material-description" name="description" maxLength={2000} required/></div>}<div className="grid grid-cols-2 gap-3"><div><Label htmlFor="quantity">Quantity used</Label><Input id="quantity" name="qty" type="number" min="0.0001" max="99999999" step="0.0001" required/></div><div><Label htmlFor="unit">Unit</Label><Input key={lineId} id="unit" name="unit" defaultValue={selectedLine?.unit || ""} readOnly={!!selectedLine?.unit} placeholder="sheet, m, each…" maxLength={40} required/></div></div><Button type="submit">{saving ? "Saving…" : "Save material usage"}</Button></fieldset></form></section>
            </div>
            <div className="grid gap-5 lg:grid-cols-2"><section className={panel}><h3 className="mb-3 font-semibold">Department time log</h3>{data.time?.length ? data.time.map(t=><div key={t.id} className="border-t py-3 text-sm"><p className="font-medium">{t.hours} h · {t.work_date}{t.own ? " · You" : " · Department"}</p><p>{t.description}</p></div>) : <p className="text-sm text-muted-foreground">No time recorded yet.</p>}</section><section className={panel}><h3 className="mb-3 font-semibold">Department material log</h3>{data.actuals?.length ? data.actuals.map(a=><div key={a.id} className="border-t py-3 text-sm"><p className="font-medium">{a.qty} {a.unit} · {a.description}</p><p className="text-muted-foreground">{a.order_date}{a.own ? " · You" : " · Department"}</p></div>) : <p className="text-sm text-muted-foreground">No material usage recorded yet.</p>}</section></div>
        </> : null}
    </main></DashboardLayout>
}
