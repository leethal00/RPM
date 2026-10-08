"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Printer } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { bomTotals, effectiveBuildSell, sellMargin } from "@/lib/costing/pricing"
import type { CostingItem, CostingLine, CostingSection } from "@/types/database"

type PrintJob = {
    id: string
    title: string
    reference: string | null
    job_number: string | null
    is_template: boolean
    clients: { name: string } | null
    stores: { name: string } | null
}

const SECTION_HEADING_CODE = "__RPM_SECTION_HEADING__"

type SectionItem = Pick<CostingItem, "id" | "name" | "sign_code" | "sort">

type PrintLine = CostingLine & {
    materials?: { unit: string | null } | { unit: string | null }[] | null
}

const defaultSections = ["Materials", "Steel", "Wiring - LED", "Labour", "Pack/Despatch/Freight"]
const money = (value: number) => value.toLocaleString("en-NZ", { style: "currency", currency: "NZD" })
const number = (value: number) => value.toLocaleString("en-NZ", { maximumFractionDigits: 2 })
const percent = (value: number) => (value * 100).toFixed(1) + "%"
const unitSell = (line: CostingLine) => line.unit_sell_override != null
    ? Number(line.unit_sell_override)
    : Number(line.unit_cost) * (1 + Number(line.markup))
const lineCost = (line: CostingLine) => Number(line.qty) * Number(line.unit_cost)
const lineSell = (line: CostingLine) => Number(line.qty) * unitSell(line)
const unit = (line: PrintLine) => {
    const material = Array.isArray(line.materials) ? line.materials[0] : line.materials
    return material?.unit || "—"
}

function groupedLines(lines: PrintLine[], definitions: CostingSection[]) {
    const defined = [...definitions].sort((a, b) => a.sort - b.sort)
    const definedSections = Array.from(new Set(defined.map((row) => row.section)))
    const sectionNames = [
        ...definedSections,
        ...defaultSections.filter((section) => !definedSections.includes(section)),
        ...Array.from(new Set(lines.map((line) => line.section))).filter((section) => !definedSections.includes(section) && !defaultSections.includes(section)),
    ]
    const subsectionOrder = new Map(defined.filter((row) => row.subsection).map((row) => [row.section + "|" + row.subsection, row.sort]))
    return sectionNames.filter((section) => lines.some((line) => line.section === section)).map((section) => {
        const sectionLines = lines.filter((line) => line.section === section)
        const subsections = Array.from(new Set(sectionLines.map((line) => line.subsection || "")))
            .sort((a, b) => (subsectionOrder.get(section + "|" + a) ?? 9999) - (subsectionOrder.get(section + "|" + b) ?? 9999) || a.localeCompare(b))
        return {
            section,
            lines: subsections.flatMap((subsection) =>
                sectionLines.filter((line) => (line.subsection || "") === subsection).sort((a, b) => a.sort - b.sort)
            ),
        }
    })
}

