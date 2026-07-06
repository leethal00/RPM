"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Printer, ArrowLeft } from "lucide-react"
import Link from "next/link"
import type { CostingJob, CostingItem, CostingLine } from "@/types/database"

const SECTIONS = ["Materials", "Wiring - LED", "Labour", "Pack/Despatch/Freight"] as const
const DEPARTMENTS = ["Design", "CNC Router", "Metal Fab", "Welding", "Paint", "Vinyl / Print", "Electrical", "Assembly", "Install", "Pack / Freight"]
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-NZ", { day: "2-digit", month: "short", year: "numeric" })
const blankRows = (n: number) => Array.from({ length: n })

export default function JobCardPage() {
    const supabase = useMemo(() => createClient(), [])
    const params = useParams()
    const id = params.id as string
    const [job, setJob] = useState<CostingJob | null>(null)
    const [items, setItems] = useState<CostingItem[]>([])
    const [lines, setLines] = useState<CostingLine[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let active = true
        ;(async () => {
            const [{ data: j }, { data: it }, { data: l }] = await Promise.all([
                supabase.from("costing_jobs").select(`*, clients ( name ), stores ( name )`).eq("id", id).single(),
                supabase.from("costing_items").select("*").eq("job_id", id).order("sort"),
                supabase.from("costing_lines").select("*").eq("job_id", id).order("section").order("subsection").order("sort"),
            ])
            if (!active) return
            setJob(j as CostingJob)
            setItems((it as CostingItem[]) || [])
            setLines((l as CostingLine[]) || [])
            setLoading(false)
        })()
        return () => { active = false }
    }, [supabase, id])

    if (loading) return <div className="p-10 text-sm text-muted-foreground">Loading job card…</div>
    if (!job) return <div className="p-10 text-sm text-muted-foreground">Job not found.</div>

    const buildItems = items.filter((i) => i.mode === "build").sort((a, b) => a.sort - b.sort)
    const simpleItems = items.filter((i) => i.mode === "simple").sort((a, b) => a.sort - b.sort)
    const showItemHeaders = items.length > 1
    const qtyOf = (l: CostingLine) => Number(items.find((i) => i.id === l.item_id)?.qty ?? 1)
    const estHours = lines.filter((l) => l.section === "Labour").reduce((s, l) => s + qtyOf(l) * Number(l.qty), 0)

    return (
        <div className="min-h-screen bg-neutral-100 print:bg-white text-black">
            {/* @page + print rules */}
            <style>{`@page { size: A4; margin: 12mm; } @media print { .no-print { display: none !important; } }`}</style>

            {/* Toolbar (screen only) */}
            <div className="no-print sticky top-0 z-10 flex items-center justify-between bg-white border-b px-4 py-2.5">
                <Link href={`/quoting/${id}`} className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-black">
                    <ArrowLeft className="size-4" /> Back to job
                </Link>
                <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 text-white text-sm px-3 py-1.5 hover:bg-neutral-700">
                    <Printer className="size-4" /> Print / Save as PDF
                </button>
            </div>

            {/* Sheet */}
            <div className="mx-auto my-6 print:my-0 w-[210mm] max-w-full bg-white print:shadow-none shadow-sm p-[12mm] print:p-0 text-[11px] leading-snug">
                {/* Header */}
                <div className="flex items-start justify-between border-b-2 border-black pb-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <div className="size-9 rounded-md bg-black text-white grid place-items-center font-bold text-lg">R</div>
                            <div>
                                <div className="text-xl font-bold tracking-tight leading-none">JOB CARD</div>
                                <div className="text-[10px] text-neutral-500">Rodier — Creators of Unique Things</div>
                            </div>
                        </div>
                        <div className="mt-3 text-base font-semibold">{job.title}</div>
                        <div className="text-neutral-600">
                            {job.clients?.name || "Ad-hoc / wholesale"}{job.stores?.name ? ` · ${job.stores.name}` : ""}
                            {job.reference ? ` — ${job.reference}` : ""}
                        </div>
                    </div>
                    <table className="text-[10px] border border-neutral-300">
                        <tbody>
                            <Field label="Job / Invoice #" value={job.job_number || job.xero_invoice_number || ""} />
                            <Field label="Quoted by" value="" />
                            <Field label="Qty" value={String(Number(job.qty))} />
                            <Field label="Est. hours" value={estHours.toFixed(1)} />
                            <Field label="Created" value={fmtDate(job.created_at)} />
                            <Field label="Due" value="" />
                            <Field label="Completed" value="" />
                        </tbody>
                    </table>
                </div>

                {/* Department routing */}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border border-neutral-300 p-2">
                    <span className="font-semibold uppercase text-[10px] tracking-wide text-neutral-500 self-center">Departments:</span>
                    {DEPARTMENTS.map((d) => (
                        <label key={d} className="inline-flex items-center gap-1.5"><span className="inline-block size-3.5 border border-neutral-500" />{d}</label>
                    ))}
                </div>

                {/* Build spec + labour, per item */}
                {buildItems.map((item) => {
                    const itemLines = lines.filter((l) => l.item_id === item.id)
                    const itemBuild = itemLines.filter((l) => l.section !== "Labour")
                    return (
                        <div key={item.id}>
                            <SectionTitle>
                                {showItemHeaders ? `${item.name || "Item"}${Number(item.qty) > 1 ? ` × ${Number(item.qty)}` : ""} — build spec` : "Build spec"}
                            </SectionTitle>
                            {(item.size || item.details || item.delivery) && (
                                <div className="mb-1 border border-neutral-300 bg-neutral-50 px-2 py-1 text-[10.5px] text-neutral-700 space-y-0.5">
                                    {item.size && <div><span className="text-neutral-500">Size: </span>{item.size}</div>}
                                    {item.details && <div><span className="text-neutral-500">Details: </span>{item.details}</div>}
                                    {item.delivery && <div><span className="text-neutral-500">Delivery: </span>{item.delivery}</div>}
                                </div>
                            )}
                            <table className="w-full border border-neutral-300 border-collapse table-fixed">
                                <thead>
                                    <tr className="bg-neutral-100 text-left">
                                        <th className="border border-neutral-300 px-2 py-1 font-semibold">Item</th>
                                        <th className="border border-neutral-300 px-2 py-1 font-semibold w-14 text-right">Est. qty</th>
                                        <th className="border border-neutral-300 px-2 py-1 font-semibold w-[52mm]">Done ✓ / notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {SECTIONS.filter((s) => s !== "Labour").map((section) => {
                                        const rows = itemBuild.filter((l) => l.section === section)
                                        if (!rows.length) return null
                                        return <FragmentRows key={section} title={section} rows={rows} />
                                    })}
                                    {itemBuild.length === 0 && (
                                        <tr><td colSpan={3} className="px-2 py-3 text-center text-neutral-400">No build lines yet.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )
                })}

                {/* Simple items */}
                {simpleItems.length > 0 && (
                    <>
                        <SectionTitle>Other items</SectionTitle>
                        <table className="w-full border border-neutral-300 border-collapse table-fixed">
                            <thead>
                                <tr className="bg-neutral-100 text-left">
                                    <th className="border border-neutral-300 px-2 py-1 font-semibold">Item</th>
                                    <th className="border border-neutral-300 px-2 py-1 font-semibold w-14 text-right">Qty</th>
                                    <th className="border border-neutral-300 px-2 py-1 font-semibold w-[52mm]">Done ✓ / notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {simpleItems.map((i) => (
                                    <tr key={i.id}>
                                        <td className="border border-neutral-300 px-2 py-1">{i.name || "—"}</td>
                                        <td className="border border-neutral-300 px-2 py-1 text-right tabular-nums">{Number(i.qty)}</td>
                                        <td className="border border-neutral-300 px-2 py-1" />
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                )}

                {/* Time actuals (blank, to fill on the floor) */}
                <SectionTitle>Hours worked</SectionTitle>
                <CaptureTable cols={["Date", "Name", "Hours", "Description"]} widths={["w-24", "w-32", "w-16", ""]} rows={8} />

                {/* Materials actuals (blank) */}
                <SectionTitle>Materials / orders used</SectionTitle>
                <CaptureTable cols={["Date", "Supplier", "Description", "Qty"]} widths={["w-24", "w-32", "", "w-14"]} rows={8} />

                {/* H&S Take 5 + notes */}
                <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="border border-neutral-300 p-2">
                        <div className="font-semibold uppercase text-[10px] tracking-wide text-neutral-500 mb-1">H&amp;S — Take 5</div>
                        <ol className="list-decimal list-inside space-y-0.5">
                            <li>Stop — think about the task</li>
                            <li>Look — identify the hazards</li>
                            <li>Assess — the risks</li>
                            <li>Control — eliminate / minimise</li>
                            <li>Monitor — is it still safe?</li>
                        </ol>
                        <div className="mt-3 flex items-end gap-2">
                            <span className="text-neutral-500">Signed:</span>
                            <span className="flex-1 border-b border-neutral-400 h-4" />
                        </div>
                    </div>
                    <div className="border border-neutral-300 p-2">
                        <div className="font-semibold uppercase text-[10px] tracking-wide text-neutral-500 mb-1">Notes</div>
                        <div className="space-y-3 pt-1">
                            {blankRows(5).map((_, i) => <div key={i} className="border-b border-neutral-200 h-4" />)}
                        </div>
                    </div>
                </div>

                <div className="mt-3 text-[9px] text-neutral-400 text-center">
                    Generated from RPM cost sheet — {fmtDate(new Date().toISOString())}. Internal production document, not for client distribution.
                </div>
            </div>
        </div>
    )
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <tr>
            <td className="border border-neutral-300 px-2 py-0.5 text-neutral-500 whitespace-nowrap">{label}</td>
            <td className="border border-neutral-300 px-2 py-0.5 font-medium min-w-[26mm]">{value || " "}</td>
        </tr>
    )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return <div className="mt-4 mb-1 font-bold uppercase text-[10px] tracking-wider text-neutral-700">{children}</div>
}

function FragmentRows({ title, rows }: { title: string; rows: CostingLine[] }) {
    return (
        <>
            <tr><td colSpan={3} className="bg-neutral-50 px-2 py-0.5 font-semibold text-neutral-600">{title}</td></tr>
            {rows.map((l) => (
                <tr key={l.id}>
                    <td className="border border-neutral-300 px-2 py-1 break-words">
                        {l.description}
                        {l.internal_note && <span className="text-neutral-500 italic"> — {l.internal_note}</span>}
                    </td>
                    <td className="border border-neutral-300 px-2 py-1 text-right tabular-nums">{Number(l.qty)}</td>
                    <td className="border border-neutral-300 px-2 py-1" />
                </tr>
            ))}
        </>
    )
}

function CaptureTable({ cols, widths, rows }: { cols: string[]; widths: string[]; rows: number }) {
    return (
        <table className="w-full border border-neutral-300 border-collapse">
            <thead>
                <tr className="bg-neutral-100 text-left">
                    {cols.map((c, i) => <th key={c} className={`border border-neutral-300 px-2 py-1 font-semibold ${widths[i]}`}>{c}</th>)}
                </tr>
            </thead>
            <tbody>
                {blankRows(rows).map((_, r) => (
                    <tr key={r}>
                        {cols.map((c) => <td key={c} className="border border-neutral-300 px-2 py-2.5" />)}
                    </tr>
                ))}
            </tbody>
        </table>
    )
}
