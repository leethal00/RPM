"use client"

import { useEffect, useMemo, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Trash2, Layers, Search, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { NumCell, TextCell, SupplierCell } from "@/components/costing/cells"
import { useColumnLayout } from "@/lib/costing/use-column-layout"
import type { Material } from "@/types/database"

const SUPPLIER_LIST_ID = "catalogue-suppliers-dl"
const today = () => new Date().toISOString().slice(0, 10)

// Column definitions for the catalogue grid. Order + widths are user-adjustable
// (drag the header to reorder, drag its right edge to resize) and persisted.
interface ColMeta { key: string; label: string; width: number; min: number; align?: "right"; title?: string }
const COLUMNS: ColMeta[] = [
    { key: "code", label: "Code", width: 110, min: 70 },
    { key: "description", label: "Description", width: 300, min: 150 },
    { key: "supplier", label: "Supplier", width: 140, min: 90 },
    { key: "section", label: "Section", width: 170, min: 100 },
    { key: "unit_cost", label: "Unit cost", width: 100, min: 70, align: "right" },
    { key: "default_markup", label: "Markup", width: 90, min: 60, align: "right", title: "Markup on cost (0.5 = 50%)" },
    { key: "watts", label: "Watts", width: 84, min: 60, align: "right", title: "LED module watts, or transformer capacity" },
    { key: "mtr_weight", label: "kg/unit", width: 92, min: 60, align: "right", title: "Steel: kg per metre (per sheet for plate)" },
    { key: "date_last_checked", label: "Last checked", width: 120, min: 80 },
]
const COL_BY_KEY: Record<string, ColMeta> = Object.fromEntries(COLUMNS.map((c) => [c.key, c]))
const DEFAULT_LAYOUT = {
    order: COLUMNS.map((c) => c.key),
    widths: Object.fromEntries(COLUMNS.map((c) => [c.key, c.width])),
}

// Reorderable + resizable header cell.
function ColHeader({ col, width, onMove, onResize }: {
    col: ColMeta
    width: number
    onMove: (from: string, to: string) => void
    onResize: (key: string, w: number) => void
}) {
    const [over, setOver] = useState(false)

    function startResize(e: React.PointerEvent) {
        e.preventDefault()
        e.stopPropagation()
        const startX = e.clientX
        const startW = width
        const move = (ev: PointerEvent) => onResize(col.key, Math.max(col.min, startW + (ev.clientX - startX)))
        const up = () => {
            window.removeEventListener("pointermove", move)
            window.removeEventListener("pointerup", up)
            document.body.style.cursor = ""
        }
        window.addEventListener("pointermove", move)
        window.addEventListener("pointerup", up)
        document.body.style.cursor = "col-resize"
    }

    return (
        <th className="relative p-0 border-b border-border/60">
            <div
                draggable
                onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", col.key) }}
                onDragOver={(e) => { e.preventDefault(); setOver(true) }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); const from = e.dataTransfer.getData("text/plain"); if (from) onMove(from, col.key) }}
                title={col.title ?? "Drag to reorder"}
                className={`flex items-center px-2 py-2 cursor-move select-none ${col.align === "right" ? "justify-end" : ""} ${over ? "bg-primary/10" : ""}`}
            >
                <span className="truncate text-xs font-medium">{col.label}</span>
            </div>
            <div
                onPointerDown={startResize}
                onClick={(e) => e.stopPropagation()}
                title="Drag to resize"
                className="group/rs absolute top-0 -right-1.5 z-10 flex h-full w-3 cursor-col-resize touch-none items-center justify-center"
            >
                <span className="h-4 w-px bg-border group-hover/rs:bg-primary group-hover/rs:w-0.5" />
            </div>
        </th>
    )
}

