"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, Package, ChevronUp, ChevronDown, BookmarkPlus } from "lucide-react"
import { toast } from "sonner"
import { MaterialPicker } from "./material-picker"
import { NumCell, TextCell, SupplierCell } from "./cells"
import type { CostingJob, CostingLine, CostingSection, Material } from "@/types/database"

const SUPPLIER_LIST_ID = "costing-suppliers-dl"

const SECTIONS = ["Materials", "Wiring - LED", "Labour", "Pack/Despatch/Freight"] as const

const nz = (n: number) => n.toLocaleString("en-NZ", { style: "currency", currency: "NZD" })
const pct = (n: number) => `${(n * 100).toFixed(1)}%`

// Derived line maths — mirrors the DB generated columns so edits feel instant.
const unitSell = (l: CostingLine) =>
    l.unit_sell_override != null ? Number(l.unit_sell_override) : Number(l.unit_cost) * (1 + Number(l.markup))
const lineCost = (l: CostingLine) => Number(l.qty) * Number(l.unit_cost)
const lineSell = (l: CostingLine) => Number(l.qty) * unitSell(l)
const lineMargin = (l: CostingLine) => { const s = lineSell(l); return s > 0 ? 1 - lineCost(l) / s : 0 }

export function CostSheet({ job }: { job: CostingJob }) {
    const supabase = useMemo(() => createClient(), [])
    const [lines, setLines] = useState<CostingLine[]>([])
    const [subOrder, setSubOrder] = useState<Record<string, number>>({})
    const [suppliers, setSuppliers] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [pickerSection, setPickerSection] = useState<string | null>(null)
    const [pickerSub, setPickerSub] = useState<string | null>(null)
    const [pickerNonce, setPickerNonce] = useState(0)
    const [addingSubFor, setAddingSubFor] = useState<string | null>(null)
    const [adjusted, setAdjusted] = useState<string>(job.adjusted_total != null ? String(job.adjusted_total) : "")

    useEffect(() => {
        let active = true
        ;(async () => {
            const [{ data: ls, error }, { data: secs }, { data: sups }] = await Promise.all([
                supabase.from("costing_lines").select("*").eq("job_id", job.id),
                supabase.from("costing_sections").select("*"),
                supabase.from("costing_suppliers").select("name").order("name"),
            ])
            if (!active) return
            if (error) toast.error(error.message)
            setLines((ls as CostingLine[]) || [])
            const order: Record<string, number> = {}
            ;((secs as CostingSection[]) || []).forEach((s) => { if (s.subsection) order[`${s.section}|${s.subsection}`] = s.sort })
            setSubOrder(order)
            setSuppliers(((sups as { name: string }[]) || []).map((s) => s.name))
            setLoading(false)
        })()
        return () => { active = false }
    }, [supabase, job.id])

    function openPicker(section: string, sub: string | null = null) {
        setPickerSection(section); setPickerSub(sub); setPickerNonce((n) => n + 1)
    }

    // ── mutations ───────────────────────────────────────────────
    // subOverride: force the line into a specific subsection (used by group buttons
    // and "+ Subsection"); undefined keeps the catalogue item's own subsection.
    async function addLine(section: string, m?: Material, subOverride?: string | null) {
        const sec = m?.section || section
        const subsection = subOverride !== undefined ? subOverride : (m?.subsection ?? null)
        const maxSort = Math.max(0, ...lines.filter((l) => l.section === sec).map((l) => l.sort))
        const payload = {
            job_id: job.id, section: sec, subsection, material_id: m?.id ?? null,
            description: m?.description ?? "", supplier: m?.supplier ?? null,
            qty: m ? 1 : 0, unit_cost: m?.unit_cost ?? 0, markup: m?.default_markup ?? 0.5, sort: maxSort + 1,
        }
        const { data, error } = await supabase.from("costing_lines").insert(payload).select("*").single()
        if (error) return toast.error(error.message)
        setLines((prev) => [...prev, data as CostingLine])
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
            .eq("job_id", job.id).eq("section", section).eq("subsection", oldSub)
        if (error) toast.error(error.message)
    }

    async function patchLine(id: string, patch: Partial<CostingLine>) {
        setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
        const { error } = await supabase.from("costing_lines").update(patch).eq("id", id)
        if (error) toast.error(error.message)
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

    async function saveAdjusted(value: string) {
        const num = value.trim() === "" ? null : Number(value)
        if (num != null && isNaN(num)) return
        const { error } = await supabase.from("costing_jobs").update({ adjusted_total: num }).eq("id", job.id)
        if (error) toast.error(error.message)
    }

    // ── totals ──────────────────────────────────────────────────
    const cost = lines.reduce((s, l) => s + lineCost(l), 0)
    const sell = lines.reduce((s, l) => s + lineSell(l), 0)
    const margin = sell > 0 ? 1 - cost / sell : 0
    const totalHours = lines.filter((l) => l.section === "Labour").reduce((s, l) => s + Number(l.qty), 0)
    const totalWeight = lines.reduce((s, l) => s + Number(l.qty) * Number(l.weight_kg ?? 0), 0)
    const adjustedNum = adjusted.trim() === "" ? sell : Number(adjusted) || sell
    const profit = adjustedNum - cost
    const perUnit = job.qty ? adjustedNum / Number(job.qty) : adjustedNum

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

    return (
        <div className="mt-6 space-y-6">
            <datalist id={SUPPLIER_LIST_ID}>
                {suppliers.map((s) => <option key={s} value={s} />)}
            </datalist>
            {SECTIONS.map((section) => {
                const secLines = lines.filter((l) => l.section === section)
                const secCost = secLines.reduce((s, l) => s + lineCost(l), 0)
                const secSell = secLines.reduce((s, l) => s + lineSell(l), 0)
                const groups = groupsFor(section)
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
                                            <th className="font-medium px-2 py-2 w-20 text-right" title="Weight per unit (kg) — for galvanising">Wt (kg)</th>
                                            <th className="w-16"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groups.map(({ sub, rows }) => (
                                            <Fragment key={`g-${section}-${sub || "none"}`}>
                                                {sub && (
                                                    <tr className="group/sub">
                                                        <td colSpan={10} className="bg-muted/20 px-3 py-1.5">
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
                                                            <TextCell value={l.description} placeholder="Description" onCommit={(v) => patchLine(l.id, { description: v })} />
                                                        </td>
                                                        <td className="px-2 py-1">
                                                            <SupplierCell value={l.supplier ?? ""} placeholder="—" listId={SUPPLIER_LIST_ID} onCommit={(v) => commitSupplier(l, v)} />
                                                        </td>
                                                        <td className="px-2 py-1"><NumCell value={l.qty} onCommit={(v) => patchLine(l.id, { qty: v ?? 0 })} /></td>
                                                        <td className="px-2 py-1"><NumCell value={l.unit_cost} onCommit={(v) => patchLine(l.id, { unit_cost: v ?? 0 })} /></td>
                                                        <td className="px-2 py-1"><NumCell value={l.markup} step="0.05" onCommit={(v) => patchLine(l.id, { markup: v ?? 0 })} /></td>
                                                        <td className="px-2 py-1"><NumCell value={l.unit_sell_override} placeholder={unitSell(l).toFixed(2)} onCommit={(v) => patchLine(l.id, { unit_sell_override: v })} /></td>
                                                        <td className="px-2 py-1 text-right tabular-nums">{nz(lineSell(l))}</td>
                                                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{pct(lineMargin(l))}</td>
                                                        <td className="px-2 py-1"><NumCell value={l.weight_kg} placeholder="—" onCommit={(v) => patchLine(l.id, { weight_kg: v })} /></td>
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
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                )
            })}

            {/* Grand totals */}
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Tile label="Cost" value={nz(cost)} />
                    <Tile label="Sell" value={nz(sell)} />
                    <Tile label="Margin" value={pct(margin)} />
                    <Tile label="Total hours" value={totalHours.toFixed(2)} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border/60 items-end">
                    <div>
                        <label className="text-xs text-muted-foreground">Adjusted total (override)</label>
                        <input type="number" step="any" value={adjusted} placeholder={sell.toFixed(2)}
                            onChange={(e) => setAdjusted(e.target.value)} onBlur={(e) => saveAdjusted(e.target.value)}
                            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm tabular-nums" />
                    </div>
                    <Tile label="Profit" value={nz(profit)} className={profit < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"} />
                    <Tile label={`Per unit (÷ ${Number(job.qty)})`} value={nz(perUnit)} />
                    <Tile label="Total weight" value={`${totalWeight.toFixed(1)} kg`} />
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                    Total weight feeds the galvanising calc (per-kg) — final formula to come once Stu shares a galvanised sample sheet.
                </div>
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
