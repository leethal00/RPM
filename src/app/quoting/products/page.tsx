"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, ChevronRight, Package2 } from "lucide-react"
import { toast } from "sonner"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import type { CostingItem, CostingLine } from "@/types/database"

const nz = (n: number) => n.toLocaleString("en-NZ", { style: "currency", currency: "NZD" })
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const lineCost = (l: CostingLine) => Number(l.qty) * Number(l.unit_cost)
const unitSell = (l: CostingLine) => l.unit_sell_override != null ? Number(l.unit_sell_override) : Number(l.unit_cost) * (1 + Number(l.markup))
const lineSell = (l: CostingLine) => Number(l.qty) * unitSell(l)

export default function ProductsPage() {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()
    const [templateId, setTemplateId] = useState<string | null>(null)
    const [products, setProducts] = useState<CostingItem[]>([])
    const [lines, setLines] = useState<CostingLine[]>([])
    const [loading, setLoading] = useState(true)
    const [deleteTarget, setDeleteTarget] = useState<CostingItem | null>(null)

    useEffect(() => {
        let active = true
        ;(async () => {
            const { data: job } = await supabase.from("costing_jobs").select("id").eq("is_template", true).limit(1).maybeSingle()
            const tId = job?.id ?? null
            if (!active) return
            setTemplateId(tId)
            if (tId) {
                const [{ data: its }, { data: ls }] = await Promise.all([
                    supabase.from("costing_items").select("*").eq("job_id", tId).order("name"),
                    supabase.from("costing_lines").select("id, item_id, qty, unit_cost, markup, unit_sell_override").eq("job_id", tId),
                ])
                if (!active) return
                setProducts((its as CostingItem[]) || [])
                setLines((ls as CostingLine[]) || [])
            }
            setLoading(false)
        })()
        return () => { active = false }
    }, [supabase])

    function totals(p: CostingItem) {
        if (p.mode === "simple") return { cost: Number(p.unit_cost), sell: Number(p.unit_price) }
        const ls = lines.filter((l) => l.item_id === p.id)
        return { cost: ls.reduce((s, l) => s + lineCost(l), 0), sell: ls.reduce((s, l) => s + lineSell(l), 0) }
    }

    async function addProduct() {
        if (!templateId) return
        const { data, error } = await supabase.from("costing_items")
            .insert({ job_id: templateId, name: "", mode: "build", qty: 1, sort: 0 }).select("*").single()
        if (error) return toast.error(error.message)
        router.push(`/quoting/${templateId}/item/${(data as CostingItem).id}`)
    }

    async function confirmDelete() {
        if (!deleteTarget) return
        const id = deleteTarget.id
        setProducts((p) => p.filter((x) => x.id !== id))
        setDeleteTarget(null)
        const { error } = await supabase.from("costing_items").delete().eq("id", id)
        if (error) toast.error(error.message)
    }

    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader
                    icon={Package2}
                    kicker="Quoting & Costing"
                    title="Products"
                    description="Reusable products — a whole build (materials, labour) saved once, then dropped into a job's items in one click."
                    actions={<Button size="sm" className="gap-1.5 h-9" onClick={addProduct}><Plus className="size-3.5" /> New product</Button>}
                />

                {loading ? (
                    <div className="h-40 rounded-lg bg-muted/40 animate-pulse mt-6" />
                ) : products.length === 0 ? (
                    <div className="py-16 text-center border border-dashed border-border/60 rounded-lg mt-6">
                        <div className="size-12 bg-muted/40 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Package2 className="size-5 text-muted-foreground" />
                        </div>
                        <h3 className="text-base font-medium text-foreground">No products yet</h3>
                        <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                            Build a product here, or save one from any job item via &quot;Save as product&quot;.
                        </p>
                        <Button variant="outline" size="sm" className="mt-4" onClick={addProduct}>Create first product</Button>
                    </div>
                ) : (
                    <div className="border border-border/60 rounded-lg overflow-x-auto mt-6">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-muted-foreground text-xs">
                                <tr className="text-left">
                                    <th className="font-medium px-4 py-2.5 min-w-[220px]">Product</th>
                                    <th className="font-medium px-2 py-2.5 w-20">Type</th>
                                    <th className="font-medium px-2 py-2.5 w-28 text-right">Cost</th>
                                    <th className="font-medium px-2 py-2.5 w-28 text-right">Sell</th>
                                    <th className="font-medium px-2 py-2.5 w-16 text-right">Margin</th>
                                    <th className="w-24"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((p) => {
                                    const t = totals(p)
                                    const m = t.sell > 0 ? 1 - t.cost / t.sell : 0
                                    return (
                                        <tr key={p.id} onClick={() => router.push(`/quoting/${templateId}/item/${p.id}`)}
                                            className="border-t border-border/60 cursor-pointer hover:bg-muted/30 transition-colors group">
                                            <td className="px-4 py-3 font-medium">{p.name || <span className="italic text-muted-foreground">Untitled product</span>}</td>
                                            <td className="px-2 py-3">
                                                <Badge variant="secondary" className={p.mode === "build" ? "bg-violet-500/15 text-violet-600 dark:text-violet-300" : "bg-slate-500/15 text-slate-600 dark:text-slate-300"}>
                                                    {p.mode === "build" ? "Build" : "Simple"}
                                                </Badge>
                                            </td>
                                            <td className="px-2 py-3 text-right tabular-nums text-muted-foreground">{nz(t.cost)}</td>
                                            <td className="px-2 py-3 text-right tabular-nums font-medium">{nz(t.sell)}</td>
                                            <td className="px-2 py-3 text-right tabular-nums text-muted-foreground">{pct(m)}</td>
                                            <td className="px-2 py-3">
                                                <div className="flex items-center justify-end gap-1">
                                                    <span className="inline-flex items-center gap-0.5 text-xs text-primary">Edit <ChevronRight className="size-3.5" /></span>
                                                    <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(p) }}
                                                        className="text-muted-foreground hover:text-destructive p-1 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete product">
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

                <Dialog open={deleteTarget != null} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
                    <DialogContent className="sm:max-w-[440px]">
                        <DialogHeader>
                            <DialogTitle>Delete this product?</DialogTitle>
                            <DialogDescription>
                                <strong>{deleteTarget?.name || "This product"}</strong> and its saved BOM will be removed from the
                                library. Jobs that already used it keep their copy. This can&apos;t be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </PageShell>
        </DashboardLayout>
    )
}
