"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import DashboardLayout from "@/components/dashboard-layout"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import type { CostingSection, Material } from "@/types/database"

type Confidence = "safe" | "review" | "possible"

type QualityIssue = {
    key: string
    materialId: string
    ruleId: string
    confidence: Confidence
    title: string
    reason: string
    current: Record<string, unknown>
    suggested: Partial<Material>
}

function issueKey(ruleId: string, materialId: string, suggested: Partial<Material>) {
    return ruleId + ":" + materialId + ":" + JSON.stringify(suggested)
}

function titleCaseSupplier(value: string) {
    const lower = value.trim().toLowerCase()
    if (lower === "ullrich") return "Vulcan Aluminium"
    if (lower === "vulcan aluminium") return "Vulcan Aluminium"
    if (lower === "vulcan steel") return "Vulcan Steel"
    return value.trim()
}

function collapseWhitespace(value: string) {
    return value.replace(/\s+/g, " ").trim()
}

function median(values: number[]) {
    if (values.length === 0) return null
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export default function CatalogueQualityPage() {
    const supabase = useMemo(() => createClient(), [])
    const [materials, setMaterials] = useState<Material[]>([])
    const [sections, setSections] = useState<CostingSection[]>([])
    const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(true)
    const [busyKey, setBusyKey] = useState<string | null>(null)
    const [applyingAll, setApplyingAll] = useState(false)

    async function load() {
        setLoading(true)
        const pageSize = 1000
        const allMaterials: Material[] = []
        let from = 0

        while (true) {
            const { data, error } = await supabase
                .from("materials")
                .select("*")
                .eq("active", true)
                .order("supplier")
                .order("description")
                .range(from, from + pageSize - 1)
            if (error) {
                setLoading(false)
                return toast.error(error.message)
            }
            const batch = (data ?? []) as Material[]
            allMaterials.push(...batch)
            if (batch.length < pageSize) break
            from += pageSize
        }

        const [{ data: sectionData, error: sectionError }, { data: ignoredData, error: ignoredError }] = await Promise.all([
            supabase.from("costing_sections").select("*").order("sort"),
            supabase.from("catalogue_quality_audit_log").select("issue_key").eq("action", "ignored"),
        ])

        if (sectionError) toast.error(sectionError.message)
        if (ignoredError) toast.error(ignoredError.message)

        setMaterials(allMaterials)
        setSections((sectionData ?? []) as CostingSection[])
        setIgnoredKeys(new Set((ignoredData ?? []).map((row: { issue_key: string }) => row.issue_key)))
        setLoading(false)
    }

    useEffect(() => { void load() }, [])

    const validSubsections = useMemo(() => {
        const map = new Map<string, Set<string>>()
        for (const row of sections) {
            if (!row.subsection) continue
            if (!map.has(row.section)) map.set(row.section, new Set())
            map.get(row.section)!.add(row.subsection)
        }
        return map
    }, [sections])

    const issues = useMemo(() => {
        const found: QualityIssue[] = []
        const push = (issue: Omit<QualityIssue, "key">) => {
            const key = issueKey(issue.ruleId, issue.materialId, issue.suggested)
            if (!ignoredKeys.has(key)) found.push({ ...issue, key })
        }

        const bySubsection = new Map<string, Material[]>()
        for (const material of materials) {
            const groupKey = (material.section || "") + "::" + (material.subsection || "")
            if (!bySubsection.has(groupKey)) bySubsection.set(groupKey, [])
            bySubsection.get(groupKey)!.push(material)

            const cleanDescription = collapseWhitespace(material.description)
            if (cleanDescription !== material.description) {
                push({
                    materialId: material.id,
                    ruleId: "description-whitespace",
                    confidence: "safe",
                    title: "Description spacing",
                    reason: "Description contains inconsistent leading, trailing or repeated spaces.",
                    current: { description: material.description },
                    suggested: { description: cleanDescription },
                })
            }

            if (material.supplier) {
                const supplierSuggestion = titleCaseSupplier(material.supplier)
                if (supplierSuggestion !== material.supplier) {
                    push({
                        materialId: material.id,
                        ruleId: "supplier-alias",
                        confidence: "safe",
                        title: "Supplier naming",
                        reason: "Supplier name does not match the preferred RPM supplier name.",
                        current: { supplier: material.supplier },
                        suggested: { supplier: supplierSuggestion },
                    })
                }
            }

            const lower = material.description.toLowerCase()
            if (material.supplier === "Vulcan Aluminium" || lower.startsWith("aluminium ")) {
                const looksExtrusion = /\bua\d+\b|\b(equal|un-?equal) angle\b|\bshs\b|\brhs\b|\bchannel\b|\bflat bar\b|\bround tube\b/i.test(material.description)
                const looksSheet = /\baluminium\s+\d+(?:\.\d+)?mm\b/.test(lower) && /\b(5005|5052|5083|5251)\b/.test(lower)

                if (looksExtrusion && (material.section !== "Materials" || material.subsection !== "Aluminium Extrusions")) {
                    push({
                        materialId: material.id,
                        ruleId: "aluminium-extrusion-section",
                        confidence: "review",
                        title: "Aluminium extrusion subsection",
                        reason: "Description looks like an aluminium extrusion but it is not filed under Materials → Aluminium Extrusions.",
                        current: { section: material.section, subsection: material.subsection },
                        suggested: { section: "Materials", subsection: "Aluminium Extrusions" },
                    })
                } else if (looksSheet && (material.section !== "Materials" || material.subsection !== "Aluminium Sheet")) {
                    push({
                        materialId: material.id,
                        ruleId: "aluminium-sheet-section",
                        confidence: "review",
                        title: "Aluminium sheet subsection",
                        reason: "Description looks like aluminium sheet/plate but it is not filed under Materials → Aluminium Sheet.",
                        current: { section: material.section, subsection: material.subsection },
                        suggested: { section: "Materials", subsection: "Aluminium Sheet" },
                    })
                }

                const unequalMatch = material.description.match(/^Aluminium\s+(?:Unequal|Un Equal|Un-Equal)\s+angle\s+/i)
                if (unequalMatch && !material.description.startsWith("Aluminium Un-Equal angle ")) {
                    push({
                        materialId: material.id,
                        ruleId: "aluminium-unequal-angle-name",
                        confidence: "review",
                        title: "Un-equal angle naming",
                        reason: "RPM convention is “Aluminium Un-Equal angle …”.",
                        current: { description: material.description },
                        suggested: { description: material.description.replace(/^Aluminium\s+(?:Unequal|Un Equal|Un-Equal)\s+angle\s+/i, "Aluminium Un-Equal angle ") },
                    })
                }
            }

            if (material.subsection && !validSubsections.get(material.section)?.has(material.subsection)) {
                push({
                    materialId: material.id,
                    ruleId: "unknown-subsection",
                    confidence: "possible",
                    title: "Unknown subsection",
                    reason: "The item uses a subsection that is not currently defined in Catalogue Sections.",
                    current: { section: material.section, subsection: material.subsection },
                    suggested: {},
                })
            }
        }

        for (const group of bySubsection.values()) {
            const markups = group.map((m) => Number(m.default_markup)).filter((value) => Number.isFinite(value))
            const groupMedian = median(markups)
            if (groupMedian == null || group.length < 4) continue
            for (const material of group) {
                const currentMarkup = Number(material.default_markup)
                if (!Number.isFinite(currentMarkup)) continue
                if (Math.abs(currentMarkup - groupMedian) >= 0.2) {
                    push({
                        materialId: material.id,
                        ruleId: "markup-outlier",
                        confidence: "possible",
                        title: "Markup differs from similar items",
                        reason: "Markup differs noticeably from the median for this section/subsection.",
                        current: { default_markup: currentMarkup },
                        suggested: { default_markup: Math.round(groupMedian * 100) / 100 },
                    })
                }
            }
        }

        const byCode = new Map<string, Material[]>()
        for (const material of materials) {
            const key = (material.code || "").trim().toLowerCase()
            if (!key) continue
            if (!byCode.has(key)) byCode.set(key, [])
            byCode.get(key)!.push(material)
        }
        for (const group of byCode.values()) {
            if (group.length < 2) continue
            for (const material of group) {
                push({
                    materialId: material.id,
                    ruleId: "duplicate-code",
                    confidence: "possible",
                    title: "Duplicate catalogue code",
                    reason: "Another active catalogue item uses the same code. Review before making any change.",
                    current: { code: material.code, description: material.description },
                    suggested: {},
                })
            }
        }

        return found
    }, [materials, ignoredKeys, validSubsections])

    const counts = {
        safe: issues.filter((issue) => issue.confidence === "safe").length,
        review: issues.filter((issue) => issue.confidence === "review").length,
        possible: issues.filter((issue) => issue.confidence === "possible").length,
    }

    async function writeLog(issue: QualityIssue, action: "applied" | "ignored") {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase.from("catalogue_quality_audit_log").insert({
            issue_key: issue.key,
            material_id: issue.materialId,
            rule_id: issue.ruleId,
            confidence: issue.confidence,
            action,
            current_value: issue.current,
            suggested_value: issue.suggested,
            reason: issue.reason,
            reviewed_by: user?.id ?? null,
        })
        if (error) throw error
    }

    async function applyIssue(issue: QualityIssue, quiet = false) {
        if (Object.keys(issue.suggested).length === 0) {
            if (!quiet) toast.error("This issue needs manual review; there is no automatic suggestion.")
            return false
        }

        setBusyKey(issue.key)
        const { error } = await supabase.from("materials").update(issue.suggested).eq("id", issue.materialId)
        if (error) {
            setBusyKey(null)
            if (!quiet) toast.error(error.message)
            return false
        }

        try {
            await writeLog(issue, "applied")
        } catch (error) {
            if (!quiet) toast.error(error instanceof Error ? error.message : "Could not write audit log")
        }

        setMaterials((current) => current.map((material) =>
            material.id === issue.materialId ? { ...material, ...issue.suggested } as Material : material
        ))
        setBusyKey(null)
        if (!quiet) toast.success("Catalogue item updated")
        return true
    }

    async function ignoreIssue(issue: QualityIssue) {
        setBusyKey(issue.key)
        try {
            await writeLog(issue, "ignored")
            setIgnoredKeys((current) => new Set([...current, issue.key]))
            toast.success("Issue ignored")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not ignore issue")
        } finally {
            setBusyKey(null)
        }
    }

    async function applyAllSafe() {
        const safeIssues = issues.filter((issue) => issue.confidence === "safe" && Object.keys(issue.suggested).length > 0)
        if (safeIssues.length === 0) return toast.info("No safe fixes are waiting")
        if (!window.confirm(`Apply ${safeIssues.length} safe catalogue fix${safeIssues.length === 1 ? "" : "es"}?`)) return

        setApplyingAll(true)
        let applied = 0
        for (const issue of safeIssues) {
            if (await applyIssue(issue, true)) applied += 1
        }
        setApplyingAll(false)
        toast.success(`${applied} safe fix${applied === 1 ? "" : "es"} applied`)
    }

    function displayValue(value: Record<string, unknown> | Partial<Material>) {
        const entries = Object.entries(value)
        if (entries.length === 0) return "Manual review required"
        return entries.map(([key, val]) => `${key}: ${val ?? "—"}`).join(" · ")
    }

    return (
        <DashboardLayout>
            <PageShell width="full" className="px-4 xl:px-6">
                <PageHeader
                    icon={ShieldCheck}
                    kicker="Catalogue"
                    title="Catalogue Quality Check"
                    description="Review catalogue consistency suggestions before anything is changed."
                    actions={
                        <div className="flex gap-2">
                            <Button variant="outline" asChild><Link href="/quoting/catalogue"><ArrowLeft className="mr-1.5 size-4" /> Catalogue</Link></Button>
                            <Button onClick={applyAllSafe} disabled={loading || applyingAll || counts.safe === 0}>
                                <CheckCircle2 className="mr-1.5 size-4" />
                                {applyingAll ? "Applying…" : "Apply all safe fixes"}
                            </Button>
                        </div>
                    }
                />

                <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Safe fixes</div><div className="text-2xl font-semibold">{counts.safe}</div></div>
                    <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Review</div><div className="text-2xl font-semibold">{counts.review}</div></div>
                    <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">Possible issues</div><div className="text-2xl font-semibold">{counts.possible}</div></div>
                </div>

                <div className="mt-3 overflow-hidden rounded-lg border bg-card">
                    {loading ? (
                        <div className="p-10 text-center text-sm text-muted-foreground">Checking catalogue…</div>
                    ) : issues.length === 0 ? (
                        <div className="p-10 text-center">
                            <CheckCircle2 className="mx-auto mb-2 size-8 text-emerald-600" />
                            <div className="font-medium">No catalogue issues found</div>
                            <div className="mt-1 text-xs text-muted-foreground">The current rule set found nothing requiring attention.</div>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                                <tr>
                                    <th className="px-3 py-2">Item</th>
                                    <th className="px-3 py-2">Check</th>
                                    <th className="px-3 py-2">Current</th>
                                    <th className="px-3 py-2">Suggested</th>
                                    <th className="px-3 py-2">Confidence</th>
                                    <th className="px-3 py-2 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {issues.map((issue) => {
                                    const material = materials.find((item) => item.id === issue.materialId)
                                    return (
                                        <tr key={issue.key} className="border-t align-top">
                                            <td className="px-3 py-3">
                                                <div className="font-medium">{material?.description || "Catalogue item"}</div>
                                                <div className="text-xs text-muted-foreground">{material?.supplier || "No supplier"}</div>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="font-medium">{issue.title}</div>
                                                <div className="mt-1 max-w-sm text-xs text-muted-foreground">{issue.reason}</div>
                                            </td>
                                            <td className="px-3 py-3 text-xs">{displayValue(issue.current)}</td>
                                            <td className="px-3 py-3 text-xs">{displayValue(issue.suggested)}</td>
                                            <td className="px-3 py-3">
                                                <span className="rounded-full border px-2 py-1 text-[11px] capitalize">{issue.confidence === "safe" ? "Safe fix" : issue.confidence === "review" ? "Review" : "Possible issue"}</span>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="flex justify-end gap-2">
                                                    {Object.keys(issue.suggested).length > 0 && (
                                                        <Button size="sm" onClick={() => void applyIssue(issue)} disabled={busyKey === issue.key}>Apply</Button>
                                                    )}
                                                    <Button size="sm" variant="outline" onClick={() => void ignoreIssue(issue)} disabled={busyKey === issue.key}>Ignore</Button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </PageShell>
        </DashboardLayout>
    )
}
