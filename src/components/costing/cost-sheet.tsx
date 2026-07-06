"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, Package, ChevronUp, ChevronDown, BookmarkPlus, Scale, Check, X } from "lucide-react"
import { toast } from "sonner"
import { MaterialPicker } from "./material-picker"
import { MaterialCombobox } from "./material-combobox"
import { NumCell, TextCell, SupplierCell } from "./cells"
import type { CostingItem, CostingLine, CostingSection, Material } from "@/types/database"

const SUPPLIER_LIST_ID = "costing-suppliers-dl"

const SECTIONS = ["Materials", "Steel", "Wiring - LED", "Labour", "Pack/Despatch/Freight"] as const

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
// Weight (kg) for galvanising = factor × size × qty (manual; independent of cost qty).
const lineWeight = (l: CostingLine) => Number(l.wt_factor ?? 0) * Number(l.wt_size ?? 0) * Number(l.wt_qty ?? 0)
const LED_LOADING = 1.2          // fixed 20% "fuck factor" — keeps drivers ≤ 80% load
const MODULES_PER_HOUR = 25
const isWiringLabour = (l: CostingLine) => l.description.toLowerCase().includes("wiring labour")

// Scoped to a single item's BOM. Lines carry both job_id (for job-level rollups)
// and item_id (this item).
export function CostSheet({ jobId, item }: { jobId: string; item: CostingItem }) {
    const supabase = useMemo(() => createClient(), [])
    const [lines, setLines] = useState<CostingLine[]>([])
    const [subOrder, setSubOrder] = useState<Record<string, number>>({})
    const [suppliers, setSuppliers] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [pickerSection, setPickerSection] = useState<string | null>(null)
    const [pickerSub, setPickerSub] = useState<string | null>(null)
    const [pickerNonce, setPickerNonce] = useState(0)
    const [addingSubFor, setAddingSubFor] = useState<string | null>(null)
    const [showWeights, setShowWeights] = useState(false)
    const [extraSections, setExtraSections] = useState<string[]>([])

    // Staged add: pick a material, set its qty, then commit — no scrolling to find it.
    const [staged, setStaged] = useState<Material | null>(null)
    const [stagedQty, setStagedQty] = useState("1")
    const [keepAdding, setKeepAdding] = useState(false)
    const qtyRef = useRef<HTMLInputElement | null>(null)

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
            if (loaded.some((l) => l.wt_factor != null || l.wt_size != null)) setShowWeights(true)  // steel jobs auto-show
            const order: Record<string, number> = {}
            ;((secs as CostingSection[]) || []).forEach((s) => { if (s.subsection) order[`${s.section}|${s.subsection}`] = s.sort })
            setSubOrder(order)
            setSuppliers(((sups as { name: string }[]) || []).map((s) => s.name))
            setLoading(false)
        })()
        return () => { active = false }
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
            // Steel carries a per-unit weight (kg/m or kg/sheet) — seed the galvanising weight calc.
            wt_factor: m?.mtr_weight ?? null,
        }
        const { data, error } = await supabase.from("costing_lines").insert(payload).select("*").single()
        if (error) return toast.error(error.message)
        setLines((prev) => [...prev, data as CostingLine])
        if (m?.mtr_weight != null) setShowWeights(true) // steel added -> reveal the weight columns
    }

    // Stage a picked material so its qty can be typed before the line is added.
    function stageMaterial(m: Material) {
        setStaged(m)
        setStagedQty("1")
        setKeepAdding(true)
        setTimeout(() => qtyRef.current?.select(), 0) // focus + select so typing replaces "1"
    }

    async function commitStaged() {
        if (!staged) return
        const q = Number(stagedQty)
        await addLine(staged.section, staged, staged.subsection, isNaN(q) ? 0 : q)
        setStaged(null)
        setStagedQty("1")
    }

    function cancelStaged() {
        setStaged(null)
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
        setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
        const { error } = await supabase.from("costing_lines").update(patch).eq("id", id)
        if (error) toast.error(error.message)
    }

    // Type-ahead pick on a line: fill it from a catalogue material (keep its section/subsection).
    function fillLineFromMaterial(line: CostingLine, m: Material) {
        patchLine(line.id, { description: m.description, supplier: m.supplier, unit_cost: m.unit_cost, markup: m.default_markup, material_id: m.id })
    }

    async function removeLine(id: string) {
        setLines((prev) => prev.filter((l) => l.id !== id))
        const { error } = await supabase.from("costing_lines").delete().eq("id", id)
        if (error) toast.error(error.message)
    }

    // Set a line's supplier and remember any new supplier name for reuse.
    async function commitSupplier(line: CostingLine, value: string) {
        const name = value.trim()
        patchLine(line.id, { supplier: name || null })
        if (name && !suppliers.includes(name)) {
            setSuppliers((p) => [...p, name].sort((a, b) => a.localeCompare(b)))
            await supabase.from("costing_suppliers").insert({ name })   // unique conflict is harmless
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
        await patchLine(line.id, { material_id: (data as { id: string }).id })
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

    // ── totals (per one of this item) ───────────────────────────
    const cost = lines.reduce((s, l) => s + lineCost(l), 0)
    const sell = lines.reduce((s, l) => s + lineSell(l), 0)
    const margin = sell > 0 ? 1 - cost / sell : 0
    const totalHours = lines.filter((l) => l.section === "Labour").reduce((s, l) => s + Number(l.qty), 0)
    const totalWeight = lines.reduce((s, l) => s + lineWeight(l), 0)
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
        ...SECTIONS.filter((s) => withLines.includes(s) || extraSections.includes(s)),
        ...withLines.filter((s) => !(SECTIONS as readonly string[]).includes(s)),
    ]
    const addableSections = SECTIONS.filter((s) => !activeSections.includes(s))

    return (
        <div className="mt-6 space-y-6">
            <datalist id={SUPPLIER_LIST_ID}>
                {suppliers.map((s) => <option key={s} value={s} />)}
            </datalist>

            {/* Add-item type-ahead — builds sections/subsections from what you pick */}
            <div className="flex items-center gap-2">
                <div className="flex-1 max-w-2xl relative">
                    {staged ? (
                        <div className="flex items-center gap-2 rounded-md border border-ring bg-background pl-2 pr-1.5 py-1">
                            <span className="min-w-0 flex-1 truncate text-sm" title={staged.description}>{staged.description}</span>
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
                    ) : (
                        <MaterialCombobox
                            clearOnSelect
                            autoFocus={keepAdding}
                            placeholder="Add an item — type to search, then set its qty…"
                            onSelect={stageMaterial}
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
                const modLines = isWiring ? secLines.filter((l) => l.subsection === "Modules") : []
                const ledLoad = modLines.reduce((s, l) => s + Number(l.qty) * Number(l.watts ?? 0), 0)
                const ledRequired = ledLoad * LED_LOADING
                const driverCap = isWiring ? secLines.filter((l) => l.subsection === "Transformers").reduce((s, l) => s + Number(l.qty) * Number(l.watts ?? 0), 0) : 0
                const moduleCount = modLines.reduce((s, l) => s + Number(l.qty), 0)
                const wiringHrs = moduleCount / MODULES_PER_HOUR
                return (
                    <section key={section} className="rounded-lg border border-border/60 overflow-hidden">
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

                        {isWiring && (ledLoad > 0 || moduleCount > 0) && (
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border/60 bg-amber-500/5 px-4 py-2 text-xs">
                                <span>LED load <span className="font-semibold tabular-nums">{ledLoad.toFixed(1)}w</span> × 1.2 = <span className="font-semibold text-foreground tabular-nums">{ledRequired.toFixed(1)}w required</span></span>
                                <span className={driverCap >= ledRequired ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                                    Drivers selected <span className="font-semibold tabular-nums">{driverCap.toFixed(0)}w</span>{" "}
                                    {ledRequired === 0 ? "" : driverCap >= ledRequired ? "✓ covered" : `⚠ short ${(ledRequired - driverCap).toFixed(0)}w`}
                                </span>
                                <span className="text-muted-foreground tabular-nums">{moduleCount} modules ≈ {wiringHrs.toFixed(2)} hr wiring labour</span>
                            </div>
                        )}

                        {secLines.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-muted-foreground text-xs">
                                        <tr className="text-left border-b border-border/60">
                                            <th className="font-medium px-3 py-2 min-w-[220px]">Description</th>
                                            <th className="font-medium px-2 py-2 w-24">Supplier</th>
                                            <th className="font-medium px-2 py-2 w-16 text-right">Qty</th>
                                            <th className="font-medium px-2 py-2 w-24 text-right">Unit cost</th>
                                            <th className="font-medium px-2 py-2 w-20 text-right" title="Markup on cost as a decimal (0.5 = 50%)">Markup</th>
                                            <th className="font-medium px-2 py-2 w-24 text-right">Unit sell</th>
                                            <th className="font-medium px-2 py-2 w-24 text-right">Sell</th>
                                            <th className="font-medium px-2 py-2 w-16 text-right">Margin</th>
                                            {showWeights && <>
                                                <th className="font-medium px-2 py-2 w-20 text-right" title="kg per metre (linear) or per m² (plate)">kg/unit</th>
                                                <th className="font-medium px-2 py-2 w-20 text-right" title="Length used (m) or area (m²)">Size</th>
                                                <th className="font-medium px-2 py-2 w-16 text-right" title="Number of pieces">Wt qty</th>
                                                <th className="font-medium px-2 py-2 w-20 text-right" title="Weight = kg/unit × size × qty">Weight</th>
                                            </>}
                                            <th className="w-16"></th>
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
                                                    <tr key={l.id} className="border-b border-border/40 last:border-0 group">
                                                        <td className="px-3 py-1">
                                                            <MaterialCombobox key={l.description} value={l.description} placeholder="Description / type to search…"
                                                                onSelect={(m) => fillLineFromMaterial(l, m)}
                                                                onTextCommit={(v) => patchLine(l.id, { description: v })} />
                                                        </td>
                                                        <td className="px-2 py-1">
                                                            <SupplierCell value={l.supplier ?? ""} placeholder="—" listId={SUPPLIER_LIST_ID} onCommit={(v) => commitSupplier(l, v)} />
                                                        </td>
                                                        <td className="px-2 py-1">
                                                            <NumCell value={l.qty} onCommit={(v) => patchLine(l.id, { qty: v ?? 0 })} />
                                                            {showWeights && isGalvPerKg(l) && totalWeight > 0 && Math.abs(Number(l.qty) - totalWeight) > 0.01 && (
                                                                <button onClick={() => patchLine(l.id, { qty: Math.round(totalWeight * 100) / 100 })}
                                                                    className="mt-0.5 text-[10px] leading-tight text-primary hover:underline whitespace-nowrap"
                                                                    title="Set qty to the total steel weight">
                                                                    = {totalWeight.toFixed(1)} kg
                                                                </button>
                                                            )}
                                                            {isWiring && isWiringLabour(l) && wiringHrs > 0 && Math.abs(Number(l.qty) - wiringHrs) > 0.01 && (
                                                                <button onClick={() => patchLine(l.id, { qty: Math.round(wiringHrs * 100) / 100 })}
                                                                    className="mt-0.5 text-[10px] leading-tight text-primary hover:underline whitespace-nowrap"
                                                                    title="Set wiring labour to modules ÷ 25">
                                                                    = {wiringHrs.toFixed(2)} hr
                                                                </button>
                                                            )}
                                                        </td>
                                                        <td className="px-2 py-1"><NumCell value={l.unit_cost} onCommit={(v) => patchLine(l.id, { unit_cost: v ?? 0 })} /></td>
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Tile label="Cost" value={nz(cost)} />
                    <Tile label="Sell" value={nz(sell)} />
                    <Tile label="Margin" value={pct(margin)} />
                    <Tile label="Total hours" value={totalHours.toFixed(2)} />
                </div>
                {(itemQty !== 1 || showWeights) && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border/60">
                        {itemQty !== 1 && <Tile label={`Line total (× ${itemQty})`} value={nz(sell * itemQty)} />}
                        {showWeights && <Tile label="Total weight" value={`${totalWeight.toFixed(1)} kg`} />}
                    </div>
                )}
                {showWeights && (
                    <div className="mt-3 text-xs text-muted-foreground">
                        Total weight feeds the galvanising calc — set a galvanising line&apos;s qty to it via its &quot;= kg&quot; link.
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