export default function CataloguePage() {
    const supabase = useMemo(() => createClient(), [])
    const [materials, setMaterials] = useState<Material[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [supplier, setSupplier] = useState("all")
    const [deleteTarget, setDeleteTarget] = useState<Material | null>(null)
    const { order, widths, move, setWidth, reset } = useColumnLayout("catalogue-columns-v1", DEFAULT_LAYOUT)

    useEffect(() => {
        let active = true
        ;(async () => {
            const { data, error } = await supabase.from("materials").select("*")
                .order("supplier").order("section").order("description")
            if (!active) return
            if (error) toast.error(error.message)
            setMaterials((data as Material[]) || [])
            setLoading(false)
        })()
        return () => { active = false }
    }, [supabase])

    const suppliers = useMemo(
        () => Array.from(new Set(materials.map((m) => m.supplier).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
        [materials]
    )

    const tokens = search.toLowerCase().trim().split(/\s+/).filter(Boolean)
    const filtered = materials.filter((m) => {
        if (supplier !== "all" && (m.supplier ?? "") !== supplier) return false
        if (tokens.length) {
            // Order-independent: every typed word must appear in the description or code.
            const hay = `${m.description} ${m.code ?? ""}`.toLowerCase()
            return tokens.every((t) => hay.includes(t))
        }
        return true
    })

    async function patch(id: string, p: Partial<Material>) {
        // editing a price stamps "last checked" to today
        if ("unit_cost" in p) p = { ...p, date_last_checked: today() }
        setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, ...p } : m)))
        const { error } = await supabase.from("materials").update(p).eq("id", id)
        if (error) toast.error(error.message)
    }

    function renderCell(key: string, m: Material) {
        switch (key) {
            case "code": return <TextCell value={m.code ?? ""} placeholder="—" onCommit={(v) => patch(m.id, { code: v || null })} />
            case "description": return <TextCell value={m.description} placeholder="Description" onCommit={(v) => patch(m.id, { description: v })} />
            case "supplier": return <SupplierCell value={m.supplier ?? ""} placeholder="—" listId={SUPPLIER_LIST_ID} onCommit={(v) => patch(m.id, { supplier: v || null })} />
            case "section": return <div className="text-xs text-muted-foreground truncate">{m.section}{m.subsection ? ` · ${m.subsection}` : ""}</div>
            case "unit_cost": return <NumCell value={m.unit_cost} onCommit={(v) => patch(m.id, { unit_cost: v ?? 0 })} />
            case "default_markup": return <NumCell value={m.default_markup} step="0.05" onCommit={(v) => patch(m.id, { default_markup: v ?? 0 })} />
            case "watts": return m.section === "Wiring - LED"
                ? <NumCell value={m.watts} placeholder="—" onCommit={(v) => patch(m.id, { watts: v })} />
                : <span className="text-muted-foreground/40 pl-1.5">—</span>
            case "mtr_weight": return m.section === "Steel"
                ? <NumCell value={m.mtr_weight} placeholder="—" onCommit={(v) => patch(m.id, { mtr_weight: v })} />
                : <span className="text-muted-foreground/40 pl-1.5">—</span>
            case "date_last_checked": return <div className="text-xs text-muted-foreground tabular-nums truncate">{m.date_last_checked ?? m.check_note ?? "—"}</div>
            default: return null
        }
    }

    const tableWidth = order.reduce((s, k) => s + (widths[k] ?? 100), 0) + 44 // + actions col

    async function addMaterial() {
        const payload = { description: "", section: "Materials", default_markup: 0.5, unit_cost: 0, active: true,
            supplier: supplier !== "all" ? supplier : null }
        const { data, error } = await supabase.from("materials").insert(payload).select("*").single()
        if (error) return toast.error(error.message)
        setMaterials((prev) => [data as Material, ...prev])
    }

    async function confirmDelete() {
        if (!deleteTarget) return
        const id = deleteTarget.id
        setMaterials((prev) => prev.filter((m) => m.id !== id))
        setDeleteTarget(null)
        const { error } = await supabase.from("materials").delete().eq("id", id)
        if (error) toast.error(error.message)
    }

    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader
                    icon={Layers}
                    kicker="Quoting & Costing"
                    title="Catalogue"
                    description="Priced materials & labour. Filter by supplier to update prices in bulk when a supplier reprices."
                    actions={
                        <Button size="sm" className="gap-1.5 h-9" onClick={addMaterial}>
                            <Plus className="size-3.5" /> Add material
                        </Button>
                    }
                />

                <datalist id={SUPPLIER_LIST_ID}>{suppliers.map((s) => <option key={s} value={s} />)}</datalist>

                <div className="flex items-center gap-2 mt-4">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                        <Input placeholder="Search code or description…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
                    </div>
                    <select value={supplier} onChange={(e) => setSupplier(e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring">
                        <option value="all">All suppliers</option>
                        {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <span className="text-xs text-muted-foreground tabular-nums ml-auto">{filtered.length} item{filtered.length === 1 ? "" : "s"}</span>
                    <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-xs text-muted-foreground" onClick={reset} title="Reset column order and widths">
                        <RotateCcw className="size-3.5" /> Reset columns
                    </Button>
                </div>

                {loading ? (
                    <div className="h-40 rounded-lg bg-muted/40 animate-pulse mt-4" />
                ) : (
                    <div className="border border-border/60 rounded-lg overflow-x-auto mt-3">
                        <table className="text-sm table-fixed min-w-full" style={{ width: tableWidth }}>
                            <colgroup>
                                {order.map((k) => <col key={k} style={{ width: widths[k] }} />)}
                                <col style={{ width: 44 }} />
                                <col />
                            </colgroup>
                            <thead className="bg-muted/40 text-muted-foreground">
                                <tr className="text-left">
                                    {order.map((k) => (
                                        <ColHeader key={k} col={COL_BY_KEY[k]} width={widths[k] ?? COL_BY_KEY[k].width} onMove={move} onResize={setWidth} />
                                    ))}
                                    <th className="border-b border-border/60" />
                                    <th className="border-b border-border/60" />
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((m) => (
                                    <tr key={m.id} className="border-t border-border/60 group">
                                        {order.map((k) => (
                                            <td key={k} className="px-2 py-1 overflow-hidden">{renderCell(k, m)}</td>
                                        ))}
                                        <td className="px-1 py-1 text-right">
                                            <button onClick={() => setDeleteTarget(m)} className="text-muted-foreground hover:text-destructive p-1 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete material">
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </td>
                                        <td />
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr><td colSpan={order.length + 2} className="px-3 py-8 text-center text-muted-foreground">No materials match.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                <p className="text-xs text-muted-foreground mt-3">
                    Tip: pick a supplier above, then edit their unit costs — each edit stamps today&apos;s date.
                    Bulk price-list upload is coming once item codes are in (matched on code).
                </p>

                <Dialog open={deleteTarget != null} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
                    <DialogContent className="sm:max-w-[440px]">
                        <DialogHeader>
                            <DialogTitle>Delete this material?</DialogTitle>
                            <DialogDescription>
                                <strong>{deleteTarget?.description || "This item"}</strong> will be removed from the catalogue.
                                Existing job lines that used it keep their values. This can&apos;t be undone.
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
