"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Plus, Trash2, Package, ChevronUp, ChevronDown, BookmarkPlus, Scale, Check, X, RotateCcw, GripVertical } from "lucide-react"
import { toast } from "sonner"
import { MaterialPicker } from "./material-picker"
import { MaterialCombobox } from "./material-combobox"
import { NumCell, TextCell, SupplierCell } from "./cells"
import { useColumnLayout } from "@/lib/costing/use-column-layout"
import { effectiveBuildSell, sellMargin } from "@/lib/costing/pricing"
import { totalBomHours } from "@/lib/costing/bom-hours"
import type { CostingItem, CostingLine, CostingSection, Material } from "@/types/database"

const SUPPLIER_LIST_ID = "costing-suppliers-dl"

const DEFAULT_SECTIONS = ["Materials", "Steel", "Wiring - LED", "Labour", "Pack/Despatch/Freight"]

const nz = (n: number) => n.toLocaleString("en-NZ", { style: "currency", currency: "NZD" })
const pct = (n: number) => `${(n * 100).toFixed(1)}%`

// Derived line maths — mirrors the DB generated columns so edits feel instant.
const unitSell = (l: CostingLine) =>
    l.unit_sell_override != null ? Number(l.unit_sell_override) : Number(l.unit_cost) * (1 + Number(l.markup))
const lineCost = (l: CostingLine) => Number(l.qty) * Number(l.unit_cost)
const lineSell = (l: CostingLine) => Number(l.qty) * unitSell(l)
const lineMargin = (l: CostingLine) => { const s = lineSell(l); return s > 0 ? 1 - lineCost(l) / s : 0 }
// Galvanising lines priced "per kg of object" — their qty is the total steel weight.
const isGalvPerKg = (l: CostingLine) => l.description.toLowerCase().includes("per kg of object")
const isWeldingTime = (l: CostingLine) => l.description.toLowerCase().includes("metal welding")
const isAutoArgon = (l: CostingLine) => {
    const description = l.description.toLowerCase()
    return description.includes("argon/filler") && description.includes("welding")
}
// Weight (kg) for galvanising = factor × size × qty (manual; independent of cost qty).
const lineWeight = (l: CostingLine) => Number(l.wt_factor ?? 0) * Number(l.wt_size ?? 0) * Number(l.wt_qty ?? 0)
const MODULES_PER_HOUR = 20
const isWiringLabour = (l: CostingLine) => l.description.toLowerCase().includes("wiring labour")
const isLedDriver = (l: CostingLine) => {
    const description = l.description.toLowerCase()
    return /hlg-\d+h/.test(description) || description.includes("driver") || description.includes("transformer") || description.includes("t/x")
}
const isLedModule = (l: CostingLine) => {
    const description = l.description.toLowerCase()
    return !isLedDriver(l) && !isWiringLabour(l) && description.includes("module")
}
const driverRatedWatts = (l: CostingLine) => {
    const modelRating = l.description.match(/HLG-(\d+)H/i)?.[1]
    return modelRating ? Number(modelRating) : Number(l.watts ?? 0)
}

interface CostColumn {
    key: string
    label: string
    width: number
    min: number
    align?: "right"
    weight?: boolean
    title?: string
}

const COST_COLUMNS: CostColumn[] = [
    { key: "description", label: "Description", width: 280, min: 180 },
    { key: "supplier", label: "Supplier", width: 140, min: 90 },
    { key: "qty", label: "Qty", width: 80, min: 60, align: "right" },
    { key: "unit_cost", label: "Unit cost", width: 100, min: 75, align: "right" },
    { key: "markup", label: "Markup", width: 90, min: 70, align: "right", title: "Markup on cost as a decimal (0.5 = 50%)" },
    { key: "unit_sell", label: "Unit sell", width: 100, min: 75, align: "right" },
    { key: "sell", label: "Sell", width: 100, min: 75, align: "right" },
    { key: "margin", label: "Margin", width: 80, min: 65, align: "right" },
    { key: "wt_factor", label: "kg/unit", width: 90, min: 65, align: "right", weight: true, title: "kg per metre (linear) or per m² (plate)" },
    { key: "wt_size", label: "Size", width: 80, min: 60, align: "right", weight: true, title: "Length used (m) or area (m²)" },
    { key: "wt_qty", label: "Wt qty", width: 75, min: 60, align: "right", weight: true, title: "Number of pieces" },
    { key: "weight", label: "Weight", width: 90, min: 70, align: "right", weight: true, title: "Weight = kg/unit × size × qty" },
]

const COST_COLUMN_LAYOUT = {
    order: COST_COLUMNS.map((column) => column.key),
    widths: Object.fromEntries(COST_COLUMNS.map((column) => [column.key, column.width])),
}

function CostColumnHeader({ column, width, onResize }: {
    column: CostColumn
    width: number
    onResize: (key: string, width: number) => void
}) {
    function startResize(e: React.PointerEvent) {
        e.preventDefault()
        e.stopPropagation()
        const startX = e.clientX
        const startWidth = width
        const move = (event: PointerEvent) => onResize(column.key, Math.max(column.min, startWidth + event.clientX - startX))
        const stop = () => {
            window.removeEventListener("pointermove", move)
            window.removeEventListener("pointerup", stop)
            document.body.style.cursor = ""
            document.body.style.userSelect = ""
        }
        window.addEventListener("pointermove", move)
        window.addEventListener("pointerup", stop)
        document.body.style.cursor = "col-resize"
        document.body.style.userSelect = "none"
    }

    return (
        <th className="relative p-0 border-b border-border/60" title={column.title}>
            <div className={`px-2 py-2 text-xs font-medium truncate ${column.key === "description" ? "pl-3" : ""} ${column.align === "right" ? "text-right" : "text-left"}`}>
                {column.label}
            </div>
            <div
                onPointerDown={startResize}
                title={`Drag to resize ${column.label}`}
                className="group/resize absolute top-0 -right-1.5 z-10 flex h-full w-3 cursor-col-resize touch-none items-center justify-center"
            >
                <span className="h-4 w-px bg-border group-hover/resize:h-full group-hover/resize:w-0.5 group-hover/resize:bg-primary" />
            </div>
        </th>
    )
}

