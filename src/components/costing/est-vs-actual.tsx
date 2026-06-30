"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { CostingJob, CostingItem, CostingLine, CostingTimeEntry, CostingMaterialActual } from "@/types/database"

const nz = (n: number) => n.toLocaleString("en-NZ", { style: "currency", currency: "NZD" })
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const unitSell = (l: CostingLine) => l.unit_sell_override != null ? Number(l.unit_sell_override) : Number(l.unit_cost) * (1 + Number(l.markup))

export function EstVsActual({ job }: { job: CostingJob }) {
    const supabase = useMemo(() => createClient(), [])
    const [items, setItems] = useState<CostingItem[]>([])
    const [lines, setLines] = useState<CostingLine[]>([])
    const [time, setTime] = useState<CostingTimeEntry[]>([])
    const [mats, setMats] = useState<CostingMaterialActual[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let active = true
        ;(async () => {
            const [{ data: it }, { data: l }, { data: t }, { data: m }] = await Promise.all([
                supabase.from("costing_items").select("*").eq("job_id", job.id),
                supabase.from("costing_lines").select("*").eq("job_id", job.id),
                supabase.from("costing_time_entries").select("*").eq("job_id", job.id),
                supabase.from("costing_material_actuals").select("*").eq("job_id", job.id),
            ])
            if (!active) return
            setItems((it as CostingItem[]) || [])
            setLines((l as CostingLine[]) || [])
            setTime((t as CostingTimeEntry[]) || [])
            setMats((m as CostingMaterialActual[]) || [])
            setLoading(false)
        })()
        return () => { active = false }
    }, [supabase, job.id])

    if (loading) return <div className="h-40 rounded-lg bg-muted/40 animate-pulse mt-6" />

    // item qty multiplier for a build line
    const qtyOf = (l: CostingLine) => Number(items.find((i) => i.id === l.item_id)?.qty ?? 1)
    const simpleItems = items.filter((i) => i.mode === "simple")

    // Estimate (build items' BOM × item qty, + simple items' cost/sell)
    const labourLines = lines.filter((l) => l.section === "Labour")
    const matLines = lines.filter((l) => l.section !== "Labour")
    const estLabourHours = labourLines.reduce((s, l) => s + qtyOf(l) * Number(l.qty), 0)
    const estLabourCost = labourLines.reduce((s, l) => s + qtyOf(l) * Number(l.qty) * Number(l.unit_cost), 0)
    const estMatCost = matLines.reduce((s, l) => s + qtyOf(l) * Number(l.qty) * Number(l.unit_cost), 0)
    const estSimpleCost = simpleItems.reduce((s, i) => s + Number(i.qty) * Number(i.unit_cost), 0)
    const estTotalCost = estLabourCost + estMatCost + estSimpleCost
    const sell = job.adjusted_total != null
        ? Number(job.adjusted_total)
        : lines.reduce((s, l) => s + qtyOf(l) * Number(l.qty) * unitSell(l), 0)
          + simpleItems.reduce((s, i) => s + Number(i.qty) * Number(i.unit_price), 0)

    // Actuals (simple items have no actual to log — carried at estimate)
    const actHours = time.reduce((s, r) => s + Number(r.hours), 0)
    const blendedRate = estLabourHours > 0 ? estLabourCost / estLabourHours : 0
    const actLabourCost = actHours * blendedRate          // actual hours costed at the estimated rate
    const actMatCost = mats.reduce((s, r) => s + Number(r.qty ?? 1) * Number(r.cost ?? 0), 0)
    const actTotalCost = actLabourCost + actMatCost + estSimpleCost

    const estProfit = sell - estTotalCost
    const actProfit = sell - actTotalCost
    const estMargin = sell > 0 ? estProfit / sell : 0
    const actMargin = sell > 0 ? actProfit / sell : 0

    const hasActuals = time.length > 0 || mats.length > 0
    const profitDelta = actProfit - estProfit  // negative = worse than quoted

    return (
        <div className="mt-6 space-y-6">
            {!hasActuals && (
                <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                    No actuals logged yet. Add time and materials on the <strong>Actuals</strong> tab and the
                    comparison fills in here. The figures below show the estimate against zero actuals so far.
                </div>
            )}

            {/* Headline */}
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <Tile label="Quoted (sell)" value={nz(sell)} />
                <Tile label="Estimated profit" value={nz(estProfit)} sub={pct(estMargin)} />
                <Tile label="Actual profit" value={nz(actProfit)} sub={pct(actMargin)}
                    className={actProfit < estProfit ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"} />
                <Tile label={profitDelta < 0 ? "Worse than quoted by" : "Better than quoted by"} value={nz(Math.abs(profitDelta))}
                    className={profitDelta < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"} />
            </div>

            {/* Breakdown */}
            <div className="rounded-lg border border-border/60 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground text-xs">
                        <tr className="text-left">
                            <th className="font-medium px-4 py-2.5">Line</th>
                            <th className="font-medium px-4 py-2.5 text-right">Estimated</th>
                            <th className="font-medium px-4 py-2.5 text-right">Actual</th>
                            <th className="font-medium px-4 py-2.5 text-right">Variance</th>
                        </tr>
                    </thead>
                    <tbody>
                        <Row label="Labour hours" est={`${estLabourHours.toFixed(2)} hrs`} act={`${actHours.toFixed(2)} hrs`}
                            variance={actHours - estLabourHours} fmt={(n) => `${n > 0 ? "+" : ""}${n.toFixed(2)} hrs`} overIsBad />
                        <Row label="Labour cost" est={nz(estLabourCost)} act={nz(actLabourCost)}
                            variance={actLabourCost - estLabourCost} fmt={(n) => `${n > 0 ? "+" : ""}${nz(n)}`} overIsBad sub="actual hrs × est. rate" />
                        <Row label="Material cost" est={nz(estMatCost)} act={nz(actMatCost)}
                            variance={actMatCost - estMatCost} fmt={(n) => `${n > 0 ? "+" : ""}${nz(n)}`} overIsBad />
                        {estSimpleCost > 0 && (
                            <Row label="Other (simple items)" est={nz(estSimpleCost)} act={nz(estSimpleCost)}
                                variance={0} fmt={() => "—"} sub="travel / freight / etc." />
                        )}
                        <Row label="Total cost" est={nz(estTotalCost)} act={nz(actTotalCost)}
                            variance={actTotalCost - estTotalCost} fmt={(n) => `${n > 0 ? "+" : ""}${nz(n)}`} overIsBad strong />
                        <Row label="Profit" est={nz(estProfit)} act={nz(actProfit)}
                            variance={actProfit - estProfit} fmt={(n) => `${n > 0 ? "+" : ""}${nz(n)}`} strong />
                        <Row label="Margin" est={pct(estMargin)} act={pct(actMargin)}
                            variance={actMargin - estMargin} fmt={(n) => `${n > 0 ? "+" : ""}${pct(n)}`} />
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function Tile({ label, value, sub, className = "" }: { label: string; value: string; sub?: string; className?: string }) {
    return (
        <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={`text-lg font-semibold tabular-nums mt-0.5 ${className}`}>{value}</div>
            {sub && <div className="text-xs text-muted-foreground tabular-nums">{sub}</div>}
        </div>
    )
}

function Row({ label, est, act, variance, fmt, overIsBad = false, strong = false, sub }: {
    label: string; est: string; act: string; variance: number; fmt: (n: number) => string
    overIsBad?: boolean; strong?: boolean; sub?: string
}) {
    const neutral = Math.abs(variance) < 1e-9
    // overIsBad: positive variance (over) is bad/red. Otherwise positive (more) is good/green.
    const good = overIsBad ? variance < 0 : variance > 0
    const color = neutral ? "text-muted-foreground" : good ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
    return (
        <tr className={`border-t border-border/60 ${strong ? "font-semibold" : ""}`}>
            <td className="px-4 py-2.5">{label}{sub && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({sub})</span>}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{est}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{act}</td>
            <td className={`px-4 py-2.5 text-right tabular-nums ${color}`}>{neutral ? "—" : fmt(variance)}</td>
        </tr>
    )
}
