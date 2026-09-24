"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ClipboardList, Plus, RotateCcw, Search } from "lucide-react"
import { toast } from "sonner"
import DashboardLayout from "@/components/dashboard-layout"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { useCustomerFilter } from "@/lib/customer-filter"
import { DEPARTMENTS, OPERATION_STATUSES, formatHours, operationProgress, operationSchema,
    type DepartmentCode, type OperationStatus, type PlanningJob, type PlanningOperation } from "@/lib/production/planning"

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
const statusColors: Record<OperationStatus, string> = {
    not_ready: "bg-muted text-muted-foreground",
    ready: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    scheduled: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    paused: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    complete: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
}

/** Supabase caps responses; fetch all pages rather than silently dropping jobs. */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>) {
    const rows: T[] = []
    for (let from = 0; ; from += 500) {
        const result = await page(from, from + 499)
        if (result.error) throw result.error
        rows.push(...(result.data ?? []) as T[])
        if (!result.data || result.data.length < 500) return { data: rows, error: null }
    }
}

function displayDate(value: string | null) {
    return value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "—"
}

export function DetailedProductionPlanning() {
    const supabase = createClient()
    const { clientId, initialised } = useCustomerFilter()
    const [department, setDepartment] = useState<DepartmentCode>("cnc")
    const [search, setSearch] = useState("")
    const [showComplete, setShowComplete] = useState(false)
    const [editor, setEditor] = useState<{ operation?: PlanningOperation } | null>(null)
    const { data: operations, error, isLoading, isValidating, mutate } = useSupabaseQuery<PlanningOperation[]>(
        initialised ? `production-planning:${department}:${clientId ?? "all"}` : null,
        () => allRows<PlanningOperation>((from, to) => {
            let query = supabase.from("production_planning").select("*").eq("department_code", department)
            if (clientId) query = query.eq("client_id", clientId)
            return query.order("effective_due_date", { nullsFirst: false }).order("job_id").order("sequence").order("id").range(from, to)
        }),
        { keepPreviousData: false, revalidateOnFocus: true },
    )
    const visible = useMemo(() => (operations ?? []).filter(operation => {
        if (!showComplete && (operation.status === "complete" || ["cancelled", "complete", "invoiced"].includes(operation.job_status))) return false
        const text = `${operation.job_number ?? ""} ${operation.job_title} ${operation.client_name ?? ""} ${operation.name}`
        return text.toLowerCase().includes(search.trim().toLowerCase())
    }), [operations, showComplete, search])
    const estimated = visible.reduce((total, op) => total + (op.estimated_hours ?? 0), 0)
    const estimatesPresent = visible.filter(op => op.estimated_hours !== null).length
    const actualsPresent = visible.filter(op => op.actual_hours !== null).length
    const actual = visible.reduce((total, op) => total + (op.actual_hours ?? 0), 0)
    const loading = !initialised || isLoading

    return <DashboardLayout><PageShell width="full">
        <PageHeader icon={ClipboardList} title="Production Planning" description="Department workload and job operations"
            actions={<><Button variant="outline" size="sm" disabled={isValidating} onClick={() => void mutate()}><RotateCcw className="size-4" />Refresh</Button>
                <Button size="sm" onClick={() => setEditor({})}><Plus className="size-4" />Add operation</Button></>} />
        <Tabs value={department} onValueChange={value => setDepartment(value as DepartmentCode)}>
            <TabsList className="h-auto flex-wrap justify-start">
                {Object.entries(DEPARTMENTS).map(([code, label]) => <TabsTrigger key={code} value={code}>{label}</TabsTrigger>)}
            </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-52 flex-1 max-w-md"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" aria-label="Search operations" placeholder="Search job, client or operation…" value={search} onChange={event => setSearch(event.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showComplete} onChange={event => setShowComplete(event.target.checked)} />Include completed / closed jobs</label>
        </div>
        {error ? <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm">
            Could not load production planning. Check your connection and that the production-planning migration has been applied.
            <Button variant="outline" className="ml-3" onClick={() => void mutate()}>Retry</Button>
        </div> : loading ? <p role="status" className="py-8 text-muted-foreground">Loading {DEPARTMENTS[department]} workload…</p> : <>
            <div className="grid gap-3 sm:grid-cols-3">
                <Summary label="Operations shown" value={String(visible.length)} detail={`${new Set(visible.map(op => op.job_id)).size} jobs · ${visible.filter(op => op.blocker_reason).length} blocked`} />
                <Summary label="Estimated hours" value={formatHours(estimatesPresent ? estimated : null)} detail={`${estimatesPresent} of ${visible.length} operations estimated`} />
                <Summary label="Actual hours recorded" value={formatHours(actualsPresent ? actual : null)} detail="Only labour linked to these operations" />
            </div>
            <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full text-sm">
                    <caption className="sr-only">{DEPARTMENTS[department]} production operations</caption>
                    <thead className="bg-muted/50 text-left text-muted-foreground"><tr>
                        {["Job / Client", "Operation", "Due", "Status", "Estimated", "Actual", "Progress", ""].map((label, i) => <th key={i} scope="col" className="px-3 py-2.5 font-medium whitespace-nowrap">{label || <span className="sr-only">Actions</span>}</th>)}
                    </tr></thead>
                    <tbody>{visible.map(operation => {
                        const progress = operationProgress(operation)
                        return <tr key={operation.id} className="border-t hover:bg-muted/30">
                            <td className="px-3 py-3 min-w-52"><Link className="font-medium hover:underline" href={`/quoting/jobs/${operation.job_id}`}>{operation.job_number ? `${operation.job_number} · ` : ""}{operation.job_title}</Link><div className="text-xs text-muted-foreground">{operation.client_name ?? "No client"}</div></td>
                            <td className="px-3 py-3 min-w-40"><div>{operation.name}</div><div className="text-xs text-muted-foreground">Sequence {operation.sequence}</div>{operation.blocker_reason && <div className="mt-1 max-w-xs text-xs text-orange-700 dark:text-orange-300">Blocked: {operation.blocker_reason}</div>}</td>
                            <td className="px-3 py-3 whitespace-nowrap">{displayDate(operation.effective_due_date)}{!operation.due_date && operation.effective_due_date && <div className="text-xs text-muted-foreground">Job due date</div>}</td>
                            <td className="px-3 py-3"><Badge className={`whitespace-nowrap ${statusColors[operation.status]}`}>{OPERATION_STATUSES[operation.status]}</Badge>{["cancelled", "complete", "invoiced"].includes(operation.job_status) && <div className="mt-1 text-xs text-muted-foreground">Job {operation.job_status}</div>}</td>
                            <td className="px-3 py-3 whitespace-nowrap tabular-nums">{formatHours(operation.estimated_hours)}</td>
                            <td className="px-3 py-3 whitespace-nowrap tabular-nums">{formatHours(operation.actual_hours)}</td>
                            <td className="px-3 py-3 min-w-32">{progress === null ? <span className="text-muted-foreground">Not assessed</span> : <><div className="mb-1 text-xs">{progress}%</div><div role="progressbar" aria-label={`${operation.name} progress`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div></>}</td>
                            <td className="px-3 py-3"><Button size="sm" variant="outline" disabled={operation.job_status === "cancelled"} aria-label={`Edit ${operation.name}`} onClick={() => setEditor({ operation })}>Edit</Button></td>
                        </tr>
                    })}</tbody>
                </table>
                {!visible.length && <div className="p-10 text-center"><p className="font-medium">No {DEPARTMENTS[department]} operations {search ? "match your search" : "in this view"}.</p><p className="mt-1 text-sm text-muted-foreground">Add an operation to an approved job, or adjust the filters.</p></div>}
            </div>
            <p className="text-xs text-muted-foreground">Progress is an assessment of work completed, independent of hours used. A dash means no estimate or linked labour entries. Scheduled is a planning status; calendar allocation will follow.</p>
        </>}
        {editor && <OperationEditor department={department} clientId={clientId} operation={editor.operation} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void mutate() }} />}
    </PageShell></DashboardLayout>
}

