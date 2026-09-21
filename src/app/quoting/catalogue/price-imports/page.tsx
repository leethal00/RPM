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

type NewMaterialDraft = {
    rowNo: number
    description: string
    code: string
    supplier: string
    section: string
    subsection: string
    unit: string
    default_markup: number
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
    const [dragActive, setDragActive] = useState(false)
    const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null)
    const [editMaterial, setEditMaterial] = useState({
        description: "",
        code: "",
        supplier: "",
        section: "",
        subsection: "",
    })
    const [savingMaterial, setSavingMaterial] = useState(false)
    const [newMaterialDraft, setNewMaterialDraft] = useState<NewMaterialDraft | null>(null)
    const [addingMaterial, setAddingMaterial] = useState(false)

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
        const pageSize = 1000
        const list: Material[] = []
        let from = 0

        while (true) {
            const { data, error } = await supabase
                .from("materials")
                .select("*")
                .eq("active", true)
                .order("supplier")
                .order("description")
                .range(from, from + pageSize - 1)
            if (error) throw error
            const batch = (data ?? []) as Material[]
            list.push(...batch)
            if (batch.length < pageSize) break
            from += pageSize
        }

        setMaterials(list)
        return list
    }

    async function ensureMaterials() {
        if (materials.length > 0) return materials
        return loadMaterials()
    }

    function suggestNewMaterial(row: ImportRow) {
        const source = row.description
        const lower = source.toLowerCase().replace(/×/g, "x")
        const dimensionTokens = normalise(source).split(" ").filter((token) => /\d+x\d+|\d+\.\d+|\d+mm|ua\d+/i.test(token))
        const familyWords = ["equal angle", "unequal angle", "shs", "rhs", "channel", "flat bar", "round tube", "square tube", "sheet", "plate"]
        const family = familyWords.find((word) => lower.includes(word)) ?? ""

        let best: Material | null = null
        let bestScore = -1
        for (const material of supplierMaterials) {
            const candidate = material.description.toLowerCase()
            let score = 0
            if (family && candidate.includes(family)) score += 8
            for (const token of dimensionTokens) {
                if (normalise(material.description).includes(normalise(token))) score += 2
            }
            if (material.subsection && family) {
                const sub = material.subsection.toLowerCase()
                if ((family.includes("angle") && sub.includes("angle")) ||
                    ((family === "shs" || family === "rhs") && sub.includes("extrusion")) ||
                    ((family === "sheet" || family === "plate") && sub.includes("sheet"))) score += 3
            }
            if (score > bestScore) {
                best = material
                bestScore = score
            }
        }

        const ua = source.match(/\b(UA\d+)\b/i)?.[1]?.toUpperCase()
        const dims3 = source.match(/\b(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)\b/i)
        const length = source.match(/\b(\d+(?:\.\d+)?)\s*m\b/i)?.[1]
        const sheet = source.match(/\b(\d+(?:\.\d+)?)\s*mm\s*[xX]\s*(\d{3,4})\s*[xX]\s*(\d{3,4}).*?\b(50\d\d|60\d\d|70\d\d)\b(?:.*?\b(H\d{2}|T\d)\b)?/i)

        let description = source
        if (ua && dims3) {
            const dims = String(Number(dims3[1])) + "x" + String(Number(dims3[2])) + "x" + String(Number(dims3[3]))
            const perLength = length ? ", per " + String(Number(length)) + "m" : ""
            if (lower.includes("equal angle") && !lower.includes("unequal")) description = "Aluminium Equal angle " + ua + " " + dims + perLength
            else if (lower.includes("unequal angle")) description = "Aluminium Un-Equal angle " + ua + " " + dims + perLength
            else if (lower.includes("shs")) description = "Aluminium SHS " + ua + " " + dims + perLength
            else if (lower.includes("rhs")) description = "Aluminium RHS " + ua + " " + dims + perLength
            else if (lower.includes("channel")) description = "Aluminium Channel " + ua + " " + dims + perLength
            else if (lower.includes("flat")) description = "Aluminium Flat Bar " + ua + " " + dims + perLength
        } else if (sheet) {
            const thickness = Number(sheet[1])
            const a = Number(sheet[2])
            const b = Number(sheet[3])
            const alloy = sheet[4]
            const temper = sheet[5]?.toUpperCase()
            const pe = /\bpe\b|film/i.test(source) ? ", PE" : ""
            description = "Aluminium " + thickness + "mm " + Math.max(a,b) + " " + Math.min(a,b) + " " + alloy + (temper ? " " + temper : "") + pe
        }

        setNewMaterialDraft({
            rowNo: row.rowNo,
            description,
            code: row.code,
            supplier: supplier.trim(),
            section: best?.section || "Materials",
            subsection: best?.subsection || "",
            unit: best?.unit || "",
            default_markup: Number(best?.default_markup ?? 0.5),
        })
    }

    async function addSuggestedMaterial(row: ImportRow) {
        if (!newMaterialDraft || newMaterialDraft.rowNo !== row.rowNo) return
        if (!newMaterialDraft.description.trim()) return toast.error("Description is required")
        setAddingMaterial(true)
        const payload = {
            code: newMaterialDraft.code.trim() || null,
            description: newMaterialDraft.description.trim(),
            supplier: newMaterialDraft.supplier.trim() || supplier.trim(),
            unit: newMaterialDraft.unit.trim() || null,
            unit_cost: row.price,
            default_markup: Number(newMaterialDraft.default_markup || 0.5),
            section: newMaterialDraft.section.trim() || "Materials",
            subsection: newMaterialDraft.subsection.trim() || null,
            date_last_checked: new Date().toISOString().slice(0, 10),
            active: true,
        }
        const { data, error } = await supabase.from("materials").insert(payload).select("*").single()
        setAddingMaterial(false)
        if (error) return toast.error(error.message)

        const created = data as Material
        setMaterials((current) => [...current, created])
        setRows((current) => current.map((candidate) => candidate.rowNo === row.rowNo
            ? { ...candidate, matchId: created.id, status: "ready", reason: "New RPM catalogue item approved from supplier price list" }
            : candidate))
        setNewMaterialDraft(null)
        toast.success("New RPM catalogue item added")
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

        // Supplier descriptions and RPM BOM descriptions often use different wording.
        // A supplier profile/code embedded in either description (e.g. UA1110) is a much
        // stronger identifier than general description similarity.
        const identifierPattern = /\\b(?=[a-z0-9]*[a-z])(?=[a-z0-9]*\\d)[a-z]{1,6}[-_.]?\\d[a-z0-9-_.]*\\b/gi
        const supplierIdentifiers = Array.from(new Set(
            `${code} ${description}`.match(identifierPattern)?.map((value) => normalise(value).replace(/\\s/g, "")) ?? []
        ))

        for (const identifier of supplierIdentifiers) {
            const identifierMatches = pool.filter((material) => {
                const haystack = normalise(`${material.code ?? ""} ${material.description}`).replace(/\\s/g, "")
                return haystack.includes(identifier)
            })
            if (identifierMatches.length === 1) {
                return { material: identifierMatches[0], reason: `Supplier identifier ${identifier.toUpperCase()}`, status: "ready" as const }
            }
        }

        const candidates = pool.filter((material) => {
            const rpm = normalise(material.description)
            return descriptionKey.length >= 5 && (rpm.includes(descriptionKey) || descriptionKey.includes(rpm))
        })
        if (candidates.length === 1) return { material: candidates[0], reason: "Close description match", status: "review" as const }

        // Structured spec matching for supplier descriptions that use different word/order
        // conventions to RPM. Example:
        // "6mm X 1200 X 2400 Plate 5052 H32 50um PE Film"
        // should strongly suggest "Aluminium 6mm 2400 1200 5052 H34, PE"
        // even though the dimensions are reversed and temper differs.
        const extractSpec = (value: string) => {
            const lower = value.toLowerCase().replace(/×/g, "x")
            const thicknessMatch = lower.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*mm\b/)
            const dimensionMatch = lower.match(/\b(\d{3,4})\s*[x ]\s*(\d{3,4})\b/)
            const alloyMatch = lower.match(/\b(50\d\d|60\d\d|70\d\d)\b/)
            const temperMatch = lower.match(/\b(h\d{2}|t\d)\b/)
            const hasPe = /\bpe\b|poly(?:ethylene)?\s*film|protective\s*film/.test(lower)
            const hasPlateOrSheet = /\bplate\b|\bsheet\b|aluminium\s+\d+(?:\.\d+)?mm/.test(lower)

            const dimensions = dimensionMatch
                ? [Number(dimensionMatch[1]), Number(dimensionMatch[2])].sort((a, b) => a - b)
                : []

            return {
                thickness: thicknessMatch ? Number(thicknessMatch[1]) : null,
                dimensions,
                alloy: alloyMatch?.[1] ?? null,
                temper: temperMatch?.[1]?.toUpperCase() ?? null,
                hasPe,
                hasPlateOrSheet,
            }
        }

        const supplierSpec = extractSpec(description)
        if (supplierSpec.hasPlateOrSheet && supplierSpec.thickness != null && supplierSpec.dimensions.length === 2) {
            const scored = pool.map((material) => {
                const rpmSpec = extractSpec(material.description)
                let score = 0
                const reasons: string[] = []

                if (rpmSpec.thickness === supplierSpec.thickness) {
                    score += 40
                    reasons.push("thickness")
                } else {
                    return { material, score: -1, reasons }
                }

                if (
                    rpmSpec.dimensions.length === 2 &&
                    rpmSpec.dimensions[0] === supplierSpec.dimensions[0] &&
                    rpmSpec.dimensions[1] === supplierSpec.dimensions[1]
                ) {
                    score += 35
                    reasons.push("sheet size")
                }

                if (supplierSpec.alloy && rpmSpec.alloy === supplierSpec.alloy) {
                    score += 20
                    reasons.push("alloy")
                }

                if (supplierSpec.hasPe && rpmSpec.hasPe) {
                    score += 5
                    reasons.push("PE")
                }

                if (supplierSpec.temper && rpmSpec.temper) {
                    if (supplierSpec.temper === rpmSpec.temper) {
                        score += 8
                        reasons.push("temper")
                    } else {
                        score -= 3
                        reasons.push("temper differs")
                    }
                }

                return { material, score, reasons }
            }).filter((candidate) => candidate.score >= 0).sort((a, b) => b.score - a.score)

            const best = scored[0]
            const second = scored[1]
            if (best && best.score >= 75 && (!second || best.score - second.score >= 10)) {
                return {
                    material: best.material,
                    reason: `Likely spec match (${best.reasons.join(", ")})`,
                    status: "review" as const,
                }
            }
        }

        // Fall back to meaningful word/spec overlap. Keep this as review-only so RPM
        // never silently applies a price based on a fuzzy description.
        const ignored = new Set(["aluminium", "aluminum", "mill", "finish", "per", "each", "length", "m", "mf", "6060t5", "6063t5"])
        const tokens = (value: string) => new Set(
            normalise(value).split(" ").filter((token) => token.length >= 2 && !ignored.has(token))
        )
        const supplierTokens = tokens(description)
        let best: { material: Material; score: number } | null = null
        let secondScore = 0

        for (const material of pool) {
            const rpmTokens = tokens(material.description)
            const shared = [...supplierTokens].filter((token) => rpmTokens.has(token))
            if (shared.length === 0) continue
            const score = shared.length / Math.max(1, Math.min(supplierTokens.size, rpmTokens.size))
            if (!best || score > best.score) {
                secondScore = best?.score ?? 0
                best = { material, score }
            } else if (score > secondScore) {
                secondScore = score
            }
        }

        if (best && best.score >= 0.55 && best.score - secondScore >= 0.15) {
            return { material: best.material, reason: "Likely description/spec match", status: "review" as const }
        }

        return { material: null, reason: "No existing RPM item matched", status: "skipped" as const }
    }

    async function parseUploadedFile(file: File) {
        const lower = file.name.toLowerCase()
        if (lower.endsWith(".csv")) {
            return { format: "csv", records: parseCsv(await file.text()), warning: "" }
        }

        const form = new FormData()
        form.append("file", file)
        const response = await fetch("/api/catalogue/price-import/parse", { method: "POST", body: form })
        const body = await response.json()
        if (!response.ok) throw new Error(body?.error || "Could not parse supplier price list")
        return {
            format: String(body?.format || ""),
            records: (body?.records || []) as Record<string, string>[],
            warning: String(body?.warning || ""),
        }
    }

    async function handleFile(file: File) {
        if (!supplier.trim()) return toast.error("Choose the supplier first")
        const lower = file.name.toLowerCase()
        if (![".csv", ".xlsx", ".xls", ".pdf"].some((extension) => lower.endsWith(extension))) {
            return toast.error("Upload a CSV, Excel or PDF supplier price list")
        }

        setLoading(true)
        try {
            const catalogue = await ensureMaterials()
            const pool = catalogue.filter((material) => (material.supplier ?? "").trim().toLowerCase() === supplier.trim().toLowerCase())
            if (pool.length === 0) throw new Error(`No existing RPM catalogue items are assigned to ${supplier}`)

            const parsed = await parseUploadedFile(file)
            const forceReview = parsed.format === "pdf"
            const nextRows: ImportRow[] = []
            parsed.records.forEach((record, index) => {
                const code = pickField(record, ["code", "item code", "sku", "stock code", "product code", "part number"])
                const description = pickField(record, ["description", "product description", "product", "item", "name"])
                const priceText = pickField(record, ["unit cost", "cost", "eac price", "net price", "price", "trade price", "your price", "nett"])
                const price = parseMoney(priceText)
                if ((!description && !code) || price == null) return

                const match = findExistingMatch(code, description, pool)
                let status: ImportRow["status"] = match.status
                let reason = match.reason

                if (forceReview && match.material) {
                    status = "review"
                    reason = `${reason}; PDF extraction — confirm before applying`
                }

                if (match.material && Number(match.material.unit_cost) > 0) {
                    const oldPrice = Number(match.material.unit_cost)
                    const movement = Math.abs(price - oldPrice) / oldPrice
                    if (movement >= 0.4) {
                        status = "review"
                        reason = `${reason}; price changed ${(movement * 100).toFixed(0)}%`
                    }
                }

                nextRows.push({
                    rowNo: Number(record.__row) || index + 2,
                    code,
                    description: description || code,
                    price,
                    matchId: match.material?.id ?? null,
                    status,
                    reason,
                })
            })

            if (nextRows.length === 0) throw new Error("No usable price rows were found in this file.")
            setRows(nextRows)
            setFilename(file.name)
            if (parsed.warning) toast.info(parsed.warning)
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

    function approveRow(rowNo: number) {
        setRows((current) => current.map((row) => row.rowNo === rowNo && row.matchId
            ? { ...row, status: "ready", reason: row.reason.replace(/; PDF extraction — confirm before applying/g, "") }
            : row))
    }

    function skipRow(rowNo: number) {
        setRows((current) => current.map((row) => row.rowNo === rowNo
            ? { ...row, status: "skipped", reason: "Skipped for this import" }
            : row))
    }

    function startEditMaterial(material: Material) {
        setEditingMaterialId(material.id)
        setEditMaterial({
            description: material.description || "",
            code: material.code || "",
            supplier: material.supplier || "",
            section: material.section || "",
            subsection: material.subsection || "",
        })
    }

    async function saveMaterialEdit() {
        if (!editingMaterialId) return
        if (!editMaterial.description.trim()) return toast.error("Description is required")
        setSavingMaterial(true)
        const patch = {
            description: editMaterial.description.trim(),
            code: editMaterial.code.trim() || null,
            supplier: editMaterial.supplier.trim() || null,
            section: editMaterial.section.trim() || "Materials",
            subsection: editMaterial.subsection.trim() || null,
            updated_at: new Date().toISOString(),
        }
        const { error } = await supabase.from("materials").update(patch).eq("id", editingMaterialId)
        setSavingMaterial(false)
        if (error) return toast.error(error.message)

        setMaterials((current) => current.map((material) => material.id === editingMaterialId ? { ...material, ...patch } as Material : material))
        setRows((current) => current.map((row) => row.matchId === editingMaterialId
            ? { ...row, reason: row.reason.includes("Manually matched") ? row.reason : row.reason + "; RPM item edited" }
            : row))
        toast.success("RPM catalogue item updated")
        setEditingMaterialId(null)
    }

    async function deactivateMaterial(material: Material) {
        const confirmed = window.confirm(`Deactivate "${material.description}" from the RPM catalogue? Existing historical BOM lines will remain unchanged.`)
        if (!confirmed) return
        const { error } = await supabase.from("materials").update({ active: false, updated_at: new Date().toISOString() }).eq("id", material.id)
        if (error) return toast.error(error.message)

        setMaterials((current) => current.filter((item) => item.id !== material.id))
        setRows((current) => current.map((row) => row.matchId === material.id
            ? { ...row, matchId: null, status: "skipped", reason: "Matched RPM item was deactivated" }
            : row))
        if (editingMaterialId === material.id) setEditingMaterialId(null)
        toast.success("RPM catalogue item deactivated")
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
                    description="Upload supplier CSV, Excel or PDF price lists, update existing RPM catalogue items, and approve new items when needed."
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

                        <label
                            onDragEnter={(event) => {
                                event.preventDefault()
                                if (supplier.trim() && !loading) setDragActive(true)
                            }}
                            onDragOver={(event) => {
                                event.preventDefault()
                                if (supplier.trim() && !loading) {
                                    event.dataTransfer.dropEffect = "copy"
                                    setDragActive(true)
                                }
                            }}
                            onDragLeave={(event) => {
                                event.preventDefault()
                                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false)
                            }}
                            onDrop={(event) => {
                                event.preventDefault()
                                setDragActive(false)
                                if (!supplier.trim() || loading) return
                                const file = event.dataTransfer.files?.[0]
                                if (file) void handleFile(file)
                            }}
                            className={`flex min-h-32 flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 text-center transition-colors ${
                                !supplier.trim()
                                    ? "cursor-not-allowed opacity-50"
                                    : dragActive
                                      ? "cursor-copy border-primary bg-primary/10"
                                      : "cursor-pointer hover:bg-muted/40"
                            }`}
                        >
                            <Upload className={`mb-2 size-6 ${dragActive ? "text-primary" : "text-muted-foreground"}`} />
                            <span className="text-sm font-medium">{dragActive ? "Drop price list here" : "Upload supplier price list"}</span>
                            <span className="mt-1 text-xs text-muted-foreground">Drag & drop or click to browse · CSV, Excel or PDF</span>
                            <span className="mt-0.5 text-[11px] text-muted-foreground">Unmatched products can be skipped or approved as new RPM catalogue items.</span>
                            <input type="file" accept=".csv,.xlsx,.xls,.pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf" className="hidden" disabled={!supplier.trim() || loading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); event.currentTarget.value = "" }} />
                        </label>
                    </section>

                    <section className="min-w-0">
                        {rows.length === 0 ? (
                            <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
                                <FileSpreadsheet className="mx-auto mb-3 size-8 opacity-50" />
                                <p className="text-sm font-medium text-foreground">No price list loaded</p>
                                <p className="mt-1 text-xs">Choose a supplier and upload a CSV, Excel or PDF price list.</p>
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
                                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                                {currentMatch && (
                                                                    <>
                                                                        <button type="button" onClick={() => startEditMaterial(currentMatch)} className="text-[11px] text-primary hover:underline">Edit RPM item</button>
                                                                        <button type="button" onClick={() => void deactivateMaterial(currentMatch)} className="text-[11px] text-destructive hover:underline">Deactivate RPM item</button>
                                                                    </>
                                                                )}
                                                                {row.status !== "skipped" && (
                                                                    <button type="button" onClick={() => skipRow(row.rowNo)} className="text-[11px] text-muted-foreground hover:text-foreground hover:underline">Skip this row</button>
                                                                )}
                                                                {!currentMatch && (
                                                                    <button type="button" onClick={() => suggestNewMaterial(row)} className="text-[11px] text-primary hover:underline">Suggest new RPM item</button>
                                                                )}
                                                            </div>
                                                            {currentMatch && editingMaterialId === currentMatch.id && (
                                                                <div className="mt-2 grid gap-2 rounded-md border bg-muted/20 p-2">
                                                                    <div className="text-[11px] font-medium">Edit existing RPM catalogue item</div>
                                                                    <Input value={editMaterial.description} onChange={(event) => setEditMaterial({ ...editMaterial, description: event.target.value })} className="h-8 text-xs" placeholder="Description" />
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <Input value={editMaterial.code} onChange={(event) => setEditMaterial({ ...editMaterial, code: event.target.value })} className="h-8 text-xs" placeholder="Code" />
                                                                        <Input value={editMaterial.supplier} onChange={(event) => setEditMaterial({ ...editMaterial, supplier: event.target.value })} className="h-8 text-xs" placeholder="Supplier" />
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <Input value={editMaterial.section} onChange={(event) => setEditMaterial({ ...editMaterial, section: event.target.value })} className="h-8 text-xs" placeholder="Section" />
                                                                        <Input value={editMaterial.subsection} onChange={(event) => setEditMaterial({ ...editMaterial, subsection: event.target.value })} className="h-8 text-xs" placeholder="Subsection" />
                                                                    </div>
                                                                    <div className="flex justify-end gap-2">
                                                                        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingMaterialId(null)}>Cancel</Button>
                                                                        <Button type="button" size="sm" className="h-7 text-xs" disabled={savingMaterial} onClick={() => void saveMaterialEdit()}>{savingMaterial ? "Saving..." : "Save RPM item"}</Button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {!currentMatch && newMaterialDraft?.rowNo === row.rowNo && (
                                                                <div className="mt-2 grid gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
                                                                    <div>
                                                                        <div className="text-[11px] font-medium">Suggested new RPM catalogue item</div>
                                                                        <div className="text-[10px] text-muted-foreground">Based on similar existing supplier items. Review before adding.</div>
                                                                    </div>
                                                                    <Input value={newMaterialDraft.description} onChange={(event) => setNewMaterialDraft({ ...newMaterialDraft, description: event.target.value })} className="h-8 text-xs" placeholder="Description" />
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <Input value={newMaterialDraft.code} onChange={(event) => setNewMaterialDraft({ ...newMaterialDraft, code: event.target.value })} className="h-8 text-xs" placeholder="Supplier code" />
                                                                        <Input value={newMaterialDraft.supplier} onChange={(event) => setNewMaterialDraft({ ...newMaterialDraft, supplier: event.target.value })} className="h-8 text-xs" placeholder="Supplier" />
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <Input value={newMaterialDraft.section} onChange={(event) => setNewMaterialDraft({ ...newMaterialDraft, section: event.target.value })} className="h-8 text-xs" placeholder="Section" />
                                                                        <Input value={newMaterialDraft.subsection} onChange={(event) => setNewMaterialDraft({ ...newMaterialDraft, subsection: event.target.value })} className="h-8 text-xs" placeholder="Subsection" />
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <Input value={newMaterialDraft.unit} onChange={(event) => setNewMaterialDraft({ ...newMaterialDraft, unit: event.target.value })} className="h-8 text-xs" placeholder="Unit" />
                                                                        <Input type="number" step="0.01" value={newMaterialDraft.default_markup} onChange={(event) => setNewMaterialDraft({ ...newMaterialDraft, default_markup: Number(event.target.value) })} className="h-8 text-xs" placeholder="Markup" />
                                                                    </div>
                                                                    <div className="text-[11px] text-muted-foreground">Initial cost: <span className="font-medium text-foreground">${row.price.toFixed(2)}</span></div>
                                                                    <div className="flex justify-end gap-2">
                                                                        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setNewMaterialDraft(null)}>Cancel</Button>
                                                                        <Button type="button" size="sm" className="h-7 text-xs" disabled={addingMaterial} onClick={() => void addSuggestedMaterial(row)}>{addingMaterial ? "Adding..." : "Approve & add item"}</Button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2 tabular-nums">{currentMatch ? `$${Number(currentMatch.unit_cost).toFixed(2)}` : "—"}</td>
                                                        <td className="px-3 py-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs">{row.status === "ready" ? "Ready" : row.status === "review" ? "Review" : "Skipped"}</span>
                                                                {row.status === "review" && row.matchId && (
                                                                    <button type="button" onClick={() => approveRow(row.rowNo)} className="text-xs text-primary hover:underline">Approve</button>
                                                                )}
                                                            </div>
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