// Scoped to a single item's BOM. Lines carry both job_id (for job-level rollups)
// and item_id (this item).
export function CostSheet({ jobId, item, isProduct = false, onFinalSellChange }: {
    jobId: string
    item: CostingItem
    isProduct?: boolean
    onFinalSellChange?: (price: number) => void
}) {
    const supabase = useMemo(() => createClient(), [])
    const [lines, setLines] = useState<CostingLine[]>([])
    const [subOrder, setSubOrder] = useState<Record<string, number>>({})
    const [suppliers, setSuppliers] = useState<string[]>([])
    const [inactiveSuppliers, setInactiveSuppliers] = useState<string[]>([])
    const [addingSupplierFor, setAddingSupplierFor] = useState<CostingLine | null>(null)
    const [newSupplierName, setNewSupplierName] = useState("")
    const [savingSupplier, setSavingSupplier] = useState(false)
    const [definedSections, setDefinedSections] = useState<string[]>(DEFAULT_SECTIONS)
    const [loading, setLoading] = useState(true)
    const [pickerSection, setPickerSection] = useState<string | null>(null)
    const [pickerSub, setPickerSub] = useState<string | null>(null)
    const [pickerNonce, setPickerNonce] = useState(0)
    const [addingSubFor, setAddingSubFor] = useState<string | null>(null)
    const [showWeights, setShowWeights] = useState(false)
    const [extraSections, setExtraSections] = useState<string[]>([])
    const { widths, setWidth, reset: resetColumns } = useColumnLayout("cost-sheet-columns-v1", COST_COLUMN_LAYOUT)
    const [draggingLineId, setDraggingLineId] = useState<string | null>(null)
    const [dragOverSection, setDragOverSection] = useState<string | null>(null)
    const [dragOverLineId, setDragOverLineId] = useState<string | null>(null)
    const [jobStatus, setJobStatus] = useState<string>("draft")
    const [catalogueCosts, setCatalogueCosts] = useState<Record<string, { unit_cost: number; date_last_checked: string | null; unit: string | null }>>({})
    const syncingArgon = useRef(false)

    // Keep one catalogue Argon/Filler line equal to the combined welding hours.
    async function syncArgonFromWelding(sourceLines: CostingLine[]) {
        if (syncingArgon.current) return
        syncingArgon.current = true
        try {
            const weldingHours = sourceLines.filter(isWeldingTime).reduce((total, line) => total + Number(line.qty || 0), 0)
            const existing = sourceLines.find(isAutoArgon)

            if (existing) {
                if (Math.abs(Number(existing.qty) - weldingHours) < 0.0001) return
                const { error } = await supabase.from("costing_lines").update({ qty: weldingHours }).eq("id", existing.id)
                if (error) return toast.error(`Could not update Argon/Filler: ${error.message}`)
                setLines((current) => current.map((line) => line.id === existing.id ? { ...line, qty: weldingHours } : line))
                return
            }

            if (weldingHours <= 0) return
            const { data: material, error: materialError } = await supabase.from("materials")
                .select("*")
                .ilike("description", "Argon/Filler%")
                .eq("active", true)
                .limit(1)
                .maybeSingle()
            if (materialError) return toast.error(`Could not find Argon/Filler: ${materialError.message}`)
            if (!material) return toast.error("Add an active Argon/Filler catalogue item to enable automatic welding consumables")

            const catalogueItem = material as Material
            const section = catalogueItem.section || "Materials"
            const sort = Math.max(0, ...sourceLines.filter((line) => line.section === section).map((line) => line.sort)) + 1
            const { data: added, error } = await supabase.from("costing_lines").insert({
                job_id: jobId,
                item_id: item.id,
                section,
                subsection: catalogueItem.subsection ?? null,
                material_id: catalogueItem.id,
                description: catalogueItem.description,
                supplier: catalogueItem.supplier,
                qty: weldingHours,
                unit_cost: catalogueItem.unit_cost,
                markup: catalogueItem.default_markup,
                watts: catalogueItem.watts ?? null,
                wt_factor: catalogueItem.mtr_weight ?? null,
                catalogue_unit_cost_snapshot: catalogueItem.unit_cost,
                sort,
            }).select("*").single()
            if (error) return toast.error(`Could not add Argon/Filler: ${error.message}`)
            setLines((current) => current.some((line) => line.id === (added as CostingLine).id) ? current : [...current, added as CostingLine])
            toast.success(`Added Argon/Filler for ${weldingHours} welding hour${weldingHours === 1 ? "" : "s"}`)
        } finally {
            syncingArgon.current = false
        }
    }

    // Staged add: pick a material, set its qty, then commit. Works from the top box
    // or from an "add line" row inside any subsection, so you don't scroll to set qty.
    const [staged, setStaged] = useState<{ m: Material; section: string; sub: string | null } | null>(null)
    const [stagedQty, setStagedQty] = useState("1")
    const [stagedAt, setStagedAt] = useState<string | null>(null)       // key of the active add-row
    const [autoFocusAt, setAutoFocusAt] = useState<string | null>(null) // refocus this add-row after commit
    const qtyRef = useRef<HTMLInputElement | null>(null)
    const TOP_KEY = "__top__"
    const subKey = (section: string, sub: string | null) => `${section} ${sub ?? ""}`

    useEffect(() => {
        let active = true
        ;(async () => {
            const [{ data: ls, error }, { data: secs }, { data: sups, error: supplierError }, { data: jobRow }] = await Promise.all([
                supabase.from("costing_lines").select("*").eq("item_id", item.id),
                supabase.from("costing_sections").select("*"),
                supabase.from("supplier_directory").select("name,active").order("name"),
                supabase.from("costing_jobs").select("status").eq("id", jobId).single(),
            ])
            if (!active) return
            if (error) toast.error(error.message)
            if (supplierError) toast.error(`Could not load suppliers: ${supplierError.message}`)
            const loaded = (ls as CostingLine[]) || []
            setLines(loaded)
            setJobStatus(String(jobRow?.status || "draft"))
            const materialIds = Array.from(new Set(loaded.map((line) => line.material_id).filter(Boolean) as string[]))
            if (materialIds.length > 0) {
                const { data: currentMaterials, error: materialError } = await supabase
                    .from("materials")
                    .select("id,unit_cost,date_last_checked,unit")
                    .in("id", materialIds)
                if (materialError) toast.error("Could not check current catalogue prices: " + materialError.message)
                else {
                    const current = Object.fromEntries(((currentMaterials || []) as Array<{ id: string; unit_cost: number; date_last_checked: string | null; unit: string | null }>).map((material) => [
                        material.id,
                        { unit_cost: Number(material.unit_cost || 0), date_last_checked: material.date_last_checked ?? null, unit: material.unit ?? null },
                    ]))
                    setCatalogueCosts(current)
                }
            } else {
                setCatalogueCosts({})
            }
            if (loaded.some(isWeldingTime)) await syncArgonFromWelding(loaded)
            if (loaded.some((l) => l.wt_factor != null || l.wt_size != null)) setShowWeights(true)  // steel jobs auto-show
            const order: Record<string, number> = {}
            const loadedSections = (secs as CostingSection[]) || []
            loadedSections.forEach((s) => { if (s.subsection) order[`${s.section}|${s.subsection}`] = s.sort })
            setSubOrder(order)
            if (loadedSections.length > 0) {
                setDefinedSections(Array.from(new Set(loadedSections.sort((a, b) => a.sort - b.sort).map((s) => s.section))))
            }
            const directory = (sups as { name: string; active: boolean }[]) || []
            setSuppliers(directory.filter((supplier) => supplier.active).map((supplier) => supplier.name))
            setInactiveSuppliers(directory.filter((supplier) => !supplier.active).map((supplier) => supplier.name))
            setLoading(false)
        })()
        return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [supabase, item.id])

    function openPicker(section: string, sub: string | null = null) {
        setPickerSection(section); setPickerSub(sub); setPickerNonce((n) => n + 1)
    }

    // ── mutations ───────────────────────────────────────────────
    // subOverride: force the line into a specific subsection (used by group buttons
    // and "+ Subsection"); undefined keeps the catalogue item's own subsection.
    async function addLine(section: string, m?: Material, subOverride?: string | null, qty?: number) {
        const sec = m?.section || section
        const subsection = subOverride !== undefined ? subOverride : (m?.subsection ?? null)
        const maxSort = Math.max(0, ...lines.filter((l) => l.section === sec).map((l) => l.sort))
        const payload = {
            job_id: jobId, item_id: item.id, section: sec, subsection, material_id: m?.id ?? null,
            description: m?.description ?? "", supplier: m?.supplier ?? null,
            qty: qty != null ? qty : (m ? 1 : 0), unit_cost: m?.unit_cost ?? 0, markup: m?.default_markup ?? 0.5, watts: m?.watts ?? null, sort: maxSort + 1,
            catalogue_unit_cost_snapshot: m?.unit_cost ?? null,
            // Steel carries a per-unit weight (kg/m or kg/sheet) — seed the galvanising weight calc.
            wt_factor: m?.mtr_weight ?? null,
        }
        const { data, error } = await supabase.from("costing_lines").insert(payload).select("*").single()
        if (error) return toast.error(error.message)
        const added = data as CostingLine
        const next = [...lines, added]
        setLines((prev) => [...prev, added])
        if (m) setCatalogueCosts((current) => ({ ...current, [m.id]: { unit_cost: Number(m.unit_cost), date_last_checked: m.date_last_checked, unit: m.unit } }))
        if (isWeldingTime(added)) await syncArgonFromWelding(next)
        if (m?.mtr_weight != null) setShowWeights(true) // steel added -> reveal the weight columns
    }

    // Stage a picked material (from the top box or an in-section add row).
    function stageAt(key: string, m: Material, section: string, sub: string | null) {
        setStaged({ m, section, sub })
        setStagedQty("1")
        setStagedAt(key)
        setAutoFocusAt(key)
        setTimeout(() => qtyRef.current?.select(), 0) // focus + select so typing replaces "1"
    }

    async function commitStaged() {
        if (!staged) return
        const q = Number(stagedQty)
        await addLine(staged.section, staged.m, staged.sub, isNaN(q) ? 0 : q)
        setStaged(null)
        setStagedAt(null)
        setStagedQty("1")
    }

    function cancelStaged() {
        setStaged(null)
        setStagedAt(null)
        setStagedQty("1")
    }

    // Create a custom subsection (e.g. "Galvanising") by seeding a blank line in it.
    async function createSubsection(section: string, name: string) {
        const n = name.trim()
        setAddingSubFor(null)
        if (n) await addLine(section, undefined, n)
    }

    // Rename a subsection: update every line in the group.
    async function renameSubsection(section: string, oldSub: string, newName: string) {
        const name = newName.trim()
        if (!name || name === oldSub) return
        setLines((prev) => prev.map((l) => (l.section === section && (l.subsection ?? "") === oldSub ? { ...l, subsection: name } : l)))
        const { error } = await supabase.from("costing_lines").update({ subsection: name })
            .eq("item_id", item.id).eq("section", section).eq("subsection", oldSub)
        if (error) toast.error(error.message)
    }

    async function patchLine(id: string, patch: Partial<CostingLine>) {
        const original = lines.find((line) => line.id === id)
        const next = lines.map((line) => line.id === id ? { ...line, ...patch } : line)
        setLines(next)
        const { error } = await supabase.from("costing_lines").update(patch).eq("id", id)
        if (error) {
            toast.error(error.message)
            return
        }
        const updated = next.find((line) => line.id === id)
        if ((original && isWeldingTime(original)) || (updated && isWeldingTime(updated))) await syncArgonFromWelding(next)
    }

    const isQuoteStage = !["in_progress", "complete", "invoiced", "cancelled"].includes(jobStatus)
    const changedCatalogueLines = lines.filter((line) => {
        if (!isQuoteStage || !line.material_id) return false
        const current = catalogueCosts[line.material_id]
        const snapshot = line.catalogue_unit_cost_snapshot
        return current != null && snapshot != null && Math.abs(Number(snapshot) - Number(current.unit_cost)) > 0.005
    })

    async function updateLineToCatalogue(line: CostingLine) {
        if (!line.material_id) return
        const current = catalogueCosts[line.material_id]
        if (!current) return
        await patchLine(line.id, { unit_cost: current.unit_cost, catalogue_unit_cost_snapshot: current.unit_cost })
        toast.success("Updated " + (line.description || "line") + " to current catalogue price")
    }

    async function updateAllCataloguePrices() {
        if (changedCatalogueLines.length === 0) return
        const updates = changedCatalogueLines.map((line) => ({
            id: line.id,
            unit_cost: catalogueCosts[line.material_id as string].unit_cost,
            catalogue_unit_cost_snapshot: catalogueCosts[line.material_id as string].unit_cost,
        }))
        setLines((current) => current.map((line) => {
            const update = updates.find((candidate) => candidate.id === line.id)
            return update ? { ...line, unit_cost: update.unit_cost, catalogue_unit_cost_snapshot: update.catalogue_unit_cost_snapshot } : line
        }))
        const results = await Promise.all(
            updates.map((update) => supabase.from("costing_lines").update({ unit_cost: update.unit_cost, catalogue_unit_cost_snapshot: update.catalogue_unit_cost_snapshot }).eq("id", update.id))
        )
        const error = results.find((result) => result.error)?.error
        if (error) {
            toast.error("Could not update all catalogue prices: " + error.message)
            return
        }
        toast.success(updates.length + " catalogue price" + (updates.length === 1 ? "" : "s") + " updated")
    }

    // Type-ahead pick on a line: fill it from a catalogue material (keep its section/subsection).
    function fillLineFromMaterial(line: CostingLine, m: Material) {
        patchLine(line.id, { description: m.description, supplier: m.supplier, unit_cost: m.unit_cost, markup: m.default_markup, material_id: m.id, catalogue_unit_cost_snapshot: m.unit_cost })
    }

    async function removeLine(id: string) {
        const removed = lines.find((line) => line.id === id)
        const next = lines.filter((line) => line.id !== id)
        setLines(next)
        const { error } = await supabase.from("costing_lines").delete().eq("id", id)
        if (error) {
            toast.error(error.message)
            return
        }
        if (removed && isWeldingTime(removed)) await syncArgonFromWelding(next)
    }

    // BOM suggestions and newly entered names share the Supplier Directory.
    async function commitSupplier(line: CostingLine, value: string): Promise<boolean> {
        const name = value.trim()
        if (!name) {
            await patchLine(line.id, { supplier: null })
            return true
        }
        const existing = suppliers.find((supplier) => supplier.toLowerCase() === name.toLowerCase())
        if (existing) {
            await patchLine(line.id, { supplier: existing })
            return true
        }
        if (inactiveSuppliers.some((supplier) => supplier.toLowerCase() === name.toLowerCase())) {
            toast.error("This supplier is inactive. Activate it on the Suppliers page first.")
            return false
        }
        const { error } = await supabase.from("supplier_directory").insert({ name, active: true })
        if (error) {
            toast.error(`Could not add supplier: ${error.message}`)
            return false
        }
        setSuppliers((current) => [...current, name].sort((a, b) => a.localeCompare(b)))
        await patchLine(line.id, { supplier: name })
        return true
    }

    async function addSupplier(event: React.FormEvent) {
        event.preventDefault()
        if (!addingSupplierFor || !newSupplierName.trim()) return
        setSavingSupplier(true)
        const saved = await commitSupplier(addingSupplierFor, newSupplierName)
        setSavingSupplier(false)
        if (saved) {
            setAddingSupplierFor(null)
            setNewSupplierName("")
        }
    }

    // Save a manual (non-catalogue) line into the materials catalogue for reuse.
    async function saveToCatalogue(line: CostingLine) {
        if (!line.description.trim()) return toast.error("Add a description before saving to the catalogue")
        const { data, error } = await supabase.from("materials").insert({
            description: line.description, supplier: line.supplier, unit_cost: line.unit_cost,
            default_markup: line.markup, section: line.section, subsection: line.subsection,
            is_labour: line.section === "Labour",
        }).select("id").single()
        if (error) return toast.error(error.message)
        await patchLine(line.id, { material_id: (data as { id: string }).id, catalogue_unit_cost_snapshot: Number(line.unit_cost) })
        toast.success("Saved to catalogue")
    }

    // Reorder within a subsection group: swap, then persist sequential sort.
    async function reorder(group: CostingLine[], idx: number, dir: -1 | 1) {
        const j = idx + dir
        if (j < 0 || j >= group.length) return
        const arr = [...group]
        ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
        const updates = arr.map((l, i) => ({ id: l.id, sort: i }))
        setLines((prev) => prev.map((l) => { const u = updates.find((x) => x.id === l.id); return u ? { ...l, sort: u.sort } : l }))
        const res = await Promise.all(updates.map((u) => supabase.from("costing_lines").update({ sort: u.sort }).eq("id", u.id)))
        const err = res.find((r) => r.error)?.error
        if (err) toast.error(err.message)
    }

    // Drag reorder within the same subsection group.
    async function reorderByDrop(lineId: string, targetId: string) {
        const source = lines.find((line) => line.id === lineId)
        const target = lines.find((line) => line.id === targetId)
        setDragOverLineId(null)
        if (!source || !target || source.id === target.id) return
        if (source.section !== target.section || (source.subsection ?? "") !== (target.subsection ?? "")) return

        const group = lines
            .filter((line) => line.section === target.section && (line.subsection ?? "") === (target.subsection ?? ""))
            .sort((a, b) => a.sort - b.sort)
        const from = group.findIndex((line) => line.id === lineId)
        let to = group.findIndex((line) => line.id === targetId)
        if (from < 0 || to < 0) return

        const arranged = [...group]
        const moved = arranged.splice(from, 1)[0]
        if (from < to) to -= 1
        arranged.splice(to, 0, moved)

        const updates = arranged.map((line, index) => ({ id: line.id, sort: index }))
        setLines((current) => current.map((line) => {
            const update = updates.find((candidate) => candidate.id === line.id)
            return update ? { ...line, sort: update.sort } : line
        }))

        const results = await Promise.all(
            updates.map((update) => supabase.from("costing_lines").update({ sort: update.sort }).eq("id", update.id))
        )
        const error = results.find((result) => result.error)?.error
        if (error) toast.error("Could not reorder line: " + error.message)
    }

    // Move a line between top-level sections. Its subsection is deliberately
    // retained, so e.g. Materials > Misc becomes Steel > Misc.
    async function moveLineToSection(lineId: string, section: string) {
        const line = lines.find((candidate) => candidate.id === lineId)
        setDraggingLineId(null)
        setDragOverSection(null)
        if (!line || line.section === section) return

        const previous = lines
        const sort = Math.max(0, ...lines.filter((candidate) => candidate.section === section).map((candidate) => candidate.sort)) + 1
        setLines((current) => current.map((candidate) => candidate.id === lineId ? { ...candidate, section, sort } : candidate))

        const { error } = await supabase.from("costing_lines").update({ section, sort }).eq("id", lineId)
        if (error) {
            setLines(previous)
            toast.error(`Could not move line: ${error.message}`)
            return
        }
        toast.success(`Moved to ${section}`)
    }

    // ── totals (per one of this item) ───────────────────────────
    const cost = lines.reduce((s, l) => s + lineCost(l), 0)
    const calculatedSell = lines.reduce((s, l) => s + lineSell(l), 0)
    const finalSell = item.xero_imported_line && item.xero_line_amount != null && Number(item.qty) !== 0
        ? Number(item.xero_line_amount) / Number(item.qty)
        : effectiveBuildSell(calculatedSell, item.unit_price)
    const margin = sellMargin(cost, finalSell)
    const totalHours = totalBomHours(lines, Object.fromEntries(Object.entries(catalogueCosts).map(([id, material]) => [id, material.unit])))
    const totalWeight = lines.reduce((s, l) => s + lineWeight(l), 0)
    // Galvanising must only use items in the Steel section, even when other materials carry weights.
    const totalSteelWeight = lines.filter((l) => l.section === "Steel").reduce((s, l) => s + lineWeight(l), 0)
    const itemQty = Number(item.qty) || 1

    // Order a section's lines by subsection (seed order, then name), then by sort.
    function groupsFor(section: string) {
        const secLines = lines.filter((l) => l.section === section)
        const subs = Array.from(new Set(secLines.map((l) => l.subsection ?? "")))
        subs.sort((a, b) => {
            const oa = subOrder[`${section}|${a}`] ?? 9999, ob = subOrder[`${section}|${b}`] ?? 9999
            return oa - ob || a.localeCompare(b)
        })
        return subs.map((sub) => ({
            sub,
            rows: secLines.filter((l) => (l.subsection ?? "") === sub).sort((a, b) => a.sort - b.sort),
        }))
    }

    if (loading) return <div className="h-40 rounded-lg bg-muted/40 animate-pulse mt-6" />

    // Only show sections that have lines (or were added manually). Canonical order first, then any others.
    const withLines = Array.from(new Set(lines.map((l) => l.section)))
    const activeSections = [
        ...definedSections.filter((s) => withLines.includes(s) || extraSections.includes(s)),
        ...withLines.filter((s) => !definedSections.includes(s)),
    ]
    const addableSections = definedSections.filter((s) => !activeSections.includes(s))
    const visibleColumns = COST_COLUMNS.filter((column) => showWeights || !column.weight)
    const tableWidth = visibleColumns.reduce((total, column) => total + (widths[column.key] ?? column.width), 0) + 64

    // Shared "set the qty then add" panel — rendered wherever an add-row is staging.
    const qtyPanel = staged ? (
        <div className="flex items-center gap-2 rounded-md border border-ring bg-background pl-2 pr-1.5 py-1">
            <span className="min-w-0 flex-1 truncate text-sm" title={staged.m.description}>{staged.m.description}</span>
            <label className="text-xs text-muted-foreground shrink-0">Qty</label>
            <input
                ref={qtyRef}
                type="number" step="any" value={stagedQty} autoFocus
                onChange={(e) => setStagedQty(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitStaged() }
                    else if (e.key === "Escape") { e.preventDefault(); cancelStaged() }
                }}
                className="w-20 rounded border border-input bg-background px-2 py-1 text-sm tabular-nums text-right outline-none focus:border-ring shrink-0"
            />
            <Button size="sm" className="h-7 gap-1 shrink-0" onClick={commitStaged}>
                <Check className="size-3.5" /> Add
            </Button>
            <button onClick={cancelStaged} className="text-muted-foreground hover:text-foreground shrink-0 p-1" title="Cancel (Esc)">
                <X className="size-3.5" />
            </button>
        </div>
    ) : null

    return (
        <div className="mt-6 space-y-6">
            <datalist id={SUPPLIER_LIST_ID}>
                {suppliers.map((s) => <option key={s} value={s} />)}
            </datalist>
            <Dialog open={addingSupplierFor !== null} onOpenChange={(open) => { if (!open) { setAddingSupplierFor(null); setNewSupplierName("") } }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add supplier</DialogTitle>
                        <DialogDescription>Add a supplier to the shared Supplier Directory and select it for this BOM line.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={addSupplier} className="space-y-4">
                        <Input autoFocus aria-label="Supplier name" placeholder="Supplier name" value={newSupplierName} onChange={(event) => setNewSupplierName(event.target.value)} />
                        <DialogFooter><Button type="submit" disabled={savingSupplier || !newSupplierName.trim()}>{savingSupplier ? "Adding..." : "Add supplier"}</Button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {changedCatalogueLines.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2.5 text-sm dark:border-amber-800/70 dark:bg-amber-950/20 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                        <div className="font-medium text-amber-900 dark:text-amber-200">
                            {changedCatalogueLines.length} catalogue price{changedCatalogueLines.length === 1 ? " has" : "s have"} changed since this quote was priced
                        </div>
                        <div className="text-xs text-amber-800/80 dark:text-amber-300/80">
                            Existing quote prices have been preserved. Review the highlighted lines below, or update them all to today&apos;s catalogue pricing.
                        </div>
                    </div>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => void updateAllCataloguePrices()}>
                        Update all prices
                    </Button>
                </div>
            )}

            {/* Add-item type-ahead — builds sections/subsections from what you pick */}
            <div className="flex items-center gap-2">
                <div className="flex-1 max-w-2xl relative">
                    {stagedAt === TOP_KEY ? qtyPanel : (
                        <MaterialCombobox
                            clearOnSelect
                            autoFocus={autoFocusAt === TOP_KEY}
                            placeholder="Add an item — type to search, then set its qty…"
                            onSelect={(m) => stageAt(TOP_KEY, m, m.section, m.subsection)}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                        />
                    )}
                </div>
                {addableSections.length > 0 && (
                    <select
                        value=""
                        onChange={(e) => { if (e.target.value) setExtraSections((p) => [...new Set([...p, e.target.value])]) }}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-muted-foreground outline-none focus:border-ring"
                    >
                        <option value="">+ Add section</option>
                        {addableSections.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                )}
                <Button size="sm" variant={showWeights ? "secondary" : "ghost"} className="h-9 gap-1.5 text-xs shrink-0"
                    onClick={() => setShowWeights((v) => !v)}>
                    <Scale className="size-3" /> {showWeights ? "Hide weights" : "Weights (steel)"}
                </Button>
                <Button size="icon" variant="ghost" className="size-9 shrink-0" onClick={resetColumns} title="Reset column widths">
                    <RotateCcw className="size-3.5" />
                    <span className="sr-only">Reset column widths</span>
                </Button>
            </div>

            {activeSections.length === 0 && (
                <div className="py-10 text-center border border-dashed border-border/60 rounded-lg text-sm text-muted-foreground">
                    Start typing an item above to build this BOM — the section &amp; subsection appear automatically.
                </div>
            )}

            {activeSections.map((section) => {
                const secLines = lines.filter((l) => l.section === section)
                const secCost = secLines.reduce((s, l) => s + lineCost(l), 0)
                const secSell = secLines.reduce((s, l) => s + lineSell(l), 0)
                const groups = groupsFor(section)
                // LED sizing calc (Wiring - LED only)
                const isWiring = section === "Wiring - LED"
                const modLines = isWiring ? secLines.filter(isLedModule) : []
                const ledRequired = modLines.reduce((s, l) => s + Number(l.qty) * Number(l.watts ?? 0), 0)
                const driverCap = isWiring ? secLines.filter(isLedDriver).reduce((s, l) => s + Number(l.qty) * driverRatedWatts(l), 0) : 0
                const moduleCount = modLines.reduce((s, l) => s + Number(l.qty), 0)
                const wiringHrs = moduleCount / MODULES_PER_HOUR
                return (
                    <section
                        key={section}
                        onDragOver={(e) => {
                            if (!draggingLineId) return
                            e.preventDefault()
                            e.dataTransfer.dropEffect = "move"
                            setDragOverSection(section)
                        }}
                        onDragLeave={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOverSection((current) => current === section ? null : current)
                        }}
                        onDrop={(e) => {
                            e.preventDefault()
                            const lineId = draggingLineId || e.dataTransfer.getData("text/plain")
                            if (lineId) void moveLineToSection(lineId, section)
                        }}
                        className={`rounded-lg border overflow-hidden transition-colors ${dragOverSection === section ? "border-primary ring-2 ring-primary/20" : "border-border/60"}`}
                    >
                        <div className="flex items-center justify-between bg-muted/40 px-4 py-2.5">
                            <h3 className="text-sm font-semibold">{section}</h3>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground tabular-nums">{nz(secCost)} → {nz(secSell)}</span>
                                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => openPicker(section)}>
                                    <Package className="size-3" /> Catalogue
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => addLine(section)}>
                                    <Plus className="size-3" /> Blank
                                </Button>
                                {addingSubFor === section ? (
                                    <input
                                        autoFocus placeholder="Subsection name…"
                                        className="h-7 w-40 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring"
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") createSubsection(section, e.currentTarget.value)
                                            else if (e.key === "Escape") setAddingSubFor(null)
                                        }}
                                        onBlur={() => setAddingSubFor(null)}
                                    />
                                ) : (
                                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setAddingSubFor(section)}>
                                        <Plus className="size-3" /> Subsection
                                    </Button>
                                )}
                            </div>
                        </div>

                        {isWiring && (ledRequired > 0 || moduleCount > 0) && (
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border/60 bg-amber-500/5 px-4 py-2 text-xs">
                                <span>LED load <span className="font-semibold text-foreground tabular-nums">{ledRequired.toFixed(1)}w required</span></span>
                                <span className={driverCap >= ledRequired ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                                    Drivers selected <span className="font-semibold tabular-nums">{driverCap.toFixed(0)}w</span>{" "}
                                    {ledRequired === 0 ? "" : driverCap >= ledRequired ? "✓ covered" : `⚠ short ${(ledRequired - driverCap).toFixed(0)}w`}
                                </span>
                                <span className="text-muted-foreground tabular-nums">{moduleCount} modules ≈ {wiringHrs.toFixed(2)} hr wiring labour</span>
                            </div>
                        )}

                        {secLines.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="table-fixed min-w-full text-sm" style={{ width: tableWidth }}>
                                    <colgroup>
                                        {visibleColumns.map((column) => (
                                            <col key={column.key} style={{ width: widths[column.key] ?? column.width }} />
                                        ))}
                                        <col style={{ width: 64 }} />
                                    </colgroup>
                                    <thead className="text-muted-foreground text-xs">
                                        <tr className="text-left border-b border-border/60">
                                            {visibleColumns.map((column) => (
                                                <CostColumnHeader
                                                    key={column.key}
                                                    column={column}
                                                    width={widths[column.key] ?? column.width}
                                                    onResize={setWidth}
                                                />
                                            ))}
                                            <th className="border-b border-border/60"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groups.map(({ sub, rows }) => (
                                            <Fragment key={`g-${section}-${sub || "none"}`}>
                                                {sub && (
                                                    <tr className="group/sub">
                                                        <td colSpan={showWeights ? 13 : 9} className="bg-muted/20 px-3 py-1.5">
                                                            <div className="flex items-center justify-between">
                                                                <div className="text-xs font-medium text-muted-foreground w-48" title="Click to rename subsection">
                                                                    <TextCell value={sub} onCommit={(v) => renameSubsection(section, sub, v)} />
                                                                </div>
                                                                <div className="flex items-center gap-1 opacity-0 group-hover/sub:opacity-100 transition-opacity">
                                                                    <button onClick={() => openPicker(section, sub)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                                                        <Package className="size-3" /> Catalogue
                                                                    </button>
                                                                    <button onClick={() => addLine(section, undefined, sub)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                                                        <Plus className="size-3" /> Blank
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                {rows.map((l, i) => (
                                                    <tr
                                                        key={l.id}
                                                        onDragOver={(e) => {
                                                            if (!draggingLineId || draggingLineId === l.id) return
                                                            const source = lines.find((candidate) => candidate.id === draggingLineId)
                                                            if (!source || source.section !== l.section || (source.subsection ?? "") !== (l.subsection ?? "")) return
                                                            e.preventDefault()
                                                            e.stopPropagation()
                                                            e.dataTransfer.dropEffect = "move"
                                                            setDragOverLineId(l.id)
                                                        }}
                                                        onDragLeave={() => setDragOverLineId((current) => current === l.id ? null : current)}
                                                        onDrop={(e) => {
                                                            if (!draggingLineId || draggingLineId === l.id) return
                                                            const source = lines.find((candidate) => candidate.id === draggingLineId)
                                                            if (!source || source.section !== l.section || (source.subsection ?? "") !== (l.subsection ?? "")) return
                                                            e.preventDefault()
                                                            e.stopPropagation()
                                                            void reorderByDrop(draggingLineId, l.id)
                                                        }}
                                                        className={"border-b border-border/40 last:border-0 group transition-colors " + (dragOverLineId === l.id ? "bg-primary/5 border-t-2 border-t-primary" : "")}
                                                    >
                                                        <td className="px-1 py-1">
                                                            <div className="flex min-w-0 items-center gap-0.5">
                                                                <button
                                                                    type="button"
                                                                    draggable
                                                                    onDragStart={(e) => {
                                                                        setDraggingLineId(l.id)
                                                                        e.dataTransfer.effectAllowed = "move"
                                                                        e.dataTransfer.setData("text/plain", l.id)
                                                                    }}
                                                                    onDragEnd={() => {
                                                                        setDraggingLineId(null)
                                                                        setDragOverSection(null)
                                                                        setDragOverLineId(null)
                                                                    }}
                                                                    className="shrink-0 cursor-grab p-0.5 text-muted-foreground/50 hover:text-foreground active:cursor-grabbing"
                                                                    title="Drag to reorder, or move to another section/subsection"
                                                                    aria-label={`Drag ${l.description || "line"} to reorder or move`}
                                                                >
                                                                    <GripVertical className="size-3.5" />
                                                                </button>
                                                                <div className="min-w-0 flex-1">
                                                                    <MaterialCombobox key={l.description} value={l.description} placeholder="Description / type to search…"
                                                                        onSelect={(m) => fillLineFromMaterial(l, m)}
                                                                        onTextCommit={(v) => patchLine(l.id, { description: v })} />
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-2 py-1">
                                                            <div className="flex items-center gap-0.5">
                                                                <SupplierCell value={l.supplier ?? ""} placeholder="—" listId={SUPPLIER_LIST_ID} onCommit={(v) => commitSupplier(l, v)} />
                                                                <button type="button" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Add supplier" aria-label={`Add supplier for ${l.description || "BOM line"}`} onClick={() => { setAddingSupplierFor(l); setNewSupplierName("") }}>
                                                                    <Plus className="size-3.5" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                        <td className="px-2 py-1">
                                                            <NumCell value={l.qty} onCommit={(v) => patchLine(l.id, { qty: v ?? 0 })} />
                                                            {showWeights && isGalvPerKg(l) && totalSteelWeight > 0 && Math.abs(Number(l.qty) - totalSteelWeight) > 0.01 && (
                                                                <button onClick={() => patchLine(l.id, { qty: Math.round(totalSteelWeight * 100) / 100 })}
                                                                    className="mt-0.5 text-[10px] leading-tight text-primary hover:underline whitespace-nowrap"
                                                                    title="Set qty to the total steel weight">
                                                                    = {totalSteelWeight.toFixed(1)} kg
                                                                </button>
                                                            )}
                                                            {isWiring && isWiringLabour(l) && wiringHrs > 0 && Math.abs(Number(l.qty) - wiringHrs) > 0.01 && (
                                                                <button onClick={() => patchLine(l.id, { qty: Math.round(wiringHrs * 100) / 100 })}
                                                                    className="mt-0.5 text-[10px] leading-tight text-primary hover:underline whitespace-nowrap"
                                                                    title="Set wiring labour to modules ÷ 20">
                                                                    = {wiringHrs.toFixed(2)} hr
                                                                </button>
                                                            )}
                                                        </td>
                                                        <td className="px-2 py-1">
                                                            <NumCell value={l.unit_cost} onCommit={(v) => patchLine(l.id, { unit_cost: v ?? 0 })} />
                                                            {l.material_id && catalogueCosts[l.material_id] && l.catalogue_unit_cost_snapshot != null && Math.abs(Number(l.catalogue_unit_cost_snapshot) - Number(catalogueCosts[l.material_id].unit_cost)) > 0.005 && isQuoteStage && (
                                                                <div className="mt-0.5 flex items-center justify-end gap-1 whitespace-nowrap text-[10px]">
                                                                    <span className="text-amber-700 dark:text-amber-300">Now {nz(catalogueCosts[l.material_id].unit_cost)}</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => void updateLineToCatalogue(l)}
                                                                        className="text-primary hover:underline"
                                                                        title="Update this line to the current catalogue price"
                                                                    >
                                                                        Update
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-2 py-1"><NumCell value={l.markup} step="0.05" onCommit={(v) => patchLine(l.id, { markup: v ?? 0 })} /></td>
                                                        <td className="px-2 py-1"><NumCell value={l.unit_sell_override} placeholder={unitSell(l).toFixed(2)} onCommit={(v) => patchLine(l.id, { unit_sell_override: v })} /></td>
                                                        <td className="px-2 py-1 text-right tabular-nums">{nz(lineSell(l))}</td>
                                                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{pct(lineMargin(l))}</td>
                                                        {showWeights && <>
                                                            <td className="px-2 py-1"><NumCell value={l.wt_factor} placeholder="—" onCommit={(v) => patchLine(l.id, { wt_factor: v })} /></td>
                                                            <td className="px-2 py-1"><NumCell value={l.wt_size} placeholder="—" onCommit={(v) => patchLine(l.id, { wt_size: v })} /></td>
                                                            <td className="px-2 py-1"><NumCell value={l.wt_qty} placeholder="—" onCommit={(v) => patchLine(l.id, { wt_qty: v })} /></td>
                                                            <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{lineWeight(l) > 0 ? `${lineWeight(l).toFixed(1)}` : "—"}</td>
                                                        </>}
                                                        <td className="px-1 py-1">
                                                            <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                {l.material_id == null && (
                                                                    <button onClick={() => saveToCatalogue(l)}
                                                                        className="text-muted-foreground hover:text-primary transition-colors p-0.5" title="Save to catalogue">
                                                                        <BookmarkPlus className="size-3.5" />
                                                                    </button>
                                                                )}
                                                                <button disabled={i === 0} onClick={() => reorder(rows, i, -1)}
                                                                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground p-0.5" title="Move up">
                                                                    <ChevronUp className="size-3.5" />
                                                                </button>
                                                                <button disabled={i === rows.length - 1} onClick={() => reorder(rows, i, 1)}
                                                                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground p-0.5" title="Move down">
                                                                    <ChevronDown className="size-3.5" />
                                                                </button>
                                                                <button onClick={() => removeLine(l.id)}
                                                                    className="text-muted-foreground hover:text-destructive transition-colors p-0.5" title="Delete">
                                                                    <Trash2 className="size-3.5" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {/* In-section add row — stay here to add lines without scrolling up */}
                                                <tr>
                                                    <td colSpan={showWeights ? 13 : 9} className="px-3 py-1.5">
                                                        <div className="max-w-xl">
                                                            {stagedAt === subKey(section, sub) ? qtyPanel : (
                                                                <MaterialCombobox
                                                                    clearOnSelect
                                                                    autoFocus={autoFocusAt === subKey(section, sub)}
                                                                    placeholder={`+ Add to ${sub || section}…`}
                                                                    onSelect={(m) => stageAt(subKey(section, sub), m, section, sub || null)}
                                                                    className="w-full rounded-md border border-dashed border-input/70 bg-transparent px-2.5 py-1.5 text-sm outline-none hover:border-input focus:border-ring"
                                                                />
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            </Fragment>
                                        ))}
                                        <tr className="border-t-2 border-border/70">
                                            <td className="px-3 py-1.5 font-medium text-muted-foreground">Subtotal</td>
                                            <td></td>
                                            <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{secLines.reduce((s, l) => s + Number(l.qty), 0) || ""}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{nz(secCost)}</td>
                                            <td></td>
                                            <td></td>
                                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{nz(secSell)}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{secSell > 0 ? pct(1 - secCost / secSell) : ""}</td>
                                            {showWeights && <>
                                                <td></td><td></td><td></td>
                                                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{(() => { const w = secLines.reduce((s, l) => s + lineWeight(l), 0); return w > 0 ? w.toFixed(1) : "" })()}</td>
                                            </>}
                                            <td></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                )
            })}

            {/* Item totals (per one of this item) */}
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                <div className={`grid grid-cols-2 gap-4 ${isProduct ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
                    <Tile label="Cost" value={nz(cost)} />
                    <Tile label={isProduct ? "Calculated Sell" : "Sell"} value={nz(isProduct ? calculatedSell : finalSell)} />
                    {isProduct && <div>
                        <label htmlFor="final-sell" className="text-xs text-muted-foreground">Final Sell</label>
                        <div className="mt-0.5 flex items-center gap-1">
                            <span className="text-sm text-muted-foreground">$</span>
                            <input
                                id="final-sell"
                                key={`${item.unit_price}-${calculatedSell.toFixed(2)}`}
                                type="number"
                                min="0.01"
                                max="9999999999.99"
                                step="0.01"
                                defaultValue={finalSell.toFixed(2)}
                                onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }}
                                onBlur={(event) => {
                                    const raw = event.currentTarget.value.trim()
                                    if (!raw) {
                                        if (Number(item.unit_price) > 0) onFinalSellChange?.(0)
                                        event.currentTarget.value = calculatedSell.toFixed(2)
                                        return
                                    }
                                    const value = Number(raw)
                                    if (!Number.isFinite(value) || value < 0.01 || value > 9999999999.99) {
                                        toast.error("Enter a Final Sell price above $0")
                                        event.currentTarget.value = finalSell.toFixed(2)
                                        return
                                    }
                                    const rounded = Math.round(value * 100) / 100
                                    if (rounded !== finalSell || Number(item.unit_price) > 0) onFinalSellChange?.(rounded)
                                    event.currentTarget.value = rounded.toFixed(2)
                                }}
                                aria-label="Final Sell price"
                                className="min-w-0 w-full max-w-28 rounded border border-input bg-background px-2 py-1 text-base font-semibold tabular-nums outline-none focus:border-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                        </div>
                        {Number(item.unit_price) > 0 && <button type="button" onClick={() => onFinalSellChange?.(0)}
                            className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                            <RotateCcw className="size-3" /> Use calculated price
                        </button>}
                    </div>}
                    <Tile label="Margin" value={pct(margin)} />
                    <Tile label="Total hours" value={totalHours.toFixed(2)} />
                </div>
                {(itemQty !== 1 || showWeights) && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border/60">
                        {itemQty !== 1 && <Tile label={`Line total (× ${itemQty})`} value={nz(finalSell * itemQty)} />}
                        {showWeights && <Tile label="Total weight" value={`${totalWeight.toFixed(1)} kg`} />}
                    </div>
                )}
                {showWeights && (
                    <div className="mt-3 text-xs text-muted-foreground">
                        Total weight includes all weighted materials. Galvanising uses Steel-section weight only via the &quot;= kg&quot; link.
                    </div>
                )}
            </div>

            <MaterialPicker
                key={pickerNonce}
                open={pickerSection != null}
                section={pickerSection ?? undefined}
                onOpenChange={(o) => { if (!o) setPickerSection(null) }}
                onPick={(m) => { if (pickerSection) addLine(pickerSection, m, pickerSub ?? undefined) }}
            />
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
