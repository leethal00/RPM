"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import DashboardLayout from "@/components/dashboard-layout"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, CheckCircle2, FileSpreadsheet, Upload, AlertTriangle, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import type { Material } from "@/types/database"

type ImportStatus = "auto" | "review" | "skip" | "ignore"

type ImportRow = {
    rowNo: number
    code: string
    description: string
    price: number
    matchId: string | null
    score: number
    status: ImportStatus
    reason: string
}

type CsvRecord = Record<string, string>

const today = () => new Date().toISOString().slice(0, 10)

function normalise(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9.]+/g, " ").replace(/\s+/g, " ").trim()
}

function tokens(value: string) {
    return new Set(normalise(value).split(" ").filter((token) => token.length > 1))
}

function numericTokens(value: string) {
    return normalise(value).match(/\d+(?:\.\d+)?/g) ?? []
}

function similarity(a: string, b: string) {
    const aa = tokens(a)
    const bb = tokens(b)
    if (!aa.size || !bb.size) return 0
    let intersection = 0
    aa.forEach((token) => { if (bb.has(token)) intersection += 1 })
    const union = new Set([...aa, ...bb]).size
    let score = intersection / union

    const an = numericTokens(a)
    const bn = numericTokens(b)
    if (an.length && bn.length) {
        const common = an.filter((n) => bn.includes(n)).length
        if (common === 0) score *= 0.55
        else score = Math.min(1, score + 0.12 * (common / Math.max(an.length, bn.length)))
    }
    return score
}

function parseCsv(text: string): CsvRecord[] {
    const rows: string[][] = []
    let row: string[] = []
    let field = ""
    let quoted = false

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i]
        if (quoted) {
            if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1 }
            else if (char === '"') quoted = false
            else field += char
        } else if (char === '"') quoted = true
        else if (char === ",") { row.push(field.trim()); field = "" }
        else if (char === "\n") { row.push(field.trim()); rows.push(row); row = []; field = "" }
        else if (char !== "\r") field += char
    }
    if (field.length || row.length) { row.push(field.trim()); rows.push(row) }
    if (rows.length < 2) return []

    const headers = rows[0].map((header) => normalise(header))
    return rows.slice(1)
        .filter((r) => r.some(Boolean))
        .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])))
}

function firstField(record: CsvRecord, candidates: string[]) {
    for (const candidate of candidates) {
        const exact = record[candidate]
        if (exact != null && exact !== "") return exact
        const fuzzy = Object.keys(record).find((key) => key.includes(candidate))
        if (fuzzy && record[fuzzy]) return record[fuzzy]
    }
    return ""
}

function parseMoney(value: string) {
    const cleaned = value.replace(/[$,\s]/g, "").replace(/\(([^)]+)\)/, "-$1")
    const number = Number(cleaned)
    return Number.isFinite(number) ? number : NaN
}

