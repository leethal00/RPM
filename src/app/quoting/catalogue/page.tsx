"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
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
import { NumCell, TextCell } from "@/components/costing/cells"
import { useColumnLayout } from "@/lib/costing/use-column-layout"
import type { CostingSection, Material } from "@/types/database"

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
    { key: "mtr_weight", label: "kg/unit", width: 92, min: 60, align: "right", title: "Weight factor: kg per metre, kg per m², or kg per unit as appropriate" },
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
    const [supplierDirectory, setSupplierDirectory] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [supplier, setSupplier] = useState("all")
    const [sectionFilter, setSectionFilter] = useState("all")
    const [subsectionFilter, setSubsectionFilter] = useState("all")
    const [deleteTarget, setDeleteTarget] = useState<Material | null>(null)
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const [bulkDeleting, setBulkDeleting] = useState(false)
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
    const [dragOverSubsectionId, setDragOverSubsectionId] = useState<number | null>(null)
    const [deleteSectionTarget, setDeleteSectionTarget] = useState<string | null>(null)
    const [deleteSubsectionTarget, setDeleteSubsectionTarget] = useState<CostingSection | null>(null)
    const [deletingStructure, setDeletingStructure] = useState(false)
    const { order, widths, move, setWidth, reset } = useColumnLayout("catalogue-columns-v1", DEFAULT_LAYOUT)

    useEffect(() => {
        let active = true
        ;(async () => {
            const pageSize = 1000
            const allMaterials: Material[] = []
            let from = 0
            let materialError: { message?: string } | null = null

            while (true) {
                const { data, error } = await supabase
                    .from("materials")
                    .select("*")
                    .order("supplier")
                    .order("section")
                    .order("description")
                    .range(from, from + pageSize - 1)

                if (error) {
                    materialError = error
                    break
                }

                const batch = (data as Material[]) || []
                allMaterials.push(...batch)
                if (batch.length < pageSize) break
                from += pageSize
            }

            const [{ data: sectionData, error: sectionError }, { data: supplierData, error: supplierError }] = await Promise.all([
                supabase.from("costing_sections").select("*").order("sort").order("section"),
                supabase.from("supplier_directory").select("name").eq("active", true).order("name"),
            ])

            if (!active) return
            if (materialError) toast.error(materialError.message || "Could not load catalogue items")
            if (sectionError) toast.error(sectionError.message)
            if (supplierError) toast.error(supplierError.message)
            setMaterials(allMaterials)
            setSections((sectionData as CostingSection[]) || [])
            setSupplierDirectory((supplierData ?? []).map((row: { name: string }) => row.name))
            setLoading(false)
        })()
        return () => { active = false }
    }, [supabase])

    const suppliers = useMemo(() => {
        const inUse = materials.map((m) => m.supplier).filter(Boolean) as string[]
        return Array.from(new Set([...supplierDirectory, ...inUse])).sort((a, b) => a.localeCompare(b))
    }, [materials, supplierDirectory])
    const sectionNames = useMemo(() => {
        const defined = sections.map((s) => s.section)
        const inUse = materials.map((m) => m.section).filter(Boolean)
        return Array.from(new Set([...defined, ...inUse]))
    }, [materials, sections])
    const subsectionNames = useMemo(() => {
        const fromDefinitions = sections
            .filter((s) => s.subsection && (sectionFilter === "all" || s.section === sectionFilter))
            .map((s) => s.subsection as string)
        const fromMaterials = materials
            .filter((m) => m.subsection && (sectionFilter === "all" || (m.section ?? "Materials") === sectionFilter))
            .map((m) => m.subsection as string)
        return Array.from(new Set([...fromDefinitions, ...fromMaterials])).sort((a, b) => a.localeCompare(b))
    }, [materials, sections, sectionFilter])
    const sectionGroups = useMemo(() => sectionNames.map((name) => ({
        name,
        subsections: sections.filter((section) => section.section === name && section.subsection)
            .sort((a, b) => a.sort - b.sort),
    })), [sectionNames, sections])

    const tokens = search.toLowerCase().trim().split(/\s+/).filter(Boolean)
    const filtered = materials.filter((m) => {
        if (supplier !== "all" && (m.supplier ?? "") !== supplier) return false
        if (sectionFilter !== "all" && (m.section ?? "Materials") !== sectionFilter) return false
        if (subsectionFilter !== "all" && (m.subsection ?? "") !== subsectionFilter) return false
        if (tokens.length) {
            const hay = `${m.description} ${m.code ?? ""}`.toLowerCase()
            return tokens.every((t) => hay.includes(t))
        }
        return true
    })
    const filteredIds = filtered.map((m) => m.id)
    const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id))

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

    async function reorderSubsection(sourceId: number, targetId: number) {
        if (sourceId === targetId) {
            setDraggingSubsectionId(null)
            setDragOverSubsectionId(null)
            return
        }

        const source = sections.find((section) => section.id === sourceId)
        const target = sections.find((section) => section.id === targetId)
        if (!source?.subsection || !target?.subsection || source.section !== target.section) return

        const ordered = sections
            .filter((section) => section.section === source.section && section.subsection)
            .sort((a, b) => a.sort - b.sort)
        const from = ordered.findIndex((section) => section.id === sourceId)
        let to = ordered.findIndex((section) => section.id === targetId)
        if (from < 0 || to < 0) return

        const next = [...ordered]
        const moved = next.splice(from, 1)[0]
        if (from < to) to -= 1
        next.splice(to, 0, moved)

        const updates = next.map((section, index) => ({ id: section.id, sort: (index + 1) * 10 }))
        setSections((prev) => prev.map((section) => {
            const update = updates.find((candidate) => candidate.id === section.id)
            return update ? { ...section, sort: update.sort } : section
        }))
        setDraggingSubsectionId(null)
        setDragOverSubsectionId(null)
        setDragOverSection(null)

        const results = await Promise.all(
            updates.map((update) => supabase.from("costing_sections").update({ sort: update.sort }).eq("id", update.id))
        )
        const error = results.find((result) => result.error)?.error
        if (error) {
            toast.error("Could not reorder subsections: " + error.message)
            const { data } = await supabase.from("costing_sections").select("*").order("sort").order("section")
            if (data) setSections(data as CostingSection[])
            return
        }
        toast.success("Subsection order updated")
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

    async function deleteSubsection(record: CostingSection) {
        const subsection = record.subsection
        if (!subsection) return
        setDeletingStructure(true)
        const results = await Promise.all([
            supabase.from("materials").update({ subsection: null }).eq("section", record.section).eq("subsection", subsection),
            supabase.from("costing_lines").update({ subsection: null }).eq("section", record.section).eq("subsection", subsection),
            supabase.from("costing_sections").delete().eq("id", record.id),
        ])
        setDeletingStructure(false)
        const error = results.find((result) => result.error)?.error
        if (error) return toast.error(error.message)
        setSections((prev) => prev.filter((section) => section.id !== record.id))
        setMaterials((prev) => prev.map((material) => material.section === record.section && material.subsection === subsection
            ? { ...material, subsection: null } : material))
        setDeleteSubsectionTarget(null)
        toast.success(`Deleted subsection “${subsection}”`)
    }

    async function deleteSection(name: string) {
        const [{ count: materialCount, error: materialError }, { count: lineCount, error: lineError }] = await Promise.all([
            supabase.from("materials").select("id", { count: "exact", head: true }).eq("section", name),
            supabase.from("costing_lines").select("id", { count: "exact", head: true }).eq("section", name),
        ])
        if (materialError || lineError) return toast.error(materialError?.message || lineError?.message || "Could not check section usage")
        if ((materialCount ?? 0) > 0 || (lineCount ?? 0) > 0) {
            setDeleteSectionTarget(null)
            return toast.error(`“${name}” is still in use. Move its catalogue/costing items to another section before deleting it.`)
        }
        setDeletingStructure(true)
        const { error } = await supabase.from("costing_sections").delete().eq("section", name)
        setDeletingStructure(false)
        if (error) return toast.error(error.message)
        setSections((prev) => prev.filter((section) => section.section !== name))
        setDeleteSectionTarget(null)
        toast.success(`Deleted section “${name}”`)
    }

    function renderCell(key: string, m: Material) {
        switch (key) {
            case "code": return <TextCell value={m.code ?? ""} placeholder="—" onCommit={(v) => patch(m.id, { code: v || null })} />
            case "description": return <TextCell value={m.description} placeholder="Description" onCommit={(v) => patch(m.id, { description: v })} />
            case "supplier": return (
                <select
                    value={m.supplier ?? ""}
                    onChange={(e) => patch(m.id, { supplier: e.target.value || null })}
                    className="w-full rounded border border-transparent hover:border-input focus:border-input bg-transparent px-1.5 py-1 text-sm outline-none"
                    aria-label={`Supplier for ${m.description || "catalogue item"}`}
                >
                    <option value="">—</option>
                    {m.supplier && !supplierDirectory.includes(m.supplier) && (
                        <option value={m.supplier}>{m.supplier} (not in Supplier Directory)</option>
                    )}
                    {supplierDirectory.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
            )
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
            case "mtr_weight": return <NumCell value={m.mtr_weight} placeholder="—" onCommit={(v) => patch(m.id, { mtr_weight: v })} />
            case "date_last_checked": return <div className="text-xs text-muted-foreground tabular-nums truncate">{m.date_last_checked ?? m.check_note ?? "—"}</div>
            default: return null
        }
    }

    const tableWidth = order.reduce((s, k) => s + (widths[k] ?? 100), 0) + 84

    async function addMaterial() {
        setSearch("")
        const payload = { description: "", section: "Materials", default_markup: 0.5, unit_cost: 0, active: true,
            supplier: supplier !== "all" ? supplier : null }
        const { data, error } = await supabase.from("materials").insert(payload).select("*").single()
        if (error) return toast.error(error.message)
        setMaterials((prev) => [data as Material, ...prev])
    }

    function toggleSelected(id: string) {
        setSelectedIds((prev) => prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id])
    }

    function toggleAllFiltered() {
        if (allFilteredSelected) {
            setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)))
        } else {
            setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])))
        }
    }

    async function confirmDelete() {
        if (!deleteTarget) return
        const id = deleteTarget.id
        setMaterials((prev) => prev.filter((m) => m.id !== id))
        setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== id))
        setDeleteTarget(null)
        const { error } = await supabase.from("materials").delete().eq("id", id)
        if (error) toast.error(error.message)
    }

    async function confirmBulkDelete() {
        if (selectedIds.length === 0) return
        setBulkDeleting(true)
        const ids = [...selectedIds]
        const { error } = await supabase.from("materials").delete().in("id", ids)
        setBulkDeleting(false)
        if (error) return toast.error(error.message)
        setMaterials((prev) => prev.filter((m) => !ids.includes(m.id)))
        setSelectedIds([])
        setBulkDeleteOpen(false)
        toast.success(`Deleted ${ids.length} catalogue item${ids.length === 1 ? "" : "s"}`)
    }

    return (
        <DashboardLayout>
            <PageShell width="full" className="px-4 xl:px-6">
                <PageHeader
                    icon={Layers}
                    kicker="Quoting & Costing"
                    title="Catalogue & Sections"
                    description="Manage priced materials, labour, and the sections used throughout quoting and costing."
                    actions={activeTab === "catalogue" ? (
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" className="gap-1.5 h-9" asChild>
                                <Link href="/quoting/catalogue/quality">Quality check</Link>
                            </Button>
                            <Button variant="outline" size="sm" className="gap-1.5 h-9" asChild>
                                <Link href="/quoting/catalogue/price-imports">Price imports</Link>
                            </Button>
                            <Button size="sm" className="gap-1.5 h-9" onClick={addMaterial}>
                                <Plus className="size-3.5" /> Add material
                            </Button>
                        </div>
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
                <div className="flex flex-wrap items-center gap-2 mt-2">
                    <div className="relative flex-1 min-w-[260px] max-w-md">
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
                    <select
                        value={sectionFilter}
                        onChange={(e) => { setSectionFilter(e.target.value); setSubsectionFilter("all") }}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring"
                    >
                        <option value="all">All sections</option>
                        {sectionNames.map((section) => <option key={section} value={section}>{section}</option>)}
                    </select>
                    <select
                        value={subsectionFilter}
                        onChange={(e) => setSubsectionFilter(e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring"
                        disabled={subsectionNames.length === 0}
                    >
                        <option value="all">All subsections</option>
                        {subsectionNames.map((subsection) => <option key={subsection} value={subsection}>{subsection}</option>)}
                    </select>
                    {selectedIds.length > 0 && (
                        <>
                            <span className="text-xs font-medium tabular-nums">{selectedIds.length} selected</span>
                            <Button variant="destructive" size="sm" className="h-9 gap-1.5" onClick={() => setBulkDeleteOpen(true)}>
                                <Trash2 className="size-3.5" /> Delete selected
                            </Button>
                            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setSelectedIds([])}>Clear</Button>
                        </>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums ml-auto">{filtered.length} item{filtered.length === 1 ? "" : "s"}</span>
                    <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-xs text-muted-foreground" onClick={reset} title="Reset column order and widths">
                        <RotateCcw className="size-3.5" /> Reset columns
                    </Button>
                </div>

                {loading ? (
                    <div className="h-40 rounded-lg bg-muted/40 animate-pulse mt-4" />
                ) : (
                    <div className="border border-border/60 rounded-lg max-h-[56vh] overflow-auto mt-3">
                        <table className="text-sm table-fixed min-w-full" style={{ width: tableWidth }}>
                            <colgroup>
                                <col style={{ width: 40 }} />
                                {order.map((k) => <col key={k} style={{ width: widths[k] }} />)}
                                <col style={{ width: 44 }} />
                            </colgroup>
                            <thead className="bg-muted text-muted-foreground sticky top-0 z-10">
                                <tr className="text-left">
                                    <th className="border-b border-border/60 px-2 text-center">
                                        <input
                                            type="checkbox"
                                            className="size-4 align-middle"
                                            checked={allFilteredSelected}
                                            onChange={toggleAllFiltered}
                                            aria-label="Select all visible catalogue items"
                                            title="Select all visible items"
                                        />
                                    </th>
                                    {order.map((k) => (
                                        <ColHeader key={k} col={COL_BY_KEY[k]} width={widths[k] ?? COL_BY_KEY[k].width} onMove={move} onResize={setWidth} />
                                    ))}
                                    <th className="border-b border-border/60" />
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((m) => (
                                    <tr key={m.id} className={`border-t border-border/60 group ${selectedIds.includes(m.id) ? "bg-primary/5" : ""}`}>
                                        <td className="px-2 py-1 text-center">
                                            <input
                                                type="checkbox"
                                                className="size-4 align-middle"
                                                checked={selectedIds.includes(m.id)}
                                                onChange={() => toggleSelected(m.id)}
                                                aria-label={`Select ${m.description || "catalogue item"}`}
                                            />
                                        </td>
                                        {order.map((k) => (
                                            <td key={k} className="px-2 py-1 overflow-hidden">{renderCell(k, m)}</td>
                                        ))}
                                        <td className="px-1 py-1 text-right">
                                            <button onClick={() => setDeleteTarget(m)} className="text-muted-foreground hover:text-destructive p-1 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete material">
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </td>
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
                    Tip: pick a supplier, section, or subsection above to narrow the catalogue, then edit unit costs — each cost edit stamps today&apos;s date.
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

                    <div className="columns-1 lg:columns-2 xl:columns-3 2xl:columns-4 gap-3 mt-4">
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
                                    <button
                                        type="button"
                                        onClick={() => setDeleteSectionTarget(name)}
                                        className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                                        title={`Delete section ${name}`}
                                        aria-label={`Delete section ${name}`}
                                    >
                                        <Trash2 className="size-3.5" />
                                    </button>
                                </div>
                                <div className="p-2">
                                    {subsections.length === 0 ? (
                                        <p className="px-2 py-2 text-xs text-muted-foreground">No subsections yet.</p>
                                    ) : (
                                        <div className="space-y-1">
                                            {subsections.map((subsection) => (
                                                <div
                                                    key={subsection.id}
                                                    onDragOver={(e) => {
                                                        if (draggingSubsectionId == null || draggingSubsectionId === subsection.id) return
                                                        const source = sections.find((section) => section.id === draggingSubsectionId)
                                                        if (!source || source.section !== subsection.section) return
                                                        e.preventDefault()
                                                        e.stopPropagation()
                                                        e.dataTransfer.dropEffect = "move"
                                                        setDragOverSubsectionId(subsection.id)
                                                    }}
                                                    onDragLeave={() => setDragOverSubsectionId((current) => current === subsection.id ? null : current)}
                                                    onDrop={(e) => {
                                                        if (draggingSubsectionId == null) return
                                                        const source = sections.find((section) => section.id === draggingSubsectionId)
                                                        if (!source || source.section !== subsection.section) return
                                                        e.preventDefault()
                                                        e.stopPropagation()
                                                        void reorderSubsection(draggingSubsectionId, subsection.id)
                                                    }}
                                                    className={"flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/30 " + (dragOverSubsectionId === subsection.id ? "bg-primary/10 ring-1 ring-primary/30" : "")}
                                                >
                                                    <button
                                                        type="button"
                                                        draggable
                                                        onDragStart={(e) => {
                                                            setDraggingSubsectionId(subsection.id)
                                                            e.dataTransfer.effectAllowed = "move"
                                                            e.dataTransfer.setData("text/plain", String(subsection.id))
                                                        }}
                                                        onDragEnd={() => { setDraggingSubsectionId(null); setDragOverSection(null); setDragOverSubsectionId(null) }}
                                                        className="cursor-grab active:cursor-grabbing text-muted-foreground/55 hover:text-foreground shrink-0"
                                                        title="Drag to reorder, or move to another section"
                                                        aria-label={`Reorder ${subsection.subsection} or move it to another section`}
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
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeleteSubsectionTarget(subsection)}
                                                        className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                                                        title={`Delete subsection ${subsection.subsection}`}
                                                        aria-label={`Delete subsection ${subsection.subsection}`}
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                    </button>
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

                <Dialog open={deleteSectionTarget != null} onOpenChange={(open) => { if (!deletingStructure && !open) setDeleteSectionTarget(null) }}>
                    <DialogContent className="sm:max-w-[480px]">
                        <DialogHeader>
                            <DialogTitle>Delete section “{deleteSectionTarget}”?</DialogTitle>
                            <DialogDescription>
                                RPM will only delete an empty section. If catalogue or costing items still use it, deletion will be stopped so nothing is reassigned or lost accidentally.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" disabled={deletingStructure} onClick={() => setDeleteSectionTarget(null)}>Cancel</Button>
                            <Button variant="destructive" disabled={deletingStructure || !deleteSectionTarget} onClick={() => deleteSectionTarget && deleteSection(deleteSectionTarget)}>
                                <Trash2 className="mr-1.5 size-4" /> {deletingStructure ? "Deleting…" : "Delete section"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={deleteSubsectionTarget != null} onOpenChange={(open) => { if (!deletingStructure && !open) setDeleteSubsectionTarget(null) }}>
                    <DialogContent className="sm:max-w-[480px]">
                        <DialogHeader>
                            <DialogTitle>Delete subsection “{deleteSubsectionTarget?.subsection}”?</DialogTitle>
                            <DialogDescription>
                                Materials and costing lines in this subsection will stay in “{deleteSubsectionTarget?.section}” but their subsection will be cleared. No catalogue items or costing lines are deleted.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" disabled={deletingStructure} onClick={() => setDeleteSubsectionTarget(null)}>Cancel</Button>
                            <Button variant="destructive" disabled={deletingStructure || !deleteSubsectionTarget} onClick={() => deleteSubsectionTarget && deleteSubsection(deleteSubsectionTarget)}>
                                <Trash2 className="mr-1.5 size-4" /> {deletingStructure ? "Deleting…" : "Delete subsection"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={bulkDeleteOpen} onOpenChange={(open) => { if (!bulkDeleting) setBulkDeleteOpen(open) }}>
                    <DialogContent className="sm:max-w-[460px]">
                        <DialogHeader>
                            <DialogTitle>Delete {selectedIds.length} catalogue item{selectedIds.length === 1 ? "" : "s"}?</DialogTitle>
                            <DialogDescription>
                                The selected catalogue items will be permanently removed. Existing job lines keep their current values. This can&apos;t be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" disabled={bulkDeleting} onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
                            <Button variant="destructive" disabled={bulkDeleting || selectedIds.length === 0} onClick={confirmBulkDelete}>
                                <Trash2 className="mr-1.5 size-4" /> {bulkDeleting ? "Deleting…" : `Delete ${selectedIds.length}`}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

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
