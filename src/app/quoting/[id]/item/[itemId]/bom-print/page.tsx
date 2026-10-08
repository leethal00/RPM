"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Printer } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { bomTotals, effectiveBuildSell, sellMargin } from "@/lib/costing/pricing"
import type { CostingItem, CostingLine } from "@/types/database"

type PrintJob = {
    id: string
    title: string
    reference: string | null
    job_number: string | null
    is_template: boolean
    clients: { name: string } | null
    stores: { name: string } | null
}

type SummaryRow = { label: string; count: number; cost: number; sell: number }

const money = (value: number) => value.toLocaleString("en-NZ", { style: "currency", currency: "NZD" })
const number = (value: number) => value.toLocaleString("en-NZ", { maximumFractionDigits: 2 })
const percent = (value: number) => (value * 100).toFixed(1) + "%"
const unitSell = (line: CostingLine) => line.unit_sell_override != null
    ? Number(line.unit_sell_override)
    : Number(line.unit_cost) * (1 + Number(line.markup))
const lineCost = (line: CostingLine) => Number(line.qty) * Number(line.unit_cost)
const lineSell = (line: CostingLine) => Number(line.qty) * unitSell(line)

function sectionSummary(lines: CostingLine[]): SummaryRow[] {
    const rows = new Map<string, SummaryRow>()
    for (const line of lines) {
        const label = line.section?.trim() || "Other"
        const row = rows.get(label) || { label, count: 0, cost: 0, sell: 0 }
        row.count += 1
        row.cost += lineCost(line)
        row.sell += lineSell(line)
        rows.set(label, row)
    }
    const ordered = [...rows.values()].sort((a, b) => b.cost - a.cost || a.label.localeCompare(b.label))
    if (ordered.length <= 7) return ordered
    const other = ordered.slice(6).reduce((sum, row) => ({
        label: "Other sections (" + (ordered.length - 6) + ")",
        count: sum.count + row.count,
        cost: sum.cost + row.cost,
        sell: sum.sell + row.sell,
    }), { label: "", count: 0, cost: 0, sell: 0 })
    return [...ordered.slice(0, 6), other]
}

