"use client"

import { useEffect, useMemo, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Trash2, Layers, Search, RotateCcw, ListTree, X, GripVertical } from "lucide-react"
import { toast } from "sonner"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { NumCell, TextCell, SupplierCell } from "@/components/costing/cells"
import { useColumnLayout } from "@/lib/costing/use-column-layout"
import type { CostingSection, Material } from "@/types/database"

const SUPPLIER_LIST_ID = "catalogue-suppliers-dl"
const today = () => new Date().toISOString().slice(0, 10)

interface ColMeta { key: string; label: string; width: number; min: number; align?: "right"; title?: string }
const COLUMNS: ColMeta[] = [
    { key: "code", label: "Code", width: 110, min: 70 },
    { key: "description", label: "Description", width: 300, min: 150 },
    { key: "supplier", label: "Supplier", width: 140, min: 90 },
    { key: "section", label: "Section", width: 150, min: 100 },
    { key: "subsection", label: "Subsection", width: 150, min: 100 },
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
    const [sections, setSections] = useState<CostingSection[]>([])
    const [newSectionFor, setNewSectionFor] = useState<Material | null>(null)
    const [newSectionOpen, setNewSectionOpen] = useState(false)
    const [newSectionName, setNewSectionName] = useState("")
    const [creatingSection, setCreatingSection] = useState(false)
    const [addingSubsectionFor, setAddingSubsectionFor] = useState<string | null>(null)
    const [newSubsectionName, setNewSubsectionName] = useState("")
    const [activeTab, setActiveTab] = useState("catalogue")
    const [draggingSubsectionId, setDraggingSubsectionId] = useState<number | null>(null)
    const [dragOverSection, setDragOverSection] = useState<string | null>(null)
    const { order, widths, move, setWidth, reset } = useColumnLayout("catalogue-columns-v1", DEFAULT_LAYOUT)

    useEffect(() => {
        let active = true
        ;(async () => {
            const [{ data, error }, { data: sectionData, error: sectionError }] = await Promise.all([
                supabase.from("materials").select("*").order("supplier").order("section").order("description"),
                supabase.from("costing_sections").select("*").order("sort").order("section"),
            ])
            if (!active) return
            if (error) toast.error(error.message)
            if (sectionError) toast.error(sectionError.message)
            setMaterials((data as Material[]) || [])
            setSections((sectionData as CostingSection[]) || [])
            setLoading(false)
        })()
        return () => { active = false }
    }, [supabase])

    const suppliers = useMemo(
        () => Array.from(new Set(materials.map((m) => m.supplier).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
        [materials]
    )
    const sectionNames = useMemo(() => {
        const defined = sections.map((s) => s.section)
        const inUse = materials.map((m) => m.section).filter(Boolean)
        return Array.from(new Set([...defined, ...inUse]))
    }, [materials, sections])
    const sectionGroups = useMemo(() => sectionNames.map((name) => ({
        name,
        subsections: sections.filter((section) => section.section === name && section.subsection)
            .sort((a, b) => a.sort - b.sort),
    })), [sectionNames, sections])

    const tokens = search.toLowerCase().trim().split(/\s+/).filter(Boolean)
    const filtered = materials.filter((m) => {
        if (supplier !== "all" && (m.supplier ?? "") !== supplier) return false
        if (tokens.length) {
            const hay = `${m.description} ${m.code ?? ""}`.toLowerCase()
            return tokens.every((t) => hay.includes(t))
        }
        return true
    })

    async function patch(id: string, p: Partial<Material>) {
        if ("unit_cost" in p) p = { ...p, date_last_checked: today() }
        setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, ...p } : m)))
        const { error } = await supabase.from("materials").update(p).eq("id", id)
        if (error) toast.error(error.message)
    }

    function chooseSection(material: Material, value: string) {
        if (value === "__create__") {
            setNewSectionFor(material)
            setNewSectionName("")
            setNewSectionOpen(true)
            return
        }
        if (value !== material.section) patch(material.id, { section: value, subsection: null })
    }

    function openCreateSection() {
        setNewSectionFor(null)
        setNewSectionName("")
        setNewSectionOpen(true)
    }

    async function createSection() {
        const name = newSectionName.trim()
        if (!name) return

        const existing = sectionNames.find((section) => section.localeCompare(name, undefined, { sensitivity: "accent" }) === 0)
        if (existing) {
            if (newSectionFor) await patch(newSectionFor.id, { section: existing })
            else toast.error(`“${existing}” already exists`)
            setNewSectionOpen(false)
            setNewSectionName("")
            return
        }

        setCreatingSection(true)
        const nextSort = Math.max(0, ...sections.map((section) => section.sort)) + 100
        const { data, error } = await supabase.from("costing_sections")
            .insert({ section: name, subsection: null, sort: nextSort }).select("*").single()
        if (error) {
            setCreatingSection(false)
            return toast.error(error.message)
        }

        setSections((prev) => [...prev, data as CostingSection])
        if (newSectionFor) await patch(newSectionFor.id, { section: name })
        setCreatingSection(false)
        setNewSectionOpen(false)
        setNewSectionFor(null)
        setNewSectionName("")
        toast.success(`Section “${name}” created`)
    }

    async function renameSection(oldName: string, value: string) {
        const name = value.trim()
        if (!name || name === oldName) return
        if (sectionNames.some((section) => section !== oldName && section.localeCompare(name, undefined, { sensitivity: "accent" }) === 0)) {
            return toast.error(`“${name}” already exists`)
        }

        const results = await Promise.all([
            supabase.from("costing_sections").update({ section: name }).eq("section", oldName),
            supabase.from("materials").update({ section: name }).eq("section", oldName),
            supabase.from("costing_lines").update({ section: name }).eq("section", oldName),
        ])
        const error = results.find((result) => result.error)?.error
        if (error) return toast.error(error.message)

        setSections((prev) => prev.map((section) => section.section === oldName ? { ...section, section: name } : section))
        setMaterials((prev) => prev.map((material) => material.section === oldName ? { ...material, section: name } : material))
        toast.success(`Section renamed to “${name}”`)
    }

    async function addSubsection(sectionName: string) {
        const name = newSubsectionName.trim()
        if (!name) return
        const duplicate = sections.some((section) => section.section === sectionName &&
            (section.subsection ?? "").localeCompare(name, undefined, { sensitivity: "accent" }) === 0)
        if (duplicate) return toast.error(`“${name}” already exists in ${sectionName}`)

        const sectionSorts = sections.filter((section) => section.section === sectionName).map((section) => section.sort)
        const nextSort = Math.max(0, ...sectionSorts) + 10
        const { data, error } = await supabase.from("costing_sections")
            .insert({ section: sectionName, subsection: name, sort: nextSort }).select("*").single()
        if (error) return toast.error(error.message)

        setSections((prev) => [...prev, data as CostingSection])
        setAddingSubsectionFor(null)
        setNewSubsectionName("")
        toast.success(`Subsection “${name}” added`)
    }

    async function renameSubsection(record: CostingSection, value: string) {
        const name = value.trim()
        const oldName = record.subsection
        if (!name || !oldName || name === oldName) return
        const duplicate = sections.some((section) => section.id !== record.id && section.section === record.section &&
            (section.subsection ?? "").localeCompare(name, undefined, { sensitivity: "accent" }) === 0)
        if (duplicate) return toast.error(`“${name}” already exists in ${record.section}`)

        const results = await Promise.all([
            supabase.from("costing_sections").update({ subsection: name }).eq("id", record.id),
            supabase.from("materials").update({ subsection: name }).eq("section", record.section).eq("subsection", oldName),
            supabase.from("costing_lines").update({ subsection: name }).eq("section", record.section).eq("subsection", oldName),
        ])
        const error = results.find((result) => result.error)?.error
        if (error) return toast.error(error.message)

        setSections((prev) => prev.map((section) => section.id === record.id ? { ...section, subsection: name } : section))
        setMaterials((prev) => prev.map((material) => material.section === record.section && material.subsection === oldName
            ? { ...material, subsection: name } : material))
        toast.success(`Subsection renamed to “${name}”`)
    }

    async function moveSubsection(record: CostingSection, targetSection: string) {
        const subsection = record.subsection
        if (!subsection || record.section === targetSection) return
        const duplicate = sections.some((section) => section.id !== record.id && section.section === targetSection &&
            (section.subsection ?? "").localeCompare(subsection, undefined, { sensitivity: "accent" }) === 0)
        if (duplicate) {
            setDraggingSubsectionId(null)
            setDragOverSection(null)
            return toast.error(`“${subsection}” already exists in ${targetSection}`)
        }

        const targetSorts = sections.filter((section) => section.section === targetSection).map((section) => section.sort)
        const nextSort = Math.max(0, ...targetSorts) + 10
        const results = await Promise.all([
            supabase.from("costing_sections").update({ section: targetSection, sort: nextSort }).eq("id", record.id),
            supabase.from("materials").update({ section: targetSection }).eq("section", record.section).eq("subsection", subsection),
            supabase.from("costing_lines").update({ section: targetSection }).eq("section", record.section).eq("subsection", subsection),
        ])
        const error = results.find((result) => result.error)?.error
        setDraggingSubsectionId(null)
        setDragOverSection(null)
        if (error) return toast.error(error.message)

        setSections((prev) => prev.map((section) => section.id === record.id
            ? { ...section, section: targetSection, sort: nextSort } : section))
        setMaterials((prev) => prev.map((material) => material.section === record.section && material.subsection === subsection
            ? { ...material, section: targetSection } : material))
        toast.success(`Moved “${subsection}” to ${targetSection}`)
    }

    function renderCell(key: string, m: Material) {
        switch (key) {
            case "code": return <TextCell value={m.code ?? ""} placeholder="—" onCommit={(v) => patch(m.id, { code: v || null })} />
            case "description": return <TextCell value={m.description} placeholder="Description" onCommit={(v) => patch(m.id, { description: v })} />
            case "supplier": return <SupplierCell value={m.supplier ?? ""} placeholder="—" listId={SUPPLIER_LIST_ID} onCommit={(v) => patch(m.id, { supplier: v || null })} />
            case "section": return (
                <select
                    value={m.section ?? "Materials"}
                    onChange={(e) => chooseSection(m, e.target.value)}
                    className="w-full rounded border border-transparent hover:border-input focus:border-input bg-transparent px-1.5 py-1 text-sm outline-none"
                    aria-label={`Section for ${m.description || "catalogue item"}`}
                >
                    {sectionNames.map((section) => <option key={section} value={section}>{section}</option>)}
                    <option disabled>──────────</option>
                    <option value="__create__">+ Create new section…</option>
                </select>
            )
            case "subsection": {
                const options = sections
                    .filter((section) => section.section === (m.section ?? "Materials") && section.subsection)
                    .sort((a, b) => a.sort - b.sort)
                return (
                    <select
                        value={m.subsection ?? ""}
                        onChange={(e) => patch(m.id, { subsection: e.target.value || null })}
                        className="w-full rounded border border-transparent hover:border-input focus:border-input bg-transparent px-1.5 py-1 text-sm outline-none"
                        aria-label={`Subsection for ${m.description || "catalogue item"}`}
                    >
                        <option value="">—</option>
                        {options.map((section) => (
                            <option key={section.id} value={section.subsection ?? ""}>{section.subsection}</option>
                        ))}
                    </select>
                )
            }
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

    const tableWidth = order.reduce((s, k) => s + (widths[k] ?? 100), 0) + 44

    async function addMaterial() {
        setSearch("")
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
                    title="Catalogue & Sections"
                    description="Manage priced materials, labour, and the sections used throughout quoting and costing."
                    actions={activeTab === "catalogue" ? (
                        <Button size="sm" className="gap-1.5 h-9" onClick={addMaterial}>
                            <Plus className="size-3.5" /> Add material
                        </Button>
                    ) : undefined}
                />

                <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
                    <TabsList>
                        <TabsTrigger value="catalogue" className="gap-1.5 px-4">
                            <Layers className="size-3.5" /> Catalogue Items
                        </TabsTrigger>
                        <TabsTrigger value="sections" className="gap-1.5 px-4">
                            <ListTree className="size-3.5" /> Sections
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="catalogue" className="mt-2">
                        <datalist id={SUPPLIER_LIST_ID}>{suppliers.map((s) => <option key={s} value={s} />)}</datalist>

                <div className="flex items-center gap-2 mt-2">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Search code or description…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-8 pr-9 h-9"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    setSearch("")
                                    const input = e.currentTarget.previousElementSibling as HTMLInputElement | null
                                    input?.focus()
                                }}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                title="Clear search"
                                aria-label="Clear catalogue search"
                            >
                                <X className="size-3.5" />
                            </button>
                        )}
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
                    <div className="border border-border/60 rounded-lg max-h-[46vh] overflow-auto mt-3">
                        <table className="text-sm table-fixed min-w-full" style={{ width: tableWidth }}>
                            <colgroup>
                                {order.map((k) => <col key={k} style={{ width: widths[k] }} />)}
                                <col style={{ width: 44 }} />
                                <col />
                            </colgroup>
                            <thead className="bg-muted text-muted-foreground sticky top-0 z-10">
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
                    </TabsContent>

                    <TabsContent value="sections" className="mt-2">
                <section>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <ListTree className="size-4 text-muted-foreground" />
                                <h2 className="text-lg font-semibold">Sections</h2>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                                Rename sections and subsections here. Changes carry through to existing catalogue and costing items.
                            </p>
                        </div>
                        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={openCreateSection}>
                            <Plus className="size-3.5" /> Add section
                        </Button>
                    </div>

                    <div className="columns-1 lg:columns-2 xl:columns-3 gap-3 mt-4">
                        {sectionGroups.map(({ name, subsections }) => (
                            <div
                                key={name}
                                onDragOver={(e) => {
                                    if (draggingSubsectionId == null) return
                                    e.preventDefault()
                                    e.dataTransfer.dropEffect = "move"
                                    setDragOverSection(name)
                                }}
                                onDragLeave={(e) => {
                                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOverSection(null)
                                }}
                                onDrop={(e) => {
                                    e.preventDefault()
                                    const id = draggingSubsectionId ?? Number(e.dataTransfer.getData("text/plain"))
                                    const subsection = sections.find((section) => section.id === id)
                                    if (subsection) void moveSubsection(subsection, name)
                                }}
                                className={`break-inside-avoid mb-3 rounded-lg border bg-card overflow-hidden transition-colors ${dragOverSection === name ? "border-primary bg-primary/5" : "border-border/60"}`}
                            >
                                <div className="flex items-center gap-2 bg-muted/35 px-3 py-2.5 border-b border-border/60">
                                    <Layers className="size-3.5 text-muted-foreground shrink-0" />
                                    <input
                                        key={name}
                                        defaultValue={name}
                                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
                                        onBlur={(e) => { if (e.target.value !== name) renameSection(name, e.target.value) }}
                                        className="min-w-0 flex-1 rounded border border-transparent hover:border-input focus:border-input bg-transparent px-1.5 py-1 text-sm font-semibold outline-none"
                                        aria-label={`Rename section ${name}`}
                                    />
                                    <span className="text-xs text-muted-foreground shrink-0">
                                        {subsections.length} subsection{subsections.length === 1 ? "" : "s"}
                                    </span>
                                </div>
                                <div className="p-2">
                                    {subsections.length === 0 ? (
                                        <p className="px-2 py-2 text-xs text-muted-foreground">No subsections yet.</p>
                                    ) : (
                                        <div className="space-y-1">
                                            {subsections.map((subsection) => (
                                                <div key={subsection.id} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/30">
                                                    <button
                                                        type="button"
                                                        draggable
                                                        onDragStart={(e) => {
                                                            setDraggingSubsectionId(subsection.id)
                                                            e.dataTransfer.effectAllowed = "move"
                                                            e.dataTransfer.setData("text/plain", String(subsection.id))
                                                        }}
                                                        onDragEnd={() => { setDraggingSubsectionId(null); setDragOverSection(null) }}
                                                        className="cursor-grab active:cursor-grabbing text-muted-foreground/55 hover:text-foreground shrink-0"
                                                        title="Drag to another section"
                                                        aria-label={`Move ${subsection.subsection} to another section`}
                                                    >
                                                        <GripVertical className="size-3.5" />
                                                    </button>
                                                    <input
                                                        key={subsection.subsection}
                                                        defaultValue={subsection.subsection ?? ""}
                                                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
                                                        onBlur={(e) => { if (e.target.value !== subsection.subsection) renameSubsection(subsection, e.target.value) }}
                                                        className="min-w-0 flex-1 rounded border border-transparent hover:border-input focus:border-input bg-transparent px-1.5 py-1 text-sm outline-none"
                                                        aria-label={`Rename subsection ${subsection.subsection}`}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {addingSubsectionFor === name ? (
                                        <div className="flex items-center gap-2 px-2 pt-2">
                                            <Input
                                                autoFocus
                                                value={newSubsectionName}
                                                onChange={(e) => setNewSubsectionName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") { e.preventDefault(); addSubsection(name) }
                                                    else if (e.key === "Escape") setAddingSubsectionFor(null)
                                                }}
                                                placeholder="Subsection name"
                                                className="h-8 text-sm"
                                            />
                                            <Button size="sm" className="h-8" disabled={!newSubsectionName.trim()} onClick={() => addSubsection(name)}>Add</Button>
                                            <Button variant="ghost" size="sm" className="h-8" onClick={() => setAddingSubsectionFor(null)}>Cancel</Button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => { setAddingSubsectionFor(name); setNewSubsectionName("") }}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 mt-1 text-xs text-muted-foreground hover:text-foreground"
                                        >
                                            <Plus className="size-3" /> Add subsection
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
                    </TabsContent>
                </Tabs>

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

                <Dialog open={newSectionOpen} onOpenChange={(open) => {
                    if (!creatingSection) {
                        setNewSectionOpen(open)
                        if (!open) setNewSectionFor(null)
                    }
                }}>
                    <DialogContent className="sm:max-w-[440px]">
                        <DialogHeader>
                            <DialogTitle>Create a new section</DialogTitle>
                            <DialogDescription>
                                This section will be saved to RPM and available for future catalogue and costing items.
                            </DialogDescription>
                        </DialogHeader>
                        <Input
                            autoFocus
                            value={newSectionName}
                            onChange={(e) => setNewSectionName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createSection() } }}
                            placeholder="Section name"
                        />
                        <DialogFooter>
                            <Button variant="outline" disabled={creatingSection} onClick={() => { setNewSectionOpen(false); setNewSectionFor(null) }}>Cancel</Button>
                            <Button disabled={!newSectionName.trim() || creatingSection} onClick={createSection}>
                                {creatingSection ? "Creating…" : "Create section"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </PageShell>
        </DashboardLayout>
    )
}
