"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, Clock, Package } from "lucide-react"
import { toast } from "sonner"
import { NumCell, TextCell, DateCell } from "./cells"
import type { CostingJob, CostingTimeEntry, CostingMaterialActual } from "@/types/database"

const nz = (n: number) => n.toLocaleString("en-NZ", { style: "currency", currency: "NZD" })

export function CostingActuals({ job }: { job: CostingJob }) {
    const supabase = useMemo(() => createClient(), [])
    const [time, setTime] = useState<CostingTimeEntry[]>([])
    const [mats, setMats] = useState<CostingMaterialActual[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let active = true
        ;(async () => {
            const [{ data: t }, { data: m }] = await Promise.all([
                supabase.from("costing_time_entries").select("*").eq("job_id", job.id).order("work_date").order("created_at"),
                supabase.from("costing_material_actuals").select("*").eq("job_id", job.id).order("order_date").order("created_at"),
            ])
            if (!active) return
            setTime((t as CostingTimeEntry[]) || [])
            setMats((m as CostingMaterialActual[]) || [])
            setLoading(false)
        })()
        return () => { active = false }
    }, [supabase, job.id])

    // ── time entries ─────────────────────────────────────────────
    async function addTime() {
        const { data, error } = await supabase.from("costing_time_entries")
            .insert({ job_id: job.id, hours: 0 }).select("*").single()
        if (error) return toast.error(error.message)
        setTime((p) => [...p, data as CostingTimeEntry])
    }
    async function patchTime(id: string, patch: Partial<CostingTimeEntry>) {
        setTime((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)))
        const { error } = await supabase.from("costing_time_entries").update(patch).eq("id", id)
        if (error) toast.error(error.message)
    }
    async function delTime(id: string) {
        setTime((p) => p.filter((r) => r.id !== id))
        const { error } = await supabase.from("costing_time_entries").delete().eq("id", id)
        if (error) toast.error(error.message)
    }

    // ── material actuals ─────────────────────────────────────────
    async function addMat() {
        const { data, error } = await supabase.from("costing_material_actuals")
            .insert({ job_id: job.id }).select("*").single()
        if (error) return toast.error(error.message)
        setMats((p) => [...p, data as CostingMaterialActual])
    }
    async function patchMat(id: string, patch: Partial<CostingMaterialActual>) {
        setMats((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)))
        const { error } = await supabase.from("costing_material_actuals").update(patch).eq("id", id)
        if (error) toast.error(error.message)
    }
    async function delMat(id: string) {
        setMats((p) => p.filter((r) => r.id !== id))
        const { error } = await supabase.from("costing_material_actuals").delete().eq("id", id)
        if (error) toast.error(error.message)
    }

    const totalHours = time.reduce((s, r) => s + Number(r.hours), 0)
    const totalMatCost = mats.reduce((s, r) => s + (Number(r.qty ?? 1) * Number(r.cost ?? 0)), 0)

    if (loading) return <div className="h-40 rounded-lg bg-muted/40 animate-pulse mt-6" />

    return (
        <div className="mt-6 space-y-6">
            <p className="text-sm text-muted-foreground">
                Log what actually happened on the job — hours worked and materials bought. These feed the
                Estimated vs Actual comparison. (This is the data the printed job card currently captures by hand.)
            </p>

            {/* Time */}
            <section className="rounded-lg border border-border/60 overflow-hidden">
                <div className="flex items-center justify-between bg-muted/40 px-4 py-2.5">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5"><Clock className="size-3.5" /> Time worked</h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground tabular-nums">{totalHours.toFixed(2)} hrs</span>
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={addTime}><Plus className="size-3" /> Add</Button>
                    </div>
                </div>
                {time.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-muted-foreground text-xs">
                                <tr className="text-left border-b border-border/60">
                                    <th className="font-medium px-3 py-2 w-36">Date</th>
                                    <th className="font-medium px-2 py-2 w-40">Person</th>
                                    <th className="font-medium px-2 py-2 w-20 text-right">Hours</th>
                                    <th className="font-medium px-2 py-2">Description</th>
                                    <th className="w-8"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {time.map((r) => (
                                    <tr key={r.id} className="border-b border-border/40 last:border-0 group">
                                        <td className="px-3 py-1"><DateCell value={r.work_date} onCommit={(v) => patchTime(r.id, { work_date: v })} /></td>
                                        <td className="px-2 py-1"><TextCell value={r.person_name ?? ""} placeholder="Name" onCommit={(v) => patchTime(r.id, { person_name: v || null })} /></td>
                                        <td className="px-2 py-1"><NumCell value={r.hours} onCommit={(v) => patchTime(r.id, { hours: v ?? 0 })} /></td>
                                        <td className="px-2 py-1"><TextCell value={r.description ?? ""} placeholder="What was done" onCommit={(v) => patchTime(r.id, { description: v || null })} /></td>
                                        <td className="px-1 py-1 text-right">
                                            <button onClick={() => delTime(r.id)} className="text-muted-foreground hover:text-destructive p-1 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete"><Trash2 className="size-3.5" /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Materials */}
            <section className="rounded-lg border border-border/60 overflow-hidden">
                <div className="flex items-center justify-between bg-muted/40 px-4 py-2.5">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5"><Package className="size-3.5" /> Materials bought</h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground tabular-nums">{nz(totalMatCost)}</span>
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={addMat}><Plus className="size-3" /> Add</Button>
                    </div>
                </div>
                {mats.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-muted-foreground text-xs">
                                <tr className="text-left border-b border-border/60">
                                    <th className="font-medium px-3 py-2 w-36">Date</th>
                                    <th className="font-medium px-2 py-2 w-32">Supplier</th>
                                    <th className="font-medium px-2 py-2">Description</th>
                                    <th className="font-medium px-2 py-2 w-16 text-right">Qty</th>
                                    <th className="font-medium px-2 py-2 w-24 text-right">Unit cost</th>
                                    <th className="font-medium px-2 py-2 w-24 text-right">Total</th>
                                    <th className="w-8"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {mats.map((r) => (
                                    <tr key={r.id} className="border-b border-border/40 last:border-0 group">
                                        <td className="px-3 py-1"><DateCell value={r.order_date} onCommit={(v) => patchMat(r.id, { order_date: v })} /></td>
                                        <td className="px-2 py-1"><TextCell value={r.supplier ?? ""} placeholder="Supplier" onCommit={(v) => patchMat(r.id, { supplier: v || null })} /></td>
                                        <td className="px-2 py-1"><TextCell value={r.description ?? ""} placeholder="Item" onCommit={(v) => patchMat(r.id, { description: v || null })} /></td>
                                        <td className="px-2 py-1"><NumCell value={r.qty} placeholder="1" onCommit={(v) => patchMat(r.id, { qty: v })} /></td>
                                        <td className="px-2 py-1"><NumCell value={r.cost} onCommit={(v) => patchMat(r.id, { cost: v })} /></td>
                                        <td className="px-2 py-1 text-right tabular-nums">{nz(Number(r.qty ?? 1) * Number(r.cost ?? 0))}</td>
                                        <td className="px-1 py-1 text-right">
                                            <button onClick={() => delMat(r.id)} className="text-muted-foreground hover:text-destructive p-1 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete"><Trash2 className="size-3.5" /></button>
                                        </td>
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