function Summary({ label, value, detail }: { label: string; value: string; detail: string }) {
    return <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
}

function OperationEditor({ department, clientId, operation, onClose, onSaved }: {
    department: DepartmentCode; clientId: string | null; operation?: PlanningOperation; onClose: () => void; onSaved: () => void
}) {
    const supabase = createClient()
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [status, setStatus] = useState<OperationStatus>(operation?.status ?? "not_ready")
    const { data: jobs, error, isLoading } = useSupabaseQuery<PlanningJob[]>(
        operation ? null : `production-job-options:${clientId ?? "all"}`,
        () => allRows<PlanningJob>((from, to) => {
            let query = supabase.from("costing_jobs").select("id, job_number, title").in("status", ["approved", "in_progress"]).eq("is_template", false)
            if (clientId) query = query.eq("client_id", clientId)
            return query.order("title").order("id").range(from, to)
        }), { keepPreviousData: false },
    )

    async function save(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (saving) return
        const form = new FormData(event.currentTarget)
        const numberOrNull = (key: string) => String(form.get(key) ?? "").trim() === "" ? null : Number(form.get(key))
        const parsed = operationSchema.safeParse({
            job_id: operation?.job_id ?? form.get("job_id"), department_code: operation?.department_code ?? department,
            name: form.get("name"), sequence: Number(form.get("sequence")), status,
            estimated_hours: numberOrNull("estimated_hours"), due_date: form.get("due_date") || null,
            progress_percent: status === "complete" ? 100 : numberOrNull("progress_percent"), blocker_reason: form.get("blocker_reason") || null,
        })
        if (!parsed.success) { setSaveError(parsed.error.issues[0].message); return }
        setSaving(true)
        setSaveError(null)
        try {
            const query = operation
                ? supabase.from("production_operations").update(parsed.data).eq("id", operation.id).eq("updated_at", operation.updated_at)
                : supabase.from("production_operations").insert(parsed.data)
            const { data, error: mutationError } = await query.select("id").maybeSingle()
            if (mutationError) throw mutationError
            if (!data) { setSaveError("This operation changed or is no longer editable. Close this form, refresh the list and try again."); return }
            toast.success(operation ? "Operation updated" : "Operation added")
            onSaved()
        } catch { setSaveError("Could not save this operation. Check your connection, permissions and that the job is still approved.") }
        finally { setSaving(false) }
    }

    return <Dialog open onOpenChange={open => { if (!open && !saving) onClose() }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{operation ? "Edit operation" : "Add operation"} · {DEPARTMENTS[department]}</DialogTitle><DialogDescription>Plan a separate stage of work. One job can have several operations in each department.</DialogDescription></DialogHeader>
        <form onSubmit={save} className="space-y-4">
            {operation ? <p className="text-sm font-medium">{operation.job_number} · {operation.job_title}</p> : <div className="space-y-1.5"><Label htmlFor="operation-job">Job</Label><select id="operation-job" name="job_id" required className={selectClass} disabled={isLoading || !!error} defaultValue=""><option value="">{isLoading ? "Loading jobs…" : "Select an approved job"}</option>{jobs?.map(job => <option key={job.id} value={job.id}>{job.job_number ? `${job.job_number} · ` : ""}{job.title}</option>)}</select>{error ? <p role="alert" className="text-sm text-destructive">Could not load jobs. Close this form and retry.</p> : !isLoading && !jobs?.length && <p className="text-sm text-muted-foreground">No approved jobs for this customer filter.</p>}</div>}
            <div className="space-y-1.5"><Label htmlFor="operation-name">Operation</Label><Input id="operation-name" name="name" required maxLength={160} defaultValue={operation?.name ?? ""} placeholder="e.g. Cut fascia panels" /></div>
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="operation-sequence">Sequence on job</Label><Input id="operation-sequence" name="sequence" type="number" min={0} max={9999} step={1} required defaultValue={operation?.sequence ?? 10} /></div>
                <div className="space-y-1.5"><Label htmlFor="operation-status">Status</Label><select id="operation-status" className={selectClass} value={status} onChange={event => setStatus(event.target.value as OperationStatus)}>{Object.entries(OPERATION_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div className="space-y-1.5"><Label htmlFor="operation-estimate">Estimated hours</Label><Input id="operation-estimate" name="estimated_hours" type="number" min={0} max={999999} step="0.01" defaultValue={operation?.estimated_hours ?? ""} placeholder="Not estimated" /></div>
                <div className="space-y-1.5"><Label htmlFor="operation-due">Operation due date</Label><Input id="operation-due" name="due_date" type="date" defaultValue={operation?.due_date ?? ""} /><p className="text-xs text-muted-foreground">Blank uses the job due date.</p></div>
                <div className="col-span-2 space-y-1.5"><Label htmlFor="operation-progress">Work completed (%)</Label><Input key={status === "complete" ? "complete" : "editable"} id="operation-progress" name="progress_percent" type="number" min={0} max={99} step={1} disabled={status === "complete"} defaultValue={status === "complete" ? 100 : operation?.progress_percent === 100 ? "" : operation?.progress_percent ?? ""} placeholder="Not assessed" /><p className="text-xs text-muted-foreground">Leave blank if unknown. Complete status records 100%. Hours used do not set progress.</p></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="operation-blocker">Blocker reason (optional)</Label><Input id="operation-blocker" name="blocker_reason" maxLength={1000} defaultValue={operation?.blocker_reason ?? ""} placeholder="e.g. Waiting for approved drawings" /></div>
            {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || (!operation && (isLoading || !!error || !jobs?.length))}>{saving ? "Saving…" : "Save operation"}</Button></div>
        </form>
    </DialogContent></Dialog>
}
