"use client"

import { useEffect, useMemo, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Trash2, Layers, Search } from "lucide-react"
import { toast } from "sonner"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { NumCell, TextCell, SupplierCell } from "@/components/costing/cells"
import type { Material } from "@/types/database"

const SUPPLIER_LIST_ID = "catalogue-suppliers-dl"
const today = () => new Date().toISOString().slice(0, 10)

export default function CataloguePage() {
    const supabase = useMemo(() => createClient(), [])
    const [materials, setMaterials] = useState<Material[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [supplier, setSupplier] = useState("all")
    const [deleteTarget, setDeleteTarget] = useState<Material | null>(null)

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

    const filtered = materials.filter((m) => {
        if (supplier !== "all" && (m.supplier ?? "") !== supplier) return false
        if (search.trim()) {
            const q = search.toLowerCase()
            return m.description.toLowerCase().includes(q) || (m.code ?? "").toLowerCase().includes(q)
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
                </div>

                {loading ? (
                    <div className="h-40 rounded-lg bg-muted/40 animate-pulse mt-4" />
                ) : (
                    <div className="border border-border/60 rounded-lg overflow-x-auto mt-3">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-muted-foreground text-xs">
                                <tr className="text-left">
                                    <th className="font-medium px-2 py-2 w-24">Code</th>
                                    <th className="font-medium px-2 py-2 min-w-[260px]">Description</th>
                                    <th className="font-medium px-2 py-2 w-28">Supplier</th>
                                    <th className="font-medium px-2 py-2 w-40">Section</th>
                                    <th className="font-medium px-2 py-2 w-24 text-right">Unit cost</th>
                                    <th className="font-medium px-2 py-2 w-20 text-right" title="Markup on cost (0.5 = 50%)">Markup</th>
                                    <th className="font-medium px-2 py-2 w-20 text-right" title="LED module watts, or transformer capacity">Watts</th>
                                    <th className="font-medium px-2 py-2 w-28">Last checked</th>
                                    <th className="w-8"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((m) => (
                                    <tr key={m.id} className="border-t border-border/60 group">
                                        <td className="px-2 py-1"><TextCell value={m.code ?? ""} placeholder="—" onCommit={(v) => patch(m.id, { code: v || null })} /></td>
                                        <td className="px-2 py-1"><TextCell value={m.description} placeholder="Description" onCommit={(v) => patch(m.id, { description: v })} /></td>
                                        <td className="px-2 py-1"><SupplierCell value={m.supplier ?? ""} placeholder="—" listId={SUPPLIER_LIST_ID} onCommit={(v) => patch(m.id, { supplier: v || null })} /></td>
                                        <td className="px-2 py-1">
                                            <div className="text-xs text-muted-foreground truncate">{m.section}{m.subsection ? ` · ${m.subsection}` : ""}</div>
                                        </td>
                                        <td className="px-2 py-1"><NumCell value={m.unit_cost} onCommit={(v) => patch(m.id, { unit_cost: v ?? 0 })} /></td>
                                        <td className="px-2 py-1"><NumCell value={m.default_markup} step="0.05" onCommit={(v) => patch(m.id, { default_markup: v ?? 0 })} /></td>
                                        <td className="px-2 py-1"><NumCell value={m.watts} placeholder="—" onCommit={(v) => patch(m.id, { watts: v })} /></td>
                                        <td className="px-2 py-1 text-xs text-muted-foreground tabular-nums">{m.date_last_checked ?? m.check_note ?? "—"}</td>
                                        <td className="px-1 py-1 text-right">
                                            <button onClick={() => setDeleteTarget(m)} className="text-muted-foreground hover:text-destructive p-1 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete material">
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No materials match.</td></tr>
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
