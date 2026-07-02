"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, ChevronRight, Package2 } from "lucide-react"
import { toast } from "sonner"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { NumCell, TextCell } from "./cells"
import type { CostingJob, CostingItem, CostingLine } from "@/types/database"

const nz = (n: number) => n.toLocaleString("en-NZ", { style: "currency", currency: "NZD" })
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const lineCost = (l: CostingLine) => Number(l.qty) * Number(l.unit_cost)
const unitSell = (l: CostingLine) => l.unit_sell_override != null ? Number(l.unit_sell_override) : Number(l.unit_cost) * (1 + Number(l.markup))
const lineSell = (l: CostingLine) => Number(l.qty) * unitSell(l)

export function ItemsList({ job }: { job: CostingJob }) {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()
    const [items, setItems] = useState<CostingItem[]>([])
    const [lines, setLines] = useState<CostingLine[]>([])
    const [loading, setLoading] = useState(true)
    const [adjusted, setAdjusted] = useState(job.adjusted_total != null ? String(job.adjusted_total) : "")
    const [deleteTarget, setDeleteTarget] = useState<CostingItem | null>(null)
    const [products, setProducts] = useState<CostingItem[] | null>(null)
    const [productOpen, setProductOpen] = useState(false)

    async function reload() {
        const [{ data: its }, { data: ls }] = await Promise.all([
            supabase.from("costing_items").select("*").eq("job_id", job.id).order("sort"),
            supabase.from("costing_lines").select("id, item_id, qty, unit_cost, markup, unit_sell_override").eq("job_id", job.id),
        ])
        setItems((its as CostingItem[]) || [])
        setLines((ls as CostingLine[]) || [])
    }

    useEffect(() => {
        let active = true
        ;(async () => {
            const [{ data: its }, { data: ls }] = await Promise.all([
                supabase.from("costing_items").select("*").eq("job_id", job.id).order("sort"),
                supabase.from("costing_lines").select("id, item_id, qty, unit_cost, markup, unit_sell_override").eq("job_id", job.id),
            ])
            if (!active) return
            setItems((its as CostingItem[]) || [])
            setLines((ls as CostingLine[]) || [])
            setLoading(false)
        })()
        return () => { active = false }
    }, [supabase, job.id])

    // per-one cost/sell for an item
    function unit(it: CostingItem) {
        if (it.mode === "simple") return { cost: Number(it.unit_cost), sell: Number(it.unit_price) }
        const its = lines.filter((l) => l.item_id === it.id)
        return { cost: its.reduce((a, l) => a + lineCost(l), 0), sell: its.reduce((a, l) => a + lineSell(l), 0) }
    }

    const rows = items.map((it) => {
        const u = unit(it)
        const qty = Number(it.qty) || 1
        return { it, qty, unitCost: u.cost, unitSell: u.sell, totalCost: qty * u.cost, totalSell: qty * u.sell }
    })
    const jobCost = rows.reduce((a, r) => a + r.totalCost, 0)
    const jobSell = rows.reduce((a, r) => a + r.totalSell, 0)
    const margin = jobSell > 0 ? 1 - jobCost / jobSell : 0
    const adjustedNum = adjusted.trim() === "" ? jobSell : Number(adjusted) || jobSell
    const profit = adjustedNum - jobCost

    async function addItem(mode: "build" | "simple") {
        const maxSort = Math.max(0, ...items.map((i) => i.sort))
        const { data, error } = await supabase.from("costing_items")
            .insert({ job_id: job.id, name: "", mode, qty: 1, sort: maxSort + 1 })
            .select("*").single()
        if (error) return toast.error(error.message)
        const item = data as CostingItem
        setItems((p) => [...p, item])
        if (mode === "build") router.push(`/quoting/${job.id}/item/${item.id}`)
    }

    async function openProducts() {
        setProductOpen(true)
        if (products === null) {
            const { data: tpl } = await supabase.from("costing_jobs").select("id").eq("is_template", true).limit(1).maybeSingle()
            const { data } = tpl?.id
                ? await supabase.from("costing_items").select("*").eq("job_id", tpl.id).order("name")
                : { data: [] }
            setProducts((data as CostingItem[]) || [])
        }
    }

    async function addProduct(p: CostingItem) {
        setProductOpen(false)
        const { error } = await supabase.rpc("clone_costing_item", { src_item: p.id, target_job: job.id })
        if (error) return toast.error(error.message)
        toast.success(`Added "${p.name || "product"}"`)
        reload()
    }

    async function patchItem(id: string, patch: Partial<CostingItem>) {
        setItems((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i)))
        const { error } = await supabase.from("costing_items").update(patch).eq("id", id)
        if (error) toast.error(error.message)
    }

    async function confirmDelete() {
        if (!deleteTarget) return
        const id = deleteTarget.id
        setItems((p) => p.filter((i) => i.id !== id))
        setLines((p) => p.filter((l) => l.item_id !== id))
        setDeleteTarget(null)
        const { error } = await supabase.from("costing_items").delete().eq("id", id)
        if (error) toast.error(error.message)
    }

    async function saveAdjusted(value: string) {
        const num = value.trim() === "" ? null : Number(value)
        if (num != null && isNaN(num)) return
        await supabase.from("costing_jobs").update({ adjusted_total: num }).eq("id", job.id)
    }

    if (loading) return <div className="h-40 rounded-lg bg-muted/40 animate-pulse mt-6" />

    return (
        <div className="mt-6 space-y-5">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    Items in this job — signs with their own BOM (build), or simple cost lines (travel, freight…).
                </p>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" className="h-8 gap-1.5 text-xs" onClick={openProducts}>
                        <Package2 className="size-3.5" /> Add product
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => addItem("build")}>
                        <Plus className="size-3.5" /> Build item
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => addItem("simple")}>
                        <Plus className="size-3.5" /> Simple line
                    </Button>
                </div>
            </div>

            {rows.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-border/60 rounded-lg text-sm text-muted-foreground">
                    No items yet. Add a <strong>Build item</strong> (full BOM) or a <strong>Simple line</strong>.
                </div>
            ) : (
                <div className="border border-border/60 rounded-lg overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-muted-foreground text-xs">
                            <tr className="text-left">
                                <th className="font-medium px-3 py-2 min-w-[200px]">Item</th>
                                <th className="font-medium px-2 py-2 w-20">Type</th>
                                <th className="font-medium px-2 py-2 w-16 text-right">Qty</th>
                                <th className="font-medium px-2 py-2 w-28 text-right">Unit cost</th>
                                <th className="font-medium px-2 py-2 w-28 text-right">Unit sell</th>
                                <th className="font-medium px-2 py-2 w-28 text-right">Total</th>
                                <th className="font-medium px-2 py-2 w-16 text-right">Margin</th>
                                <th className="w-16"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(({ it, unitCost, unitSell: us, totalSell }) => {
                                const m = us > 0 ? 1 - unitCost / us : 0
                                const build = it.mode === "build"
                                return (
                                    <tr key={it.id} className="border-t border-border/60 group">
                                        <td className="px-3 py-1.5">
                                            <TextCell value={it.name} placeholder="Item name" onCommit={(v) => patchItem(it.id, { name: v })} />
                                        </td>
                                        <td className="px-2 py-1.5">
                                            <Badge variant="secondary" className={build ? "bg-violet-500/15 text-violet-600 dark:text-violet-300" : "bg-slate-500/15 text-slate-600 dark:text-slate-300"}>
                                                {build ? "Build" : "Simple"}
                                            </Badge>
                                        </td>
                                        <td className="px-2 py-1.5"><NumCell value={it.qty} onCommit={(v) => patchItem(it.id, { qty: v ?? 1 })} /></td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">
                                            {build ? nz(unitCost) : <NumCell value={Number(it.unit_cost)} onCommit={(v) => patchItem(it.id, { unit_cost: v ?? 0 })} />}
                                        </td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">
                                            {build ? nz(us) : <NumCell value={Number(it.unit_price)} onCommit={(v) => patchItem(it.id, { unit_price: v ?? 0 })} />}
                                        </td>
                                        <td className="px-2 py-1.5 text-right tabular-nums font-medium">{nz(totalSell)}</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{pct(m)}</td>
                                        <td className="px-1 py-1.5">
                                            <div className="flex items-center justify-end gap-0.5">
                                                {build && (
                                                    <button onClick={() => router.push(`/quoting/${job.id}/item/${it.id}`)}
                                                        className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline px-1" title="Open BOM">
                                                        BOM <ChevronRight className="size-3.5" />
                                                    </button>
                                                )}
                                                <button onClick={() => setDeleteTarget(it)}
                                                    className="text-muted-foreground hover:text-destructive p-1 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete item">
                                                    <Trash2 className="size-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Job totals */}
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                <Tile label="Cost" value={nz(jobCost)} />
                <Tile label="Sell" value={nz(jobSell)} />
                <Tile label="Margin" value={pct(margin)} />
                <div>
                    <label className="text-xs text-muted-foreground">Adjusted total (override)</label>
                    <input type="number" step="any" value={adjusted} placeholder={jobSell.toFixed(2)}
                        onChange={(e) => setAdjusted(e.target.value)} onBlur={(e) => saveAdjusted(e.target.value)}
                        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm tabular-nums" />
                </div>
                <Tile label="Profit" value={nz(profit)} className={profit < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"} />
            </div>

            <Dialog open={deleteTarget != null} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle>Delete this item?</DialogTitle>
                        <DialogDescription>
                            <strong>{deleteTarget?.name}</strong>{deleteTarget?.mode === "build" ? " and its BOM" : ""} will be
                            permanently deleted. This can&apos;t be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={confirmDelete}>Delete item</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={productOpen} onOpenChange={setProductOpen}>
                <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle>Add a product</DialogTitle>
                        <DialogDescription>Drops a saved product (with its full BOM) into this job as a new item you can then tweak.</DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[360px] overflow-y-auto -mx-1">
                        {products === null ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
                        ) : products.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">
                                No products yet. Build them under <strong>Quoting &amp; Costing → Products</strong>, or use “Save as product” on a build item.
                            </div>
                        ) : (
                            <ul className="divide-y divide-border/60">
                                {products.map((p) => (
                                    <li key={p.id}>
                                        <button type="button" onClick={() => addProduct(p)}
                                            className="w-full text-left px-3 py-2.5 hover:bg-muted/50 rounded-md flex items-center gap-2">
                                            <Package2 className="size-4 text-muted-foreground shrink-0" />
                                            <span className="flex-1 truncate">{p.name || <span className="italic text-muted-foreground">Untitled product</span>}</span>
                                            <span className="text-xs text-muted-foreground">{p.mode === "build" ? "Build" : "Simple"}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function Tile({ label, value, className = "" }: { label: string; value: string; className?: string }) {
    return (
        <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={`text-lg font-semibold tabular-nums mt-0.5 ${className}`}>{value}</div>
        </div>
    )
}