export default function BomPrintPage() {
    const params = useParams()
    const jobId = params.id as string
    const itemId = params.itemId as string
    const supabase = useMemo(() => createClient(), [])
    const [job, setJob] = useState<PrintJob | null>(null)
    const [item, setItem] = useState<CostingItem | null>(null)
    const [sectionName, setSectionName] = useState("")
    const [lines, setLines] = useState<PrintLine[]>([])
    const [definitions, setDefinitions] = useState<CostingSection[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")

    useEffect(() => {
        let active = true
        ;(async () => {
            const [jobResult, itemResult, lineResult, sectionResult, itemsResult] = await Promise.all([
                supabase.from("costing_jobs").select("id,title,reference,job_number,is_template,clients(name),stores(name)").eq("id", jobId).single(),
                supabase.from("costing_items").select("*").eq("id", itemId).single(),
                supabase.from("costing_lines").select("*,materials(unit)").eq("item_id", itemId),
                supabase.from("costing_sections").select("*"),
                supabase.from("costing_items").select("id,name,sign_code,sort").eq("job_id", jobId).order("sort"),
            ])
            if (!active) return
            if (jobResult.error || itemResult.error || lineResult.error || sectionResult.error || itemsResult.error || !itemResult.data || itemResult.data.job_id !== jobId) {
                setError("This BOM could not be loaded. Return to the item and try again.")
            } else {
                setJob(jobResult.data as unknown as PrintJob)
                setItem(itemResult.data as CostingItem)
                const orderedItems = (itemsResult.data as SectionItem[]) || []
                const itemIndex = orderedItems.findIndex((row) => row.id === itemId)
                const heading = itemIndex < 0 ? undefined : orderedItems.slice(0, itemIndex).reverse().find((row) => row.sign_code === SECTION_HEADING_CODE)
                setSectionName(heading?.name?.trim() || "")
                setLines((lineResult.data as PrintLine[]) || [])
                setDefinitions((sectionResult.data as CostingSection[]) || [])
            }
            setLoading(false)
        })()
        return () => { active = false }
    }, [supabase, jobId, itemId])

    const backHref = "/quoting/" + jobId + "/item/" + itemId
    const groups = groupedLines(lines, definitions)
    const totals = bomTotals(lines)
    const itemQty = Number(item?.qty ?? 1)
    const rawBatchQty = Number(item?.build_qty ?? item?.qty ?? 1)
    const batchQty = Number.isFinite(rawBatchQty) && rawBatchQty > 0 ? rawBatchQty : 1
    const costPerUnit = totals.cost / batchQty
    const size = item?.size?.trim()
    const description = item?.details?.trim()
    const delivery = item?.delivery?.trim()
    const hasDescription = Boolean(size || description || delivery)
    const importedSell = !!item?.xero_imported_line && item.xero_line_amount != null && itemQty !== 0
    const finalUnitSell = item
        ? importedSell
            ? Number(item.xero_line_amount) / itemQty
            : effectiveBuildSell(totals.sell / batchQty, item.unit_price)
        : 0
    // The page reserves 210 mm for the table. Keep every line visible, including large BOMs.
    const lineHeight = Math.min(5.3, (210 - (hasDescription ? 18 : 0) - groups.length * 4 - 12) / Math.max(1, lines.length))
    const lineFont = Math.min(8.5, Math.max(5, lineHeight * 1.55))
    const issued = new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })

    return (
        <div className="bom-print-app">
            <div className="bom-print-toolbar">
                <Link href={backHref} className="bom-back"><ArrowLeft size={15} /> Back to BOM</Link>
                <span>One-page A4 · {lines.length} line items</span>
                <button type="button" onClick={() => window.print()} disabled={loading || !!error}>
                    <Printer size={16} /> Print / Save PDF
                </button>
            </div>

            {loading ? <p className="bom-message">Loading BOM…</p> : error || !item || !job
                ? <p className="bom-message">{error || "BOM not found."}</p>
                : <main className="bom-sheet">
                    <header className="bom-header">
                        <div className="bom-brand"><span>RPM</span><strong>Rodier Property Management</strong></div>
                        <div className="bom-document-kind">INTERNAL COSTING · FULL BOM</div>
                    </header>

                    <div className="bom-title-row">
                        <div>
                            <p className="bom-eyebrow">{sectionName ? `Section · ${sectionName}` : "Bill of materials"}</p>
                            <h1>{item.name || "Untitled build item"}</h1>
                            <p className="bom-subtitle">{job.is_template ? "Product template" : job.title}</p>
                        </div>
                        <div className="bom-reference">
                            <span>{job.is_template ? "PRODUCT" : "JOB"}</span>
                            <strong>{job.is_template ? "Template" : (job.job_number || "—")}</strong>
                        </div>
                    </div>

                    {hasDescription && <div className="bom-quote-description">
                        <span>Customer quote description</span>
                        {size && <p><strong>Size:</strong> {size}</p>}
                        {description && <p><strong>Details:</strong> {description}</p>}
                        {delivery && <p><strong>Delivery:</strong> {delivery}</p>}
                    </div>}

                    <div className="bom-details">
                        <div><span>Client / site</span><strong>{[job.clients?.name, job.stores?.name].filter(Boolean).join(" · ") || "—"}</strong></div>
                        <div><span>Reference</span><strong>{job.reference || "—"}</strong></div>
                        <div><span>Item qty</span><strong>{number(itemQty)}</strong></div>
                        <div><span>BOM batch qty</span><strong>{number(batchQty)}</strong></div>
                        <div><span>Prepared</span><strong>{issued}</strong></div>
                    </div>

                    <div className="bom-table-wrap">
                        <table className="bom-table">
                            <colgroup><col className="bom-col-description" /><col className="bom-col-qty" /><col className="bom-col-unit" /><col className="bom-col-unit-cost" /><col className="bom-col-cost" /><col className="bom-col-unit-sell" /><col className="bom-col-sell" /></colgroup>
                            <thead><tr><th>Item / description</th><th>Qty</th><th>Unit</th><th>Unit cost</th><th>Cost</th><th>Unit sell</th><th>Sell</th></tr></thead>
                            {groups.map((group) => (
                                <tbody key={group.section}>
                                    <tr className="bom-group"><td colSpan={7}>{group.section}</td></tr>
                                    {group.lines.map((line) => (
                                        <tr key={line.id} className="bom-line" style={{ height: lineHeight + "mm", fontSize: lineFont + "px" }}>
                                            <td title={line.description}>
                                                <span className="bom-description">{line.description || "Unnamed line"}</span>
                                                {line.subsection && <span className="bom-subsection"> · {line.subsection}</span>}
                                            </td>
                                            <td>{number(Number(line.qty))}</td>
                                            <td>{unit(line)}</td>
                                            <td>{money(Number(line.unit_cost))}</td>
                                            <td>{money(lineCost(line))}</td>
                                            <td>{money(unitSell(line))}</td>
                                            <td>{money(lineSell(line))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            ))}
                            {!groups.length && <tbody><tr><td colSpan={7} className="bom-empty">No BOM lines yet</td></tr></tbody>}
                            <tfoot>
                                <tr><td>BOM total · {lines.length} lines</td><td colSpan={3}></td><td>{money(totals.cost)}</td><td></td><td>{money(totals.sell)}</td></tr>
                                <tr className="bom-per-unit"><td>Cost per unit · total ÷ {number(batchQty)} batch units</td><td colSpan={3}></td><td>{money(costPerUnit)}</td><td colSpan={2}></td></tr>
                            </tfoot>
                        </table>
                    </div>

                    <div className="bom-totals">
                        <div><span>BOM cost · {number(batchQty)} units</span><strong>{money(totals.cost)}</strong></div>
                        <div><span>Cost per unit</span><strong>{money(costPerUnit)}</strong></div>
                        <div><span>Final sell / unit</span><strong>{money(finalUnitSell)}</strong></div>
                        <div><span>Final margin</span><strong>{percent(sellMargin(costPerUnit, finalUnitSell))}</strong></div>
                        <div><span>Final sell · {number(itemQty)} quoted</span><strong>{money(finalUnitSell * itemQty)}</strong></div>
                    </div>

                    <footer className="bom-footer">
                        <span>Internal bill of materials · BOM totals cover the batch shown; unit cost = total cost ÷ batch qty.</span>
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
                ".bom-sheet { width: 210mm; height: 297mm; margin: 0 auto 28px; padding: 9mm 10mm 8mm; overflow: hidden; background: white; box-shadow: 0 12px 36px #1a352530; display: flex; flex-direction: column; }",
                ".bom-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 3mm; border-bottom: 2px solid #115d48; }",
                ".bom-brand { display: flex; align-items: center; gap: 9px; font-size: 10px; }",
                ".bom-brand span { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 7px; background: #115d48; color: white; font-weight: 800; font-size: 13px; }",
                ".bom-brand strong { font-size: 11px; }",
                ".bom-document-kind { color: #115d48; font-size: 9px; font-weight: 800; letter-spacing: 1px; }",
                ".bom-title-row { display: flex; justify-content: space-between; gap: 18px; padding: 4mm 0 3mm; }",
                ".bom-eyebrow { max-width: 138mm; margin: 0 0 2px; color: #3b7964; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
                ".bom-title-row h1 { max-width: 138mm; margin: 0; font-size: 19px; line-height: 1.1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }",
                ".bom-subtitle { margin: 3px 0 0; max-width: 138mm; color: #5d6c62; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
                ".bom-reference { flex: none; min-width: 30mm; text-align: right; }",
                ".bom-reference span, .bom-details span, .bom-totals span { display: block; color: #687970; font-size: 8px; text-transform: uppercase; letter-spacing: .4px; }",
                ".bom-reference strong { display: block; margin-top: 3px; color: #115d48; font-size: 15px; }",
                ".bom-quote-description { padding: 0 0 2.5mm; font-size: 9px; line-height: 1.3; overflow-wrap: anywhere; }",
                ".bom-quote-description > span { display: block; margin-bottom: 1mm; color: #3b7964; font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; }",
                ".bom-quote-description p { margin: 0 0 .7mm; white-space: pre-wrap; }",
                ".bom-quote-description strong { color: #53645b; }",
                ".bom-details { display: grid; grid-template-columns: 1.7fr 1.2fr .6fr .75fr .7fr; gap: 10px; padding: 2mm 0; border-top: 1px solid #d8e3db; border-bottom: 1px solid #d8e3db; }",
                ".bom-details strong { display: block; margin-top: 2px; font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
                ".bom-table-wrap { flex: 0 1 auto; min-height: 0; margin-top: 4mm; overflow: hidden; }",
                ".bom-table { width: 100%; border-collapse: collapse; table-layout: fixed; }",
                ".bom-col-description { width: 49%; } .bom-col-qty { width: 7%; } .bom-col-unit { width: 6%; } .bom-col-unit-cost { width: 9.5%; } .bom-col-cost { width: 9.5%; } .bom-col-unit-sell { width: 9.5%; } .bom-col-sell { width: 9.5%; }",
                ".bom-table th { height: 6mm; padding: 0 3px; background: #115d48; color: white; font-size: 8px; text-align: right; white-space: nowrap; }",
                ".bom-table th:first-child, .bom-table td:first-child { text-align: left; }",
                ".bom-table td { padding: 0 3px; border-bottom: 1px solid #dce6df; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }",
                ".bom-table .bom-group { height: 4mm; background: #eaf3ee; color: #115d48; font-size: 8px; font-weight: 800; }",
                ".bom-table .bom-group td { border-bottom: 1px solid #c8d9cd; padding-left: 4px; }",
                ".bom-description { font-weight: 600; } .bom-subsection { color: #738178; font-size: .9em; }",
                ".bom-table tfoot td { height: 6mm; background: #eaf3ee; color: #115d48; font-size: 9px; font-weight: 800; border-top: 2px solid #115d48; }",
                ".bom-table tfoot .bom-per-unit td { background: #f2f7f3; border-top: 1px solid #c8d9cd; }",
                ".bom-empty { height: 30mm; text-align: center !important; color: #829188; }",
                ".bom-totals { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; margin-top: 3mm; }",
                ".bom-totals > div { padding: 7px 6px; background: #f2f7f3; border-top: 2px solid #115d48; }",
                ".bom-totals strong { display: block; margin-top: 3px; font-size: 12px; white-space: nowrap; }",
                ".bom-footer { display: flex; justify-content: space-between; margin-top: auto; padding-top: 2mm; border-top: 1px solid #d8e3db; color: #78877e; font-size: 8px; }",
                "@media print { html, body { width: 210mm; height: 297mm; margin: 0 !important; padding: 0 !important; overflow: hidden !important; } .bom-print-app { width: 210mm; height: 297mm; min-height: 0; overflow: hidden; background: white; } .bom-print-toolbar, .bom-message { display: none !important; } .bom-sheet { width: 210mm; height: 297mm; margin: 0; box-shadow: none; break-inside: avoid; page-break-inside: avoid; } .bom-header, .bom-table th, .bom-table .bom-group, .bom-table tfoot td, .bom-totals > div { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }",
            ].join("\n")}</style>
        </div>
    )
}
