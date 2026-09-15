"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, Package, ChevronUp, ChevronDown, BookmarkPlus, Scale, Check, X, RotateCcw, GripVertical } from "lucide-react"
import { toast } from "sonner"
import { MaterialPicker } from "./material-picker"
import { MaterialCombobox } from "./material-combobox"
import { NumCell, TextCell, SupplierCell } from "./cells"
import { useColumnLayout } from "@/lib/costing/use-column-layout"
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
export function CostSheet({ jobId, item }: { jobId: string; item: CostingItem }) {
    const supabase = useMemo(() => createClient(), [])
    const [lines, setLines] = useState<CostingLine[]>([])
    const [subOrder, setSubOrder] = useState<Record<string, number>>({})
    const [suppliers, setSuppliers] = useState<string[]>([])
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
    const syncingArgon = useRef(false)

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
            const { data: material, error: materialError } = await supabase.from("materials").select("*").ilike("description", "Argon/Filler%").eq("active", true).limit(1).maybeSingle()
            if (materialError) return toast.error(`Could not find Argon/Filler: ${materialError.message}`)
            if (!material) return toast.error("Add an active Argon/Filler catalogue item to enable automatic welding consumables")
            const catalogueItem = material as Material
            const section = catalogueItem.section || "Materials"
            const sort = Math.max(0, ...sourceLines.filter((line) => line.section === section).map((line) => line.sort)) + 1
            const { data: added, error } = await supabase.from("costing_lines").insert({ job_id: jobId, item_id: item.id, section, subsection: catalogueItem.subsection ?? null, material_id: catalogueItem.id, description: catalogueItem.description, supplier: catalogueItem.supplier, qty: weldingHours, unit_cost: catalogueItem.unit_cost, markup: catalogueItem.default_markup, watts: catalogueItem.watts ?? null, wt_factor: catalogueItem.mtr_weight ?? null, sort }).select("*").single()
            if (error) return toast.error(`Could not add Argon/Filler: ${error.message}`)
            setLines((current) => current.some((line) => line.id === (added as CostingLine).id) ? current : [...current, added as CostingLine])
            toast.success(`Added Argon/Filler for ${weldingHours} welding hour${weldingHours === 1 ? "" : "s"}`)
        } finally { syncingArgon.current = false }
    }

    const [staged, setStaged] = useState<{ m: Material; section: string; sub: string | null } | null>(null)
    const [stagedQty, setStagedQty] = useState("1")
    const [stagedAt, setStagedAt] = useState<string | null>(null)
    const [autoFocusAt, setAutoFocusAt] = useState<string | null>(null)
    const qtyRef = useRef<HTMLInputElement | null>(null)
    const TOP_KEY = "__top__"
    const subKey = (section: string, sub: string | null) => `${section}\u0000${sub ?? ""}`

    useEffect(() => {
        let active = true
        ;(async () => {
            const [{ data: ls, error }, { data: secs }, { data: sups }] = await Promise.all([
                supabase.from("costing_lines").select("*").eq("item_id", item.id),
                supabase.from("costing_sections").select("*"),
                supabase.from("costing_suppliers").select("name").order("name"),
            ])
            if (!active) return
            if (error) toast.error(error.message)
            const loaded = (ls as CostingLine[]) || []
            setLines(loaded)
            if (loaded.some(isWeldingTime)) await syncArgonFromWelding(loaded)
            if (loaded.some((l) => l.wt_factor != null || l.wt_size != null)) setShowWeights(true)
            const order: Record<string, number> = {}
            const loadedSections = (secs as CostingSection[]) || []
            loadedSections.forEach((s) => { if (s.subsection) order[`${s.section}|${s.subsection}`] = s.sort })
            setSubOrder(order)
            if (loadedSections.length > 0) setDefinedSections(Array.from(new Set(loadedSections.sort((a, b) => a.sort - b.sort).map((s) => s.section))))
            setSuppliers(((sups as { name: string }[]) || []).map((s) => s.name))
            setLoading(false)
        })()
        return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [supabase, item.id])

    function openPicker(section: string, sub: string | null = null) { setPickerSection(section); setPickerSub(sub); setPickerNonce((n) => n + 1) }

    async function addLine(section: string, m?: Material, subOverride?: string | null, qty?: number) {
        const sec = m?.section || section
        const subsection = subOverride !== undefined ? subOverride : (m?.subsection ?? null)
        const maxSort = Math.max(0, ...lines.filter((l) => l.section === sec).map((l) => l.sort))
        const payload = { job_id: jobId, item_id: item.id, section: sec, subsection, material_id: m?.id ?? null, description: m?.description ?? "", supplier: m?.supplier ?? null, qty: qty != null ? qty : (m ? 1 : 0), unit_cost: m?.unit_cost ?? 0, markup: m?.default_markup ?? 0.5, watts: m?.watts ?? null, sort: maxSort + 1, wt_factor: m?.mtr_weight ?? null }
        const { data, error } = await supabase.from("costing_lines").insert(payload).select("*").single()
        if (error) return toast.error(error.message)
        const added = data as CostingLine
        const next = [...lines, added]
        setLines((prev) => [...prev, added])
        if (isWeldingTime(added)) await syncArgonFromWelding(next)
        if (m?.mtr_weight != null) setShowWeights(true)
    }

    function stageAt(key: string, m: Material, section: string, sub: string | null) { setStaged({ m, section, sub }); setStagedQty("1"); setStagedAt(key); setTimeout(() => qtyRef.current?.select(), 0) }
    async function commitStaged() { if (!staged) return; const qty = Number(stagedQty); if (!Number.isFinite(qty) || qty <= 0) { toast.error("Enter a quantity greater than zero"); return } const focusKey = stagedAt; await addLine(staged.section, staged.m, staged.sub, qty); setStaged(null); setStagedAt(null); setAutoFocusAt(focusKey); setTimeout(() => setAutoFocusAt(null), 100) }
    function cancelStaged() { const focusKey = stagedAt; setStaged(null); setStagedAt(null); setAutoFocusAt(focusKey); setTimeout(() => setAutoFocusAt(null), 100) }

    async function addBlank(section: string, subsection: string | null = null) { await addLine(section, undefined, subsection) }
    async function updateLine(id: string, patch: Partial<CostingLine>) { setLines((prev) => prev.map((l) => l.id === id ? { ...l, ...patch } : l)); const { error } = await supabase.from("costing_lines").update(patch).eq("id", id); if (error) toast.error(error.message); if ("qty" in patch) { const updated = lines.map((line) => line.id === id ? { ...line, ...patch } : line); if (updated.some(isWeldingTime)) await syncArgonFromWelding(updated) } }
    async function removeLine(id: string) { const { error } = await supabase.from("costing_lines").delete().eq("id", id); if (error) return toast.error(error.message); const next = lines.filter((l) => l.id !== id); setLines(next); if (lines.find((l) => l.id === id && isWeldingTime(l))) await syncArgonFromWelding(next) }
    async function moveLineToSection(lineId: string, section: string) { const line = lines.find((candidate) => candidate.id === lineId); if (!line || line.section === section) return; const maxSort = Math.max(0, ...lines.filter((candidate) => candidate.section === section).map((candidate) => candidate.sort)); await updateLine(lineId, { section, subsection: null, sort: maxSort + 1 }); setDragOverSection(null); setDraggingLineId(null) }
    async function moveLine(id: string, dir: -1 | 1) { const line = lines.find((l) => l.id === id)!; const group = lines.filter((l) => l.section === line.section && l.subsection === line.subsection).sort((a, b) => a.sort - b.sort); const idx = group.findIndex((l) => l.id === id); const other = group[idx + dir]; if (!other) return; await Promise.all([supabase.from("costing_lines").update({ sort: other.sort }).eq("id", line.id), supabase.from("costing_lines").update({ sort: line.sort }).eq("id", other.id)]); setLines((prev) => prev.map((l) => l.id === line.id ? { ...l, sort: other.sort } : l.id === other.id ? { ...l, sort: line.sort } : l)) }
    async function moveSubsection(section: string, sub: string, dir: -1 | 1) { const subs = Array.from(new Set(lines.filter((l) => l.section === section && l.subsection).map((l) => l.subsection!))).sort((a, b) => (subOrder[`${section}|${a}`] ?? 999) - (subOrder[`${section}|${b}`] ?? 999)); const idx = subs.indexOf(sub); const other = subs[idx + dir]; if (!other) return; const aKey = `${section}|${sub}`, bKey = `${section}|${other}`; const aSort = subOrder[aKey] ?? idx, bSort = subOrder[bKey] ?? idx + dir; await Promise.all([supabase.from("costing_sections").update({ sort: bSort }).eq("section", section).eq("subsection", sub), supabase.from("costing_sections").update({ sort: aSort }).eq("section", section).eq("subsection", other)]); setSubOrder((p) => ({ ...p, [aKey]: bSort, [bKey]: aSort })) }
    async function addSubsection(section: string) { const name = prompt("Subsection name"); if (!name?.trim()) return; const trimmed = name.trim(); const maxSort = Math.max(0, ...Object.entries(subOrder).filter(([k]) => k.startsWith(`${section}|`)).map(([, v]) => v)); const { error } = await supabase.from("costing_sections").insert({ section, subsection: trimmed, sort: maxSort + 1 }); if (error) return toast.error(error.message); setSubOrder((p) => ({ ...p, [`${section}|${trimmed}`]: maxSort + 1 })); setAddingSubFor(null); await addBlank(section, trimmed) }
    async function addSection() { const name = prompt("Section name"); if (!name?.trim()) return; const trimmed = name.trim(); if (allSections.includes(trimmed)) return toast.error("That section already exists"); setExtraSections((p) => [...p, trimmed]); await addBlank(trimmed) }
    async function addNewMaterial(section: string, sub: string | null, m: Material) { await addLine(section, m, sub) }
    function replaceLineFromMaterial(line: CostingLine, m: Material) { void updateLine(line.id, { material_id: m.id, description: m.description, supplier: m.supplier, unit_cost: m.unit_cost, markup: m.default_markup, watts: m.watts ?? null, wt_factor: m.mtr_weight ?? null }); if (m.mtr_weight != null) setShowWeights(true) }

    const allSections = useMemo(() => Array.from(new Set([...definedSections, ...extraSections, ...lines.map((l) => l.section)])), [definedSections, extraSections, lines])
    const totals = useMemo(() => ({ cost: lines.reduce((s, l) => s + lineCost(l), 0), sell: lines.reduce((s, l) => s + lineSell(l), 0) }), [lines])
    const totalMargin = totals.sell > 0 ? 1 - totals.cost / totals.sell : 0
    const visibleColumns = COST_COLUMNS.filter((column) => !column.weight || showWeights)
    const visibleWidth = visibleColumns.reduce((sum, column) => sum + (widths[column.key] ?? column.width), 0) + 40

    function SectionRows({ section }: { section: string }) {
        const secLines = lines.filter((l) => l.section === section)
        const subs = Array.from(new Set(secLines.filter((l) => l.subsection).map((l) => l.subsection!))).sort((a, b) => (subOrder[`${section}|${a}`] ?? 999) - (subOrder[`${section}|${b}`] ?? 999))
        const noSub = secLines.filter((l) => !l.subsection).sort((a, b) => a.sort - b.sort)
        const renderLines = (ls: CostingLine[], sub: string | null) => ls.map((line, idx) => {
            const unitSellValue = unitSell(line); const key = subKey(section, sub)
            return <tr key={line.id} draggable onDragStart={(event) => { setDraggingLineId(line.id); event.dataTransfer.effectAllowed = "move" }} onDragEnd={() => { setDraggingLineId(null); setDragOverSection(null) }} className={`border-b border-border/30 group ${draggingLineId === line.id ? "opacity-40" : ""}`}>
                <td className="w-10 pl-1 pr-0"><div className="flex items-center"><button type="button" title="Drag to another section" className="p-0.5 cursor-grab text-muted-foreground/50 hover:text-foreground active:cursor-grabbing"><GripVertical className="size-3" /></button><div className="flex flex-col opacity-0 group-hover:opacity-100"><button onClick={() => moveLine(line.id, -1)} className="h-2.5 px-0.5 text-muted-foreground hover:text-foreground"><ChevronUp className="size-2.5" /></button><button onClick={() => moveLine(line.id, 1)} className="h-2.5 px-0.5 text-muted-foreground hover:text-foreground"><ChevronDown className="size-2.5" /></button></div></div></td>
                <td className="px-1 py-0.5"><MaterialCombobox key={`${line.id}-${line.material_id ?? "blank"}`} value={line.description} onSelect={(m) => replaceLineFromMaterial(line, m)} onTextCommit={(v) => updateLine(line.id, { description: v, material_id: null })} /></td>
                <td className="px-1 py-0.5"><SupplierCell value={line.supplier} onCommit={(v) => updateLine(line.id, { supplier: v })} suppliers={suppliers} /></td>
                <td className="px-1 py-0.5"><NumCell value={Number(line.qty)} onCommit={(v) => updateLine(line.id, { qty: v })} /></td>
                <td className="px-1 py-0.5"><NumCell value={Number(line.unit_cost)} onCommit={(v) => updateLine(line.id, { unit_cost: v })} /></td>
                <td className="px-1 py-0.5"><NumCell value={Number(line.markup)} onCommit={(v) => updateLine(line.id, { markup: v })} /></td>
                <td className="px-2 py-1 text-right text-xs text-muted-foreground">{nz(unitSellValue)}</td><td className="px-2 py-1 text-right text-xs font-medium">{nz(lineSell(line))}</td><td className="px-2 py-1 text-right text-xs text-muted-foreground">{pct(lineMargin(line))}</td>
                {showWeights && <><td className="px-1 py-0.5"><NumCell value={line.wt_factor == null ? null : Number(line.wt_factor)} onCommit={(v) => updateLine(line.id, { wt_factor: v })} placeholder="—" /></td><td className="px-1 py-0.5"><NumCell value={line.wt_size == null ? null : Number(line.wt_size)} onCommit={(v) => updateLine(line.id, { wt_size: v })} placeholder="—" /></td><td className="px-1 py-0.5"><NumCell value={line.wt_qty == null ? null : Number(line.wt_qty)} onCommit={(v) => updateLine(line.id, { wt_qty: v })} placeholder="—" /></td><td className="px-2 py-1 text-right text-xs font-medium">{lineWeight(line) > 0 ? `${lineWeight(line).toFixed(1)} kg` : "—"}</td></>}
                <td className="w-8 pr-1"><button onClick={() => removeLine(line.id)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive"><Trash2 className="size-3" /></button></td>
            </tr>
        })
        const addRow = (sub: string | null) => { const key = subKey(section, sub); return <tr key={`add-${key}`} className="border-b border-border/30"><td className="w-10" /><td className="px-1 py-0.5" colSpan={2}>{staged && stagedAt === key ? <div className="flex items-center gap-1.5"><span className="min-w-0 flex-1 truncate text-xs">{staged.m.description}</span><span className="text-xs text-muted-foreground">Qty:</span><input ref={qtyRef} value={stagedQty} onChange={(e) => setStagedQty(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitStaged(); if (e.key === "Escape") cancelStaged() }} className="h-6 w-16 rounded border px-1.5 text-xs text-right outline-none focus:border-primary" /><button onClick={commitStaged} className="text-green-700"><Check className="size-3.5" /></button><button onClick={cancelStaged} className="text-muted-foreground"><X className="size-3.5" /></button></div> : <MaterialCombobox key={`${key}-${autoFocusAt === key ? "focus" : "idle"}`} autoFocus={autoFocusAt === key} clearOnSelect placeholder="Search catalogue to add…" onSelect={(m) => stageAt(key, m, section, sub)} />}</td><td colSpan={Math.max(1, visibleColumns.length - 2)} /></tr> }
        return <Fragment><tr onDragOver={(event) => { if (!draggingLineId) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverSection(section) }} onDrop={(event) => { event.preventDefault(); if (draggingLineId) void moveLineToSection(draggingLineId, section) }} className={dragOverSection === section ? "bg-primary/10" : ""}><td colSpan={visibleColumns.length + 2} className="px-3 py-2 bg-muted/50 text-xs font-semibold">{section}{dragOverSection === section && <span className="ml-2 text-[10px] font-normal text-primary">Drop here</span>}</td></tr>{renderLines(noSub, null)}{addRow(null)}{subs.map((sub, si) => <Fragment key={sub}><tr><td className="w-10" /><td colSpan={visibleColumns.length + 1} className="px-2 py-1.5 bg-muted/25"><div className="flex items-center gap-1 text-xs font-medium"><span>{sub}</span><div className="flex ml-1"><button disabled={si === 0} onClick={() => moveSubsection(section, sub, -1)} className="p-0.5 disabled:opacity-20"><ChevronUp className="size-3" /></button><button disabled={si === subs.length - 1} onClick={() => moveSubsection(section, sub, 1)} className="p-0.5 disabled:opacity-20"><ChevronDown className="size-3" /></button></div></div></td></tr>{renderLines(secLines.filter((l) => l.subsection === sub).sort((a, b) => a.sort - b.sort), sub)}{addRow(sub)}</Fragment>)}</Fragment>
    }

    if (loading) return <div className="py-6 text-sm text-muted-foreground">Loading costing…</div>

    return <div className="space-y-3">
        <datalist id={SUPPLIER_LIST_ID}>{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
        <div className="flex items-center gap-2"><div className="flex-1">{staged && stagedAt === TOP_KEY ? <div className="flex h-9 items-center gap-2 rounded-md border px-2"><span className="min-w-0 flex-1 truncate text-sm">{staged.m.description}</span><span className="text-xs text-muted-foreground">Qty</span><input ref={qtyRef} value={stagedQty} onChange={(e) => setStagedQty(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitStaged(); if (e.key === "Escape") cancelStaged() }} className="h-7 w-20 rounded border px-2 text-right text-sm" /><Button size="sm" className="h-7 px-2" onClick={commitStaged}><Check className="size-3.5" /></Button><Button variant="ghost" size="sm" className="h-7 px-2" onClick={cancelStaged}><X className="size-3.5" /></Button></div> : <MaterialCombobox key={autoFocusAt === TOP_KEY ? "top-focus" : "top"} autoFocus={autoFocusAt === TOP_KEY} clearOnSelect placeholder="Add an item — type to search, then set its qty…" onSelect={(m) => stageAt(TOP_KEY, m, m.section || "Materials", m.subsection ?? null)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring" />}</div><select className="h-9 rounded-md border bg-background px-3 text-sm" value="" onChange={(e) => { if (e.target.value === "__new__") addSection(); else if (e.target.value) addBlank(e.target.value) }}><option value="">+ Add section</option>{definedSections.map((s) => <option key={s} value={s}>{s}</option>)}<option value="__new__">+ New section…</option></select><Button variant={showWeights ? "secondary" : "ghost"} size="sm" className="h-9 gap-1.5 text-xs" onClick={() => setShowWeights((v) => !v)}><Scale className="size-3.5" /> Weights (steel)</Button><Button variant="ghost" size="icon" className="size-9" onClick={resetColumns} title="Reset column widths"><RotateCcw className="size-3.5" /></Button></div>
        <div className="rounded-lg border border-border/60 bg-card overflow-x-auto"><table className="text-sm table-fixed" style={{ width: visibleWidth, minWidth: "100%" }}><colgroup><col style={{ width: 40 }} />{visibleColumns.map((column) => <col key={column.key} style={{ width: widths[column.key] ?? column.width }} />)}<col style={{ width: 32 }} /></colgroup><thead><tr><th className="w-10 border-b border-border/60" />{visibleColumns.map((column) => <CostColumnHeader key={column.key} column={column} width={widths[column.key] ?? column.width} onResize={setWidth} />)}<th className="w-8 border-b border-border/60" /></tr></thead><tbody>{allSections.map((section) => <SectionRows key={section} section={section} />)}</tbody><tfoot><tr className="border-t border-border/60"><td colSpan={Math.max(1, visibleColumns.length - 4)} className="px-3 py-2 text-xs font-medium">Subtotal</td><td className="px-2 py-2 text-right text-xs text-muted-foreground">{nz(totals.cost)}</td><td /><td /><td className="px-2 py-2 text-right text-xs font-semibold">{nz(totals.sell)}</td><td className="px-2 py-2 text-right text-xs">{pct(totalMargin)}</td>{showWeights && <td colSpan={4} />}<td /></tr></tfoot></table></div>
        <div className="flex gap-2 justify-end"><Button variant="outline" size="sm" onClick={() => openPicker("Materials")}><Package className="size-3.5 mr-1" /> Catalogue</Button><Button variant="outline" size="sm" onClick={() => addBlank("Materials")}><Plus className="size-3.5 mr-1" /> Blank</Button><Button variant="outline" size="sm" onClick={() => addSubsection("Materials")}><Plus className="size-3.5 mr-1" /> Subsection</Button></div>
        <MaterialPicker key={pickerNonce} open={!!pickerSection} onOpenChange={(o) => { if (!o) setPickerSection(null) }} onSelect={(m) => { if (pickerSection) addNewMaterial(pickerSection, pickerSub, m); setPickerSection(null) }} />
    </div>
}
