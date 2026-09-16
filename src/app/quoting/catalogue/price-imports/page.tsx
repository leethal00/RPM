"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import DashboardLayout from "@/components/dashboard-layout"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, FileSpreadsheet, Upload } from "lucide-react"
import { toast } from "sonner"
import type { Material } from "@/types/database"

type ImportRow = {
    rowNo: number
    code: string
    description: string
    price: number
    matchId: string | null
    status: "ready" | "review" | "skipped"
    reason: string
}

function normalise(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9.]+/g, " ").replace(/\s+/g, " ").trim()
}

function parseMoney(value: string) {
    const cleaned = value.replace(/[$,\s]/g, "")
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
}

function parseCsv(text: string) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
    if (lines.length < 2) return [] as Record<string, string>[]

    const splitLine = (line: string) => {
        const values: string[] = []
        let value = ""
        let quoted = false
        for (let i = 0; i < line.length; i += 1) {
            const char = line[i]
            if (char === '"') {
                if (quoted && line[i + 1] === '"') { value += '"'; i += 1 }
                else quoted = !quoted
            } else if (char === "," && !quoted) {
                values.push(value.trim())
                value = ""
            } else {
                value += char
            }
        }
        values.push(value.trim())
        return values
    }

    const headers = splitLine(lines[0]).map(normalise)
    return lines.slice(1).map((line) => {
        const values = splitLine(line)
        const record: Record<string, string> = {}
        headers.forEach((header, index) => { record[header] = values[index] ?? "" })
        return record
    })
}

function pickField(record: Record<string, string>, names: string[]) {
    for (const name of names) {
        if (record[name]) return record[name]
        const key = Object.keys(record).find((candidate) => candidate.includes(name))
        if (key && record[key]) return record[key]
    }
    return ""
}

