"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Department = { id: string; name: string }
type Job = { id: string; title: string; job_number: string | null }
type Assignment = { job_id: string; department_id: string; instructions: string; estimated_hours: number | null; progress: number }

export function ProductionAssignments() {
    const [departments, setDepartments] = useState<Department[]>([])
    const [jobs, setJobs] = useState<Job[]>([])
    const [assignments, setAssignments] = useState<Assignment[]>([])
    const [dept, setDept] = useState("")
    const [job, setJob] = useState("")
    const [instructions, setInstructions] = useState("")
    const [hours, setHours] = useState("")
    const [error, setError] = useState("")
    const [message, setMessage] = useState("")
    const [busy, setBusy] = useState(true)
    const load = useCallback(async () => {
        const db = createClient()
        const results = await Promise.all([
            db.from("departments").select("id,name").order("name"),
            db.from("costing_jobs").select("id,title,job_number").in("status",["approved","in_progress","complete","invoiced"]).eq("is_template",false).order("title"),
            db.from("department_jobs").select("*"),
        ])
        const failure = results.find(r=>r.error)?.error
        if (failure) setError(failure.message)
        else { setDepartments(results[0].data || []); setJobs(results[1].data || []); setAssignments((results[2].data || []) as Assignment[]) }
        setBusy(false)
    },[])
    useEffect(()=>{
        // Initial database fetch; save/remove also refresh this dataset.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load()
    },[load])
    function choose(jobId: string, departmentId: string) {
        setJob(jobId); setDept(departmentId)
        const row=assignments.find(a=>a.job_id===jobId && a.department_id===departmentId)
        setInstructions(row?.instructions || ""); setHours(row?.estimated_hours?.toString() || "")
    }
    async function save(e: FormEvent) {
        e.preventDefault(); setBusy(true); setError(""); setMessage("")
        const {error} = await createClient().from("department_jobs").upsert({job_id:job,department_id:dept,instructions,estimated_hours:hours===""?null:Number(hours)}, {onConflict:"job_id,department_id"})
        if (error) setError(error.message); else { setMessage("Assignment saved."); await load() }
        setBusy(false)
    }
    async function remove(a: Assignment) {
        setBusy(true); setError(""); setMessage("")
        const {error} = await createClient().from("department_jobs").delete().eq("job_id",a.job_id).eq("department_id",a.department_id)
        if (error) setError(error.message); else {setMessage("Access removed. Recorded actuals are retained."); await load()}
        setBusy(false)
    }
    return <DashboardLayout><main className="mx-auto w-full max-w-4xl space-y-5 py-6"><header><h1 className="text-2xl font-semibold">Production access</h1><p className="mt-2 text-sm text-muted-foreground">Assign approved jobs to departments. Set each operator’s role and department in Users.</p><div className="mt-3 flex gap-4 text-sm underline"><Link href="/settings/users">Manage users</Link><Link href="/production">Preview CNC workspace</Link></div></header>
        {error && <p role="alert" className="text-red-700">{error}</p>}{message && <p role="status">{message}</p>}
        <form onSubmit={save} className="space-y-4 rounded-xl border p-5"><fieldset disabled={busy} className="space-y-4"><div><Label htmlFor="department">Department</Label><select required id="department" className="w-full rounded border p-2" value={dept} onChange={e=>choose(job,e.target.value)}><option value="">Select department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div><div><Label htmlFor="assigned-job">Job</Label><select required id="assigned-job" className="w-full rounded border p-2" value={job} onChange={e=>choose(e.target.value,dept)}><option value="">Select approved job</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.job_number} · {j.title}</option>)}</select></div><div><Label htmlFor="instructions">Workshop instructions (visible to department)</Label><textarea id="instructions" className="w-full rounded border p-2" value={instructions} onChange={e=>setInstructions(e.target.value)} maxLength={10000}/></div><div><Label htmlFor="estimate">Estimated department hours</Label><Input id="estimate" type="number" min="0" max="999999" step="0.01" value={hours} onChange={e=>setHours(e.target.value)}/></div><Button type="submit">Save assignment</Button></fieldset></form>
        <section className="space-y-3"><h2 className="text-lg font-semibold">Current assignments</h2>{!busy && !assignments.length && <p>No jobs assigned yet.</p>}{assignments.map(a=><div key={`${a.job_id}-${a.department_id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"><button className="text-left" onClick={()=>choose(a.job_id,a.department_id)}><strong>{jobs.find(j=>j.id===a.job_id)?.title || "Job no longer in production"}</strong><p className="text-sm text-muted-foreground">{departments.find(d=>d.id===a.department_id)?.name} · {a.progress}% · {a.estimated_hours ?? "No"} estimated hours</p></button><Button disabled={busy} variant="outline" onClick={()=>void remove(a)}>Remove access</Button></div>)}</section>
    </main></DashboardLayout>
}