export default function BomPrintPage() {
    const params = useParams()
    const jobId = params.id as string
    const itemId = params.itemId as string
    const supabase = useMemo(() => createClient(), [])
    const [job, setJob] = useState<PrintJob | null>(null)
    const [item, setItem] = useState<CostingItem | null>(null)
    const [lines, setLines] = useState<CostingLine[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")

    useEffect(() => {
        let active = true
        ;(async () => {
            const [jobResult, itemResult, lineResult] = await Promise.all([
                supabase.from("costing_jobs").select("id,title,reference,job_number,is_template,clients(name),stores(name)").eq("id", jobId).single(),
                supabase.from("costing_items").select("*").eq("id", itemId).single(),
                supabase.from("costing_lines").select("*").eq("item_id", itemId).order("sort"),
            ])
            if (!active) return
            if (jobResult.error || itemResult.error || lineResult.error || !itemResult.data || itemResult.data.job_id !== jobId) {
                setError("This BOM could not be loaded. Return to the item and try again.")
            } else {
                setJob(jobResult.data as unknown as PrintJob)
                setItem(itemResult.data as CostingItem)
                setLines((lineResult.data as CostingLine[]) || [])
            }
            setLoading(false)
        })()
        return () => { active = false }
    }, [supabase, jobId, itemId])

    const backHref = "/quoting/" + jobId + "/item/" + itemId
    const totals = bomTotals(lines)
    const itemQty = Number(item?.qty ?? 1)
    const importedSell = !!item?.xero_imported_line && item.xero_line_amount != null && itemQty !== 0
    const finalUnitSell = item
        ? importedSell
            ? Number(item.xero_line_amount) / itemQty
            : effectiveBuildSell(totals.sell, item.unit_price)
        : 0
    const finalMargin = sellMargin(totals.cost, finalUnitSell)
    const sections = sectionSummary(lines)
    const largestLines = [...lines]
        .filter((line) => line.description.trim())
        .sort((a, b) => lineCost(b) - lineCost(a))
        .slice(0, 6)
    const issued = new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })

    return (
        <div className="bom-print-app">
            <div className="bom-print-toolbar">
                <Link href={backHref} className="bom-back"><ArrowLeft size={15} /> Back to BOM</Link>
                <span>One-page A4 overview</span>
                <button type="button" onClick={() => window.print()} disabled={loading || !!error}>
                    <Printer size={16} /> Print / Save PDF
                </button>
            </div>

            {loading ? <p className="bom-message">Loading BOM overview…</p> : error || !item || !job
                ? <p className="bom-message">{error || "BOM not found."}</p>
                : <main className="bom-sheet">
                    <header className="bom-header">
                        <div className="bom-brand"><span>RPM</span><strong>Rodier Property Management</strong></div>
                        <div className="bom-document-kind">INTERNAL COSTING · BOM OVERVIEW</div>
                    </header>

                    <div className="bom-title-row">
                        <div>
                            <p className="bom-eyebrow">Bill of materials</p>
                            <h1>{item.name || "Untitled build item"}</h1>
                            <p className="bom-subtitle">{job.is_template ? "Product template" : job.title}</p>
                        </div>
                        <div className="bom-reference">
                            <span>{job.is_template ? "PRODUCT" : "JOB"}</span>
                            <strong>{job.is_template ? "Template" : (job.job_number || "—")}</strong>
                        </div>
                    </div>

                    <div className="bom-details">
                        <div><span>Client / site</span><strong>{[job.clients?.name, job.stores?.name].filter(Boolean).join(" · ") || "—"}</strong></div>
                        <div><span>Reference</span><strong>{job.reference || "—"}</strong></div>
                        <div><span>Item quantity</span><strong>{number(itemQty)}</strong></div>
                        <div><span>Prepared</span><strong>{issued}</strong></div>
                    </div>

                    <div className="bom-metrics">
                        <div><span>BOM cost / item</span><strong>{money(totals.cost)}</strong></div>
                        <div><span>Calculated sell / item</span><strong>{money(totals.sell)}</strong></div>
                        <div className="bom-metric-accent"><span>Final sell / item</span><strong>{money(finalUnitSell)}</strong></div>
                        <div><span>Final margin</span><strong>{percent(finalMargin)}</strong></div>
                    </div>

                    <section className="bom-section">
                        <div className="bom-section-heading"><h2>Section breakdown</h2><span>All {lines.length} BOM lines included in totals</span></div>
                        <table>
                            <thead><tr><th>Section</th><th>Lines</th><th>Cost / item</th><th>Calculated sell / item</th><th>Margin</th></tr></thead>
                            <tbody>
                                {sections.length ? sections.map((row) => (
                                    <tr key={row.label}>
                                        <td>{row.label}</td><td>{row.count}</td><td>{money(row.cost)}</td><td>{money(row.sell)}</td>
                                        <td>{percent(sellMargin(row.cost, row.sell))}</td>
                                    </tr>
                                )) : <tr><td colSpan={5} className="bom-empty">No BOM lines yet</td></tr>}
                            </tbody>
                            <tfoot><tr><td>BOM total</td><td>{lines.length}</td><td>{money(totals.cost)}</td><td>{money(totals.sell)}</td><td>{percent(totals.margin)}</td></tr></tfoot>
                        </table>
                    </section>

                    <section className="bom-section bom-largest">
                        <div className="bom-section-heading"><h2>Largest cost lines</h2><span>{largestLines.length} of {lines.length} lines shown</span></div>
                        <table>
                            <thead><tr><th>Material or labour</th><th>Qty</th><th>Cost / item</th><th>Calculated sell / item</th></tr></thead>
                            <tbody>
                                {largestLines.length ? largestLines.map((line) => (
                                    <tr key={line.id}>
                                        <td><span className="bom-line-name">{line.description}</span><small>{[line.section, line.subsection].filter(Boolean).join(" · ")}</small></td>
                                        <td>{number(Number(line.qty))}</td><td>{money(lineCost(line))}</td><td>{money(lineSell(line))}</td>
                                    </tr>
                                )) : <tr><td colSpan={4} className="bom-empty">Add materials or labour to see a breakdown</td></tr>}
                            </tbody>
                        </table>
                    </section>

                    <div className="bom-overall">
                        <div><span>Item quantity</span><strong>{number(itemQty)}</strong></div>
                        <div><span>Total cost</span><strong>{money(totals.cost * itemQty)}</strong></div>
                        <div><span>Total final sell</span><strong>{money(finalUnitSell * itemQty)}</strong></div>
                        <div><span>Gross profit</span><strong>{money((finalUnitSell - totals.cost) * itemQty)}</strong></div>
                    </div>

                    <footer className="bom-footer">
                        <span>Internal overview · Full line-by-line BOM is available in RPM.</span>
                        <span>1 / 1</span>
                    </footer>
                </main>}

            <style>{[
                "@page { size: A4 portrait; margin: 0; }",
                "* { box-sizing: border-box; }",
                "body { margin: 0; }",
                ".bom-print-app { min-height: 100vh; overflow-x: auto; background: #e8edea; color: #172a22; font-family: Arial, Helvetica, sans-serif; }",
                ".bom-print-toolbar { width: 210mm; margin: 0 auto; padding: 14px 0; display: flex; align-items: center; justify-content: space-between; gap: 18px; font-size: 13px; color: #53645b; }",
                ".bom-back { display: inline-flex; align-items: center; gap: 6px; color: #174e3b; text-decoration: none; font-weight: 700; }",
                ".bom-print-toolbar button { display: inline-flex; align-items: center; gap: 7px; border: 0; border-radius: 7px; padding: 9px 14px; color: white; background: #115d48; font-weight: 700; cursor: pointer; }",
                ".bom-print-toolbar button:disabled { opacity: .5; cursor: default; }",
                ".bom-message { margin: 12vh auto; width: min(90vw, 520px); text-align: center; font-size: 15px; }",
                ".bom-sheet { width: 210mm; height: 297mm; margin: 0 auto 28px; padding: 11mm 12mm 9mm; overflow: hidden; background: white; box-shadow: 0 12px 36px #1a352530; display: flex; flex-direction: column; }",
                ".bom-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 6mm; border-bottom: 2px solid #115d48; }",
                ".bom-brand { display: flex; align-items: center; gap: 9px; font-size: 10px; }",
                ".bom-brand span { display: grid; place-items: center; width: 37px; height: 37px; border-radius: 8px; background: #115d48; color: white; font-weight: 800; font-size: 14px; letter-spacing: -.5px; }",
                ".bom-brand strong { font-size: 12px; }",
                ".bom-document-kind { color: #115d48; font-size: 9px; font-weight: 800; letter-spacing: 1.2px; }",
                ".bom-title-row { display: flex; justify-content: space-between; gap: 18px; padding: 6mm 0 5mm; }",
                ".bom-eyebrow { margin: 0 0 3px; color: #3b7964; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }",
                ".bom-title-row h1 { max-width: 136mm; margin: 0; font-size: 23px; line-height: 1.12; letter-spacing: -.5px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }",
                ".bom-subtitle { margin: 5px 0 0; max-width: 136mm; color: #5d6c62; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
                ".bom-reference { flex: none; min-width: 30mm; text-align: right; }",
                ".bom-reference span, .bom-details span, .bom-metrics span, .bom-overall span { display: block; color: #687970; font-size: 9px; text-transform: uppercase; letter-spacing: .5px; }",
                ".bom-reference strong { display: block; margin-top: 3px; color: #115d48; font-size: 17px; }",
                ".bom-details { display: grid; grid-template-columns: 2fr 1.7fr .8fr .8fr; gap: 12px; padding: 4mm 0; border-top: 1px solid #d8e3db; border-bottom: 1px solid #d8e3db; }",
                ".bom-details strong { display: block; margin-top: 4px; font-size: 10px; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
                ".bom-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin: 5mm 0 6mm; }",
                ".bom-metrics > div { padding: 11px 9px; min-width: 0; border-radius: 5px; background: #edf4ef; }",
                ".bom-metrics .bom-metric-accent { background: #115d48; }",
                ".bom-metrics .bom-metric-accent span, .bom-metrics .bom-metric-accent strong { color: white; }",
                ".bom-metrics strong { display: block; margin-top: 5px; font-size: 15px; white-space: nowrap; }",
                ".bom-section { margin-top: 1mm; }",
                ".bom-section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 2mm; }",
                ".bom-section-heading h2 { margin: 0; color: #115d48; font-size: 13px; }",
                ".bom-section-heading span { color: #738178; font-size: 9px; }",
                ".bom-section table { width: 100%; border-collapse: collapse; table-layout: fixed; }",
                ".bom-section th { padding: 7px 6px; background: #115d48; color: white; font-size: 9px; text-align: left; }",
                ".bom-section td { height: 8mm; padding: 6px; border-bottom: 1px solid #dce6df; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
                ".bom-section th:not(:first-child), .bom-section td:not(:first-child) { text-align: right; }",
                ".bom-section th:first-child { width: 37%; }",
                ".bom-section tfoot td { color: #115d48; background: #edf4ef; font-weight: 800; border-bottom: 0; }",
                ".bom-empty { text-align: center !important; color: #829188; }",
                ".bom-largest { margin-top: 7mm; }",
                ".bom-largest th:first-child { width: 52%; }",
                ".bom-largest td { height: 9mm; }",
                ".bom-largest td:first-child { white-space: normal; }",
                ".bom-line-name { display: block; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
                ".bom-largest small { display: block; color: #78877e; font-size: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
                ".bom-overall { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-top: auto; padding-top: 6mm; }",
                ".bom-overall > div { padding: 10px 8px; border-top: 2px solid #115d48; background: #f5f8f5; }",
                ".bom-overall strong { display: block; margin-top: 5px; font-size: 14px; white-space: nowrap; }",
                ".bom-footer { display: flex; justify-content: space-between; margin-top: 5mm; padding-top: 3mm; border-top: 1px solid #d8e3db; color: #78877e; font-size: 9px; }",
                "@media print { html, body { width: 210mm; height: 297mm; margin: 0 !important; padding: 0 !important; overflow: hidden !important; } .bom-print-app { width: 210mm; height: 297mm; min-height: 0; overflow: hidden; background: white; } .bom-print-toolbar, .bom-message { display: none !important; } .bom-sheet { width: 210mm; height: 297mm; margin: 0; box-shadow: none; break-inside: avoid; page-break-inside: avoid; } .bom-header, .bom-metrics, .bom-section th, .bom-section tfoot td, .bom-overall > div { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }",
            ].join("\n")}</style>
        </div>
    )
}