export default function SupplierPriceImportsPage() {
    const supabase = useMemo(() => createClient(), [])
    const [materials, setMaterials] = useState<Material[]>([])
    const [supplier, setSupplier] = useState("")
    const [rows, setRows] = useState<ImportRow[]>([])
    const [filename, setFilename] = useState("")
    const [loading, setLoading] = useState(false)
    const [applying, setApplying] = useState(false)

    const suppliers = useMemo(() => {
        const names: string[] = []
        for (const material of materials) {
            const name = material.supplier?.trim()
            if (name && !names.includes(name)) names.push(name)
        }
        return names.sort((a, b) => a.localeCompare(b))
    }, [materials])

    const supplierMaterials = useMemo(() => {
        const chosen = supplier.trim().toLowerCase()
        if (!chosen) return []
        return materials.filter((material) => (material.supplier ?? "").trim().toLowerCase() === chosen)
    }, [materials, supplier])

    async function loadMaterials() {
        const { data, error } = await supabase.from("materials").select("*").eq("active", true).order("supplier").order("description")
        if (error) throw error
        const list = (data ?? []) as Material[]
        setMaterials(list)
        return list
    }

    async function ensureMaterials() {
        if (materials.length > 0) return materials
        return loadMaterials()
    }

    function findExistingMatch(code: string, description: string, pool: Material[]) {
        const codeKey = normalise(code)
        if (codeKey) {
            const byCode = pool.find((material) => normalise(material.code ?? "") === codeKey)
            if (byCode) return { material: byCode, reason: "Exact item code", status: "ready" as const }
        }

        const descriptionKey = normalise(description)
        const byDescription = pool.find((material) => normalise(material.description) === descriptionKey)
        if (byDescription) return { material: byDescription, reason: "Exact description", status: "ready" as const }

        const candidates = pool.filter((material) => {
            const rpm = normalise(material.description)
            return descriptionKey.length >= 5 && (rpm.includes(descriptionKey) || descriptionKey.includes(rpm))
        })
        if (candidates.length === 1) return { material: candidates[0], reason: "Close description match", status: "review" as const }
        return { material: null, reason: "No existing RPM item matched", status: "skipped" as const }
    }

    async function handleFile(file: File) {
        if (!supplier.trim()) return toast.error("Choose the supplier first")
        if (!file.name.toLowerCase().endsWith(".csv")) return toast.error("CSV files are supported in this stage")

        setLoading(true)
        try {
            const catalogue = await ensureMaterials()
            const pool = catalogue.filter((material) => (material.supplier ?? "").trim().toLowerCase() === supplier.trim().toLowerCase())
            if (pool.length === 0) throw new Error(`No existing RPM catalogue items are assigned to ${supplier}`)

            const records = parseCsv(await file.text())
            const nextRows: ImportRow[] = []
            records.forEach((record, index) => {
                const code = pickField(record, ["code", "item code", "sku", "stock code", "product code", "part number"])
                const description = pickField(record, ["description", "product description", "product", "item", "name"])
                const priceText = pickField(record, ["unit cost", "cost", "net price", "price", "trade price", "your price", "nett"])
                const price = parseMoney(priceText)
                if (!description || price == null) return

                const match = findExistingMatch(code, description, pool)
                let status: ImportRow["status"] = match.status
                let reason = match.reason
                if (match.material && Number(match.material.unit_cost) > 0) {
                    const oldPrice = Number(match.material.unit_cost)
                    const movement = Math.abs(price - oldPrice) / oldPrice
                    if (movement >= 0.4) {
                        status = "review"
                        reason = `${reason}; price changed ${(movement * 100).toFixed(0)}%`
                    }
                }

                nextRows.push({
                    rowNo: index + 2,
                    code,
                    description,
                    price,
                    matchId: match.material?.id ?? null,
                    status,
                    reason,
                })
            })

            if (nextRows.length === 0) throw new Error("No usable rows found. The CSV needs description and price columns.")
            setRows(nextRows)
            setFilename(file.name)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not read price list")
        } finally {
            setLoading(false)
        }
    }

    function changeMatch(rowNo: number, matchId: string) {
        setRows((current) => current.map((row) => row.rowNo === rowNo
            ? { ...row, matchId: matchId || null, status: matchId ? "ready" : "skipped", reason: matchId ? "Manually matched" : "No existing RPM item selected" }
            : row))
    }

    async function applyImport() {
        const reviewCount = rows.filter((row) => row.status === "review").length
        if (reviewCount > 0) return toast.error(`${reviewCount} row${reviewCount === 1 ? " still needs" : "s still need"} review`)

        const approved = rows.filter((row) => row.status === "ready" && row.matchId)
        if (approved.length === 0) return toast.error("There are no matched prices to update")

        setApplying(true)
        try {
            let updated = 0
            for (const row of approved) {
                if (!row.matchId) continue
                const { error } = await supabase.from("materials").update({
                    unit_cost: row.price,
                    date_last_checked: new Date().toISOString().slice(0, 10),
                }).eq("id", row.matchId)
                if (error) throw error
                updated += 1
            }
            toast.success(`${updated} existing RPM catalogue item${updated === 1 ? "" : "s"} updated`)
            setRows([])
            setFilename("")
            await loadMaterials()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Price import failed")
        } finally {
            setApplying(false)
        }
    }

    const readyCount = rows.filter((row) => row.status === "ready").length
    const reviewCount = rows.filter((row) => row.status === "review").length
    const skippedCount = rows.filter((row) => row.status === "skipped").length

    return (
        <DashboardLayout>
            <PageShell width="full" className="px-4 xl:px-6">
                <PageHeader
                    icon={FileSpreadsheet}
                    kicker="Catalogue"
                    title="Supplier Price Imports"
                    description="Upload supplier CSV price lists and update existing RPM catalogue items only."
                    actions={<Button variant="outline" asChild><Link href="/quoting/catalogue"><ArrowLeft className="mr-1.5 size-4" /> Catalogue</Link></Button>}
                />

                <div className="mt-5 grid gap-4 lg:grid-cols-[300px_1fr]">
                    <section className="h-fit space-y-4 rounded-lg border bg-card p-4">
                        <div>
                            <label className="text-xs font-medium">Supplier</label>
                            <Input
                                value={supplier}
                                onChange={(event) => { setSupplier(event.target.value); setRows([]); setFilename("") }}
                                onFocus={() => { if (materials.length === 0) void loadMaterials() }}
                                list="price-import-suppliers"
                                placeholder="e.g. PSP"
                                className="mt-1"
                            />
                            <datalist id="price-import-suppliers">{suppliers.map((name) => <option key={name} value={name} />)}</datalist>
                        </div>

                        <label className={`flex min-h-32 flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 text-center ${supplier.trim() ? "cursor-pointer hover:bg-muted/40" : "cursor-not-allowed opacity-50"}`}>
                            <Upload className="mb-2 size-6 text-muted-foreground" />
                            <span className="text-sm font-medium">Upload supplier CSV</span>
                            <span className="mt-1 text-xs text-muted-foreground">Unmatched supplier products are skipped.</span>
                            <input type="file" accept=".csv,text/csv" className="hidden" disabled={!supplier.trim() || loading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); event.currentTarget.value = "" }} />
                        </label>
                    </section>

                    <section className="min-w-0">
                        {rows.length === 0 ? (
                            <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
                                <FileSpreadsheet className="mx-auto mb-3 size-8 opacity-50" />
                                <p className="text-sm font-medium text-foreground">No price list loaded</p>
                                <p className="mt-1 text-xs">Choose a supplier and upload a CSV.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
                                    <div className="mr-auto">
                                        <div className="text-sm font-semibold">{filename}</div>
                                        <div className="text-xs text-muted-foreground">{readyCount} ready · {reviewCount} review · {skippedCount} skipped</div>
                                    </div>
                                    <Button onClick={applyImport} disabled={applying || reviewCount > 0}>{applying ? "Applying…" : "Apply approved prices"}</Button>
                                </div>

                                <div className="max-h-[62vh] overflow-auto rounded-lg border bg-card">
                                    <table className="w-full min-w-[960px] text-sm">
                                        <thead className="sticky top-0 z-10 bg-muted">
                                            <tr className="text-left text-xs text-muted-foreground">
                                                <th className="px-3 py-2">Supplier item</th>
                                                <th className="px-3 py-2">New price</th>
                                                <th className="px-3 py-2">RPM match</th>
                                                <th className="px-3 py-2">Current</th>
                                                <th className="px-3 py-2">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((row) => {
                                                const currentMatch = materials.find((material) => material.id === row.matchId)
                                                return (
                                                    <tr key={row.rowNo} className="border-t align-top">
                                                        <td className="px-3 py-2"><div className="font-medium">{row.description}</div><div className="text-xs text-muted-foreground">{row.code || `Row ${row.rowNo}`}</div></td>
                                                        <td className="px-3 py-2 font-medium tabular-nums">${row.price.toFixed(2)}</td>
                                                        <td className="px-3 py-2">
                                                            <select value={row.matchId ?? ""} onChange={(event) => changeMatch(row.rowNo, event.target.value)} className="w-full max-w-[430px] rounded border bg-background px-2 py-1.5 text-xs">
                                                                <option value="">No existing RPM match</option>
                                                                {supplierMaterials.map((material) => <option key={material.id} value={material.id}>{material.code ? `${material.code} — ` : ""}{material.description}</option>)}
                                                            </select>
                                                            <div className="mt-1 text-[11px] text-muted-foreground">{row.reason}</div>
                                                        </td>
                                                        <td className="px-3 py-2 tabular-nums">{currentMatch ? `$${Number(currentMatch.unit_cost).toFixed(2)}` : "—"}</td>
                                                        <td className="px-3 py-2"><span className="text-xs">{row.status === "ready" ? "Ready" : row.status === "review" ? "Review" : "Skipped"}</span></td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </PageShell>
        </DashboardLayout>
    )
}