export default function SupplierPriceImportsPage() {
    const supabase = useMemo(() => createClient(), [])
    const [materials, setMaterials] = useState<Material[]>([])
    const [supplier, setSupplier] = useState("")
    const [rows, setRows] = useState<ImportRow[]>([])
    const [filename, setFilename] = useState("")
    const [loading, setLoading] = useState(false)
    const [applying, setApplying] = useState(false)
    const [catalogueLoaded, setCatalogueLoaded] = useState(false)
    const [filter, setFilter] = useState<"all" | "review" | "auto" | "skip">("all")

    async function loadCatalogue() {
        const { data, error } = await supabase.from("materials").select("*").eq("active", true).order("supplier").order("description")
        if (error) throw error
        const list = (data as Material[]) || []
        setMaterials(list)
        setCatalogueLoaded(true)
        return list
    }

    async function ensureCatalogue() {
        return catalogueLoaded ? materials : await loadCatalogue()
    }

    const suppliers = useMemo(() => Array.from(new Set(materials.map((m) => m.supplier).filter(Boolean) as string[])).sort(), [materials])
    const supplierMaterials = useMemo(
        () => materials.filter((m) => (m.supplier ?? "").toLowerCase() === supplier.toLowerCase()),
        [materials, supplier]
    )

    function findMatch(code: string, description: string, pool: Material[]) {
        const codeNorm = normalise(code)
        if (codeNorm) {
            const exactCode = pool.find((m) => normalise(m.code ?? "") === codeNorm)
            if (exactCode) return { material: exactCode, score: 1, reason: "Exact item code" }
        }

        const descNorm = normalise(description)
        const exactDescription = pool.find((m) => normalise(m.description) === descNorm)
        if (exactDescription) return { material: exactDescription, score: 0.99, reason: "Exact description" }

        let best: Material | null = null
        let bestScore = 0
        pool.forEach((material) => {
            const score = similarity(description, material.description)
            if (score > bestScore) { best = material; bestScore = score }
        })
        return { material: best, score: bestScore, reason: best ? `Description match ${(bestScore * 100).toFixed(0)}%` : "No match" }
    }

    async function handleFile(file: File) {
        if (!supplier.trim()) return toast.error("Choose the supplier first")
        if (!file.name.toLowerCase().endsWith(".csv")) return toast.error("CSV is supported in this stage. Excel will be added once this workflow is verified.")

        setLoading(true)
        try {
            const allMaterials = await ensureCatalogue()
            const pool = allMaterials.filter((m) => (m.supplier ?? "").toLowerCase() === supplier.toLowerCase())
            if (!pool.length) throw new Error(`No existing RPM catalogue items are assigned to ${supplier}`)

            const records = parseCsv(await file.text())
            if (!records.length) throw new Error("No rows were found in that CSV")

            const nextRows: ImportRow[] = []
            records.forEach((record, index) => {
                const code = firstField(record, ["code", "item code", "sku", "stock code", "product code", "part number", "part no"])
                const description = firstField(record, ["description", "product description", "product", "item", "name"])
                const priceRaw = firstField(record, ["unit cost", "cost", "net price", "price", "trade price", "your price", "nett"])
                const price = parseMoney(priceRaw)
                if (!description || !Number.isFinite(price) || price < 0) return

                const result = findMatch(code, description, pool)
                const matched = result.material

                if (!matched || result.score < 0.45) {
                    nextRows.push({ rowNo: index + 2, code, description, price, matchId: null, score: result.score, status: "skip", reason: "No close existing RPM item found" })
                    return
                }

                let status: ImportStatus = result.score >= 0.92 ? "auto" : "review"
                let reason = result.reason
                const oldPrice = Number(matched.unit_cost)
                if (oldPrice > 0) {
                    const movement = Math.abs(price - oldPrice) / oldPrice
                    if (movement >= 0.4) {
                        status = "review"
                        reason = `${reason}; price change ${(movement * 100).toFixed(0)}%`
                    }
                }

                nextRows.push({ rowNo: index + 2, code, description, price, matchId: matched.id, score: result.score, status, reason })
            })

            if (!nextRows.length) throw new Error("I could not find usable description and price columns. Try headings such as Code, Description and Price.")
            setRows(nextRows)
            setFilename(file.name)
            setFilter(nextRows.some((row) => row.status === "review") ? "review" : "all")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not read price list")
        } finally {
            setLoading(false)
        }
    }

    function updateRow(rowNo: number, patch: Partial<ImportRow>) {
        setRows((current) => current.map((row) => row.rowNo === rowNo ? { ...row, ...patch } : row))
    }

    async function applyImport() {
        const unresolved = rows.filter((row) => row.status === "review")
        if (unresolved.length) return toast.error(`${unresolved.length} row${unresolved.length === 1 ? " still needs" : "s still need"} review`)

        const actionable = rows.filter((row) => row.status === "auto" && row.matchId)
        if (!actionable.length) return toast.error("There are no approved matched prices to update")

        setApplying(true)
        try {
            let updated = 0
            for (const row of actionable) {
                const material = materials.find((m) => m.id === row.matchId)
                if (!material) continue
                const patch: Record<string, unknown> = { unit_cost: row.price, date_last_checked: today() }
                if (row.code && !material.code) patch.code = row.code
                const { error } = await supabase.from("materials").update(patch).eq("id", row.matchId)
                if (error) throw error
                updated += 1
            }
            toast.success(`Price import complete: ${updated} existing RPM item${updated === 1 ? "" : "s"} updated`)
            setRows([])
            setFilename("")
            await loadCatalogue()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Price import failed")
        } finally {
            setApplying(false)
        }
    }

    const counts = useMemo(() => ({
        auto: rows.filter((r) => r.status === "auto").length,
        review: rows.filter((r) => r.status === "review").length,
        skip: rows.filter((r) => r.status === "skip").length,
        ignore: rows.filter((r) => r.status === "ignore").length,
    }), [rows])

    const visibleRows = rows.filter((row) => filter === "all" || row.status === filter)

    return (
        <DashboardLayout>
            <PageShell width="full" className="px-4 xl:px-6">
                <PageHeader
                    icon={FileSpreadsheet}
                    kicker="Catalogue"
                    title="Supplier Price Imports"
                    description="Upload a supplier CSV, match against existing RPM catalogue items, review uncertain rows, then apply approved prices."
                    actions={(
                        <Button variant="outline" asChild>
                            <Link href="/quoting/catalogue">
                                <ArrowLeft className="mr-1.5 size-4" /> Catalogue
                            </Link>
                        </Button>
                    )}
                />

                <div className="mt-5 grid gap-4 lg:grid-cols-[300px_1fr]">
                    <section className="h-fit space-y-4 rounded-lg border bg-card p-4">
                        <div>
                            <label className="text-xs font-medium">Supplier</label>
                            <Input
                                value={supplier}
                                onChange={(e) => { setSupplier(e.target.value); setRows([]); setFilename("") }}
                                onFocus={() => { if (!catalogueLoaded) void loadCatalogue() }}
                                list="price-import-suppliers"
                                placeholder="e.g. PSP"
                                className="mt-1"
                            />
                            <datalist id="price-import-suppliers">
                                {suppliers.map((name) => <option key={name} value={name} />)}
                            </datalist>
                        </div>

                        <label className={`flex min-h-32 flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 text-center transition-colors ${supplier.trim() ? "cursor-pointer hover:bg-muted/40" : "cursor-not-allowed opacity-50"}`}>
                            <Upload className="mb-2 size-6 text-muted-foreground" />
                            <span className="text-sm font-medium">Upload supplier CSV</span>
                            <span className="mt-1 text-xs text-muted-foreground">RPM will only update catalogue items that already exist.</span>
                            <input
                                type="file"
                                accept=".csv,text/csv"
                                className="hidden"
                                disabled={!supplier.trim() || loading}
                                onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) void handleFile(file)
                                    e.currentTarget.value = ""
                                }}
                            />
                        </label>

                        <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                            Unmatched supplier products are skipped automatically. Add any new materials manually through the catalogue when you actually need them.
                        </div>
                    </section>

                    <section className="min-w-0">
                        {!rows.length ? (
                            <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
                                <FileSpreadsheet className="mx-auto mb-3 size-8 opacity-50" />
                                <p className="text-sm font-medium text-foreground">No price list loaded</p>
                                <p className="mt-1 text-xs">Choose a supplier and upload a CSV to start matching existing RPM items.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
                                    <div className="mr-auto">
                                        <div className="text-sm font-semibold">{filename}</div>
                                        <div className="text-xs text-muted-foreground">{supplier} · {rows.length} usable supplier rows</div>
                                    </div>
                                    <button onClick={() => setFilter("auto")} className="rounded-md border px-3 py-1.5 text-xs"><CheckCircle2 className="mr-1 inline size-3.5 text-green-600" />{counts.auto} ready</button>
                                    <button onClick={() => setFilter("review")} className="rounded-md border px-3 py-1.5 text-xs"><AlertTriangle className="mr-1 inline size-3.5 text-amber-600" />{counts.review} review</button>
                                    <button onClick={() => setFilter("skip")} className="rounded-md border px-3 py-1.5 text-xs">{counts.skip} skipped</button>
                                    <button onClick={() => setFilter("all")} className="rounded-md border px-3 py-1.5 text-xs">All</button>
                                    <Button onClick={applyImport} disabled={applying || counts.review > 0}>{applying ? "Applying…" : "Apply approved prices"}</Button>
                                </div>

                                <div className="max-h-[62vh] overflow-auto rounded-lg border bg-card">
                                    <table className="w-full min-w-[1000px] text-sm">
                                        <thead className="sticky top-0 z-10 bg-muted">
                                            <tr className="text-left text-xs text-muted-foreground">
                                                <th className="px-3 py-2">Supplier item</th>
                                                <th className="px-3 py-2">New price</th>
                                                <th className="px-3 py-2">RPM match</th>
                                                <th className="px-3 py-2">Current</th>
                                                <th className="px-3 py-2">Result</th>
                                                <th className="w-28 px-3 py-2">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visibleRows.map((row) => {
                                                const match = materials.find((m) => m.id === row.matchId)
                                                return (
                                                    <tr key={row.rowNo} className="border-t align-top">
                                                        <td className="px-3 py-2"><div className="font-medium">{row.description}</div><div className="text-xs text-muted-foreground">{row.code || `Row ${row.rowNo}`}</div></td>
                                                        <td className="px-3 py-2 font-medium tabular-nums">${row.price.toFixed(2)}</td>
                                                        <td className="px-3 py-2">
                                                            {row.status === "skip" && !row.matchId ? (
                                                                <span className="text-xs text-muted-foreground">No existing match</span>
                                                            ) : (
                                                                <select
                                                                    value={row.matchId ?? ""}
                                                                    onChange={(e) => updateRow(row.rowNo, e.target.value
                                                                        ? { matchId: e.target.value, status: "auto", reason: "Manually matched" }
                                                                        : { matchId: null, status: "skip", reason: "No existing RPM item selected" })}
                                                                    className="w-full max-w-[430px] rounded border bg-background px-2 py-1.5 text-xs"
                                                                >
                                                                    <option value="">No existing RPM match</option>
                                                                    {supplierMaterials.map((m) => <option key={m.id} value={m.id}>{m.code ? `${m.code} — ` : ""}{m.description}</option>)}
                                                                </select>
                                                            )}
                                                            <div className="mt-1 text-[11px] text-muted-foreground">{row.reason}</div>
                                                        </td>
                                                        <td className="px-3 py-2 tabular-nums">{match ? `$${Number(match.unit_cost).toFixed(2)}` : "—"}</td>
                                                        <td className="px-3 py-2">
                                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${row.status === "auto" ? "bg-green-100 text-green-800" : row.status === "review" ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}`}>
                                                                {row.status === "auto" ? "Ready" : row.status === "review" ? "Review" : row.status === "ignore" ? "Ignored" : "Skipped"}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            {row.status !== "skip" && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-7 text-xs"
                                                                    onClick={() => updateRow(row.rowNo, row.status === "ignore"
                                                                        ? { status: row.matchId ? "auto" : "skip", reason: "Restored" }
                                                                        : { status: "ignore", reason: "Ignored for this import" })}
                                                                >
                                                                    {row.status === "ignore" ? <><RotateCcw className="mr-1 size-3" />Restore</> : "Ignore"}
                                                                </Button>
                                                            )}
                                                        </td>
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
