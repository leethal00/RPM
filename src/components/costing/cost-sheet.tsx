"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, Package } from "lucide-react"
import { toast } from "sonner"
import { MaterialPicker } from "./material-picker"
import type { CostingJob, CostingLine, Material } from "@/types/database"

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
    const [loading, setLoading] = useState(true)
    const [pickerSection, setPickerSection] = useState<string | null>(null)
    const [adjusted, setAdjusted] = useState<string>(job.adjusted_total != null ? String(job.adjusted_total) : "")

    useEffect(() => {
        let active = true
        ;(async () => {
            const { data, error } = await supabase
                .from("costing_lines").select("*").eq("job_id", job.id)
                .order("section").order("subsection").order("sort").order("created_at")
            if (active) {
                if (error) toast.error(error.message)
                setLines((data as CostingLine[]) || [])
                setLoading(false)
            }
        })()
        return () => { active = false }
    }, [supabase, job.id])

    // ── mutations ───────────────────────────────────────────────
    async function addLine(section: string, m?: Material) {
        const payload = {
            job_id: job.id,
            section: m?.section || section,
            subsection: m?.subsection ?? null,
            material_id: m?.id ?? null,
            description: m?.description ?? "",
            supplier: m?.supplier ?? null,
            qty: m ? 1 : 0,
            unit_cost: m?.unit_cost ?? 0,
            markup: m?.default_markup ?? 0.5,
        }
        const { data, error } = await supabase.from("costing_lines").insert(payload).select("*").single()
        if (error) return toast.error(error.message)
        setLines((prev) => [...prev, data as CostingLine])
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
    const adjustedNum = adjusted.trim() === "" ? sell : Number(adjusted) || sell
    const profit = adjustedNum - cost
    const perUnit = job.qty ? adjustedNum / Number(job.qty) : adjustedNum

    if (loading) return <div className="h-40 rounded-lg bg-muted/40 animate-pulse mt-6" />

    return (
        <div className="mt-6 space-y-6">
            {SECTIONS.map((section) => {
                const secLines = lines.filter((l) => l.section === section)
                const secCost = secLines.reduce((s, l) => s + lineCost(l), 0)
                const secSell = secLines.reduce((s, l) => s + lineSell(l), 0)
                return (
                    <section key={section} className="rounded-lg border border-border/60 overflow-hidden">
                        <div className="flex items-center justify-between bg-muted/40 px-4 py-2.5">
                            <h3 className="text-sm font-semibold">{section}</h3>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground tabular-nums">
                                    {nz(secCost)} → {nz(secSell)}
                                </span>
                                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                                    onClick={() => setPickerSection(section)}>
                                    <Package className="size-3" /> Catalogue
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                                    onClick={() => addLine(section)}>
                                    <Plus className="size-3" /> Blank
                                </Button>
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
                                            <th className="w-8"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {secLines.map((l) => (
                                            <tr key={l.id} className="border-b border-border/40 last:border-0">
                                                <td className="px-3 py-1">
                                                    <TextCell value={l.description} placeholder="Description"
                                                        onCommit={(v) => patchLine(l.id, { description: v })} />
                                                </td>
                                                <td className="px-2 py-1">
                                                    <TextCell value={l.supplier ?? ""} placeholder="—"
                                                        onCommit={(v) => patchLine(l.id, { supplier: v || null })} />
                                                </td>
                                                <td className="px-2 py-1">
                                                    <NumCell value={l.qty} onCommit={(v) => patchLine(l.id, { qty: v ?? 0 })} />
                                                </td>
                                                <td className="px-2 py-1">
                                                    <NumCell value={l.unit_cost} onCommit={(v) => patchLine(l.id, { unit_cost: v ?? 0 })} />
                                                </td>
                                                <td className="px-2 py-1">
                                                    <NumCell value={l.markup} step="0.05" onCommit={(v) => patchLine(l.id, { markup: v ?? 0 })} />
                                                </td>
                                                <td className="px-2 py-1">
                                                    <NumCell value={l.unit_sell_override} placeholder={unitSell(l).toFixed(2)}
                                                        onCommit={(v) => patchLine(l.id, { unit_sell_override: v })} />
                                                </td>
                                                <td className="px-2 py-1 text-right tabular-nums">{nz(lineSell(l))}</td>
                                                <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{pct(lineMargin(l))}</td>
                                                <td className="px-1 py-1 text-right">
                                                    <button onClick={() => removeLine(l.id)}
                                                        className="text-muted-foreground hover:text-destructive transition-colors p-1">
                                                        <Trash2 className="size-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
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
                        <input
                            type="number" step="any"
                            value={adjusted}
                            placeholder={sell.toFixed(2)}
                            onChange={(e) => setAdjusted(e.target.value)}
                            onBlur={(e) => saveAdjusted(e.target.value)}
                            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm tabular-nums"
                        />
                    </div>
                    <Tile label="Profit" value={nz(profit)} className={profit < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"} />
                    <Tile label={`Per unit (÷ ${Number(job.qty)})`} value={nz(perUnit)} />
                </div>
            </div>

            <MaterialPicker
                open={pickerSection != null}
                section={pickerSection ?? undefined}
                onOpenChange={(o) => { if (!o) setPickerSection(null) }}
                onPick={(m) => { if (pickerSection) addLine(pickerSection, m) }}
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

// Uncontrolled inputs keyed to the committed value: typing stays local, and a
// commit (or external change) updates the prop -> key changes -> input re-seeds.
function NumCell({ value, onCommit, step, placeholder }: {
    value: number | null
    onCommit: (v: number | null) => void
    step?: string
    placeholder?: string
}) {
    const committed = value == null ? "" : String(value)
    return (
        <input
            key={committed}
            type="number" step={step ?? "any"} defaultValue={committed} placeholder={placeholder}
            onBlur={(e) => {
                const raw = e.target.value
                const n = raw.trim() === "" ? null : Number(raw)
                if (n != null && isNaN(n)) { e.target.value = committed; return }
                if (n !== value) onCommit(n)
            }}
            className="w-full rounded border border-transparent hover:border-input focus:border-input bg-transparent px-1.5 py-1 text-sm text-right tabular-nums outline-none"
        />
    )
}

function TextCell({ value, onCommit, placeholder }: {
    value: string
    onCommit: (v: string) => void
    placeholder?: string
}) {
    return (
        <input
            key={value}
            type="text" defaultValue={value} placeholder={placeholder}
            onBlur={(e) => { if (e.target.value !== value) onCommit(e.target.value) }}
            className="w-full rounded border border-transparent hover:border-input focus:border-input bg-transparent px-1.5 py-1 text-sm outline-none"
        />
    )
}
