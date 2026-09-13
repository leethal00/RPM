"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Plus, Trash2, ChevronRight, Package2, Download, RefreshCw, Search } from "lucide-react"
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

type XeroProduct = { id: string; code: string; name: string; description: string; sell: number; cost: number }

export default function ProductsPage() {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()
    const [templateId, setTemplateId] = useState<string | null>(null)
    const [products, setProducts] = useState<CostingItem[]>([])
    const [lines, setLines] = useState<CostingLine[]>([])
    const [loading, setLoading] = useState(true)
    const [deleteTarget, setDeleteTarget] = useState<CostingItem | null>(null)
    const [xeroItems, setXeroItems] = useState<XeroProduct[]>([])
    const [xeroLoading, setXeroLoading] = useState(false)
    const [xeroError, setXeroError] = useState("")
    const [search, setSearch] = useState("")
    const [importingId, setImportingId] = useState<string | null>(null)

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

    async function loadXeroItems() {
        setXeroLoading(true)
        setXeroError("")
        try {
            const response = await fetch("/api/xero/items", { cache: "no-store" })
            const body = await response.json()
            if (!response.ok) throw new Error(body?.error || "Could not load Xero items")
            setXeroItems((body?.items || []) as XeroProduct[])
        } catch (error) {
            setXeroError(error instanceof Error ? error.message : "Could not load Xero items")
        } finally {
            setXeroLoading(false)
        }
    }

    function totals(p: CostingItem) {
        if (p.mode === "simple") return { cost: Number(p.unit_cost), sell: Number(p.unit_price) }
        const ls = lines.filter((l) => l.item_id === p.id)
        const calculatedSell = ls.reduce((s, l) => s + lineSell(l), 0)
        const override = Number(p.unit_price || 0)
        return {
            cost: ls.reduce((s, l) => s + lineCost(l), 0),
            sell: override > 0 ? override : calculatedSell,
        }
    }

    async function addProduct() {
        if (!templateId) return
        const { data, error } = await supabase.from("costing_items")
            .insert({ job_id: templateId, name: "", mode: "build", qty: 1, sort: 0 }).select("*").single()
        if (error) return toast.error(error.message)
        router.push(`/quoting/${templateId}/item/${(data as CostingItem).id}`)
    }

    async function importXeroItem(xero: XeroProduct) {
        if (!templateId || importingId) return
        const existing = products.find((p) => (p.name || "").trim().toLowerCase() === (xero.name || xero.code).trim().toLowerCase())
        if (existing) {
            toast.info("An RPM product with this name already exists — opening it instead.")
            router.push(`/quoting/${templateId}/item/${existing.id}`)
            return
        }
        setImportingId(xero.id)
        const { data, error } = await supabase.from("costing_items").insert({
            job_id: templateId,
            name: xero.name || xero.code || "Xero item",
            details: xero.description || null,
            mode: "build",
            qty: 1,
            unit_cost: 0,
            unit_price: Number(xero.sell || 0),
            sort: 0,
        }).select("*").single()
        setImportingId(null)
        if (error) return toast.error(error.message)
        toast.success(`Imported "${xero.name || xero.code}" — add its permanent BOM now.`)
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

    const rpmNames = new Set(products.map((p) => (p.name || "").trim().toLowerCase()).filter(Boolean))
    const q = search.trim().toLowerCase()
    const filteredXero = xeroItems.filter((x) => !q || `${x.code} ${x.name} ${x.description}`.toLowerCase().includes(q))

    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader
                    icon={Package2}
                    kicker="Quoting & Costing"
                    title="Products"
                    description="Reusable products — build the BOM once, then reuse it in future quotes. Xero items can be imported here and upgraded into permanent RPM BOM products."
                    actions={<Button size="sm" className="gap-1.5 h-9" onClick={addProduct}><Plus className="size-3.5" /> New product</Button>}
                />

                {loading ? (
                    <div className="h-40 rounded-lg bg-muted/40 animate-pulse mt-6" />
                ) : (
                    <>
                        <div className="border border-border/60 rounded-lg overflow-x-auto mt-6">
                            <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-sm font-semibold">RPM Products</h2>
                                    <p className="text-xs text-muted-foreground mt-0.5">These are the permanent BOM-backed products used first by quote autocomplete.</p>
                                </div>
                            </div>
                            {products.length === 0 ? (
                                <div className="py-12 text-center text-sm text-muted-foreground">No RPM products yet.</div>
                            ) : (
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
                            )}
                        </div>

                        <div className="border border-border/60 rounded-lg overflow-hidden mt-6">
                            <div className="px-4 py-3 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                    <h2 className="text-sm font-semibold">Xero Items</h2>
                                    <p className="text-xs text-muted-foreground mt-0.5">Import a Xero item to turn it into a permanent RPM product with its own BOM.</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {xeroItems.length > 0 && (
                                        <div className="relative w-56">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                                            <Input className="h-8 pl-8 text-xs" placeholder="Search Xero items..." value={search} onChange={(e) => setSearch(e.target.value)} />
                                        </div>
                                    )}
                                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={loadXeroItems} disabled={xeroLoading}>
                                        <RefreshCw className={`size-3.5 ${xeroLoading ? "animate-spin" : ""}`} />
                                        {xeroItems.length ? "Refresh" : "Load Xero items"}
                                    </Button>
                                </div>
                            </div>
                            {xeroError ? (
                                <div className="px-4 py-4 text-sm text-red-600">{xeroError}</div>
                            ) : xeroItems.length === 0 ? (
                                <div className="py-10 text-center text-sm text-muted-foreground">Click <strong>Load Xero items</strong> to view items such as Safety Protocol.</div>
                            ) : filteredXero.length === 0 ? (
                                <div className="py-10 text-center text-sm text-muted-foreground">No Xero items match your search.</div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/40 text-muted-foreground text-xs">
                                        <tr className="text-left">
                                            <th className="font-medium px-4 py-2.5">Xero item</th>
                                            <th className="font-medium px-2 py-2.5 w-28 text-right">Sell</th>
                                            <th className="font-medium px-2 py-2.5 w-36"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredXero.map((x) => {
                                            const alreadyImported = rpmNames.has((x.name || x.code).trim().toLowerCase())
                                            return (
                                                <tr key={x.id} className="border-t border-border/60">
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium">{x.name || x.code}</div>
                                                        <div className="text-xs text-muted-foreground mt-0.5">{x.description || x.code || "Xero item"}</div>
                                                    </td>
                                                    <td className="px-2 py-3 text-right tabular-nums font-medium">{nz(Number(x.sell || 0))}</td>
                                                    <td className="px-2 py-3 text-right">
                                                        <Button size="sm" variant={alreadyImported ? "ghost" : "outline"} className="h-8 gap-1.5 text-xs"
                                                            disabled={importingId === x.id} onClick={() => importXeroItem(x)}>
                                                            <Download className="size-3.5" /> {alreadyImported ? "Open RPM product" : importingId === x.id ? "Importing..." : "Create RPM product"}
                                                        </Button>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
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
