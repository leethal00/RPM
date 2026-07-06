"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { ArrowLeft, Layers, Package2, Copy, Check } from "lucide-react"
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { PageShell } from "@/components/page-shell"
import { CostSheet } from "@/components/costing/cost-sheet"
import { NumCell } from "@/components/costing/cells"
import type { CostingItem, CostingJob } from "@/types/database"

export default function ItemCostSheetPage() {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()
    const params = useParams()
    const jobId = params.id as string
    const itemId = params.itemId as string

    const [job, setJob] = useState<CostingJob | null>(null)
    const [item, setItem] = useState<CostingItem | null>(null)
    const [loading, setLoading] = useState(true)

    const [copyOpen, setCopyOpen] = useState(false)
    const [jobs, setJobs] = useState<{ id: string; title: string }[] | null>(null)
    const [jobSearch, setJobSearch] = useState("")
    const [copying, setCopying] = useState(false)

    useEffect(() => {
        let active = true
        ;(async () => {
            const [{ data: j }, { data: i }] = await Promise.all([
                supabase.from("costing_jobs").select("id, title, is_template").eq("id", jobId).single(),
                supabase.from("costing_items").select("*").eq("id", itemId).single(),
            ])
            if (!active) return
            setJob(j as CostingJob)
            setItem(i as CostingItem)
            setLoading(false)
        })()
        return () => { active = false }
    }, [supabase, jobId, itemId])

    const isTemplate = !!job?.is_template

    async function patchItem(patch: Partial<CostingItem>) {
        setItem((prev) => (prev ? { ...prev, ...patch } : prev))
        const { error } = await supabase.from("costing_items").update(patch).eq("id", itemId)
        if (error) console.error(error)
    }

    async function saveAsProduct() {
        const { data: tpl } = await supabase.from("costing_jobs").select("id").eq("is_template", true).limit(1).maybeSingle()
        if (!tpl?.id) return toast.error("Product library not found")
        const { error } = await supabase.rpc("clone_costing_item", { src_item: itemId, target_job: tpl.id })
        if (error) return toast.error(error.message)
        toast.success("Saved to Products")
    }

    async function openCopy() {
        setCopyOpen(true)
        if (jobs === null) {
            const { data } = await supabase.from("costing_jobs")
                .select("id, title").eq("is_template", false).neq("id", jobId).order("created_at", { ascending: false })
            setJobs((data as { id: string; title: string }[]) || [])
        }
    }

    async function copyToJob(target: { id: string; title: string }) {
        setCopying(true)
        const { data: newId, error } = await supabase.rpc("clone_costing_item", { src_item: itemId, target_job: target.id })
        setCopying(false)
        if (error) return toast.error(error.message)
        setCopyOpen(false)
        toast.success(`Copied to "${target.title}"`)
        router.push(`/quoting/${target.id}/item/${newId}`) // open the new copy to tweak
    }

    const filteredJobs = (jobs ?? []).filter((j) => j.title.toLowerCase().includes(jobSearch.trim().toLowerCase()))

    return (
        <DashboardLayout>
            <PageShell>
                <div className="flex items-center justify-between">
                    <Button variant="ghost" size="sm" className="mb-2 -ml-2 gap-1.5 text-muted-foreground"
                        onClick={() => router.push(isTemplate ? "/quoting/products" : `/quoting/${jobId}`)}>
                        <ArrowLeft className="size-3.5" /> {isTemplate ? "Products" : (job?.title || "Job")}
                    </Button>
                    {!isTemplate && !loading && item && item.mode === "build" && (
                        <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={saveAsProduct}>
                            <Package2 className="size-3.5" /> Save as product
                        </Button>
                    )}
                </div>

                {loading || !item ? (
                    <div className="h-24 rounded-lg bg-muted/40 animate-pulse" />
                ) : (
                    <>
                        <div className="flex items-end justify-between gap-4 pb-5 border-b border-border/60">
                            <div className="space-y-1.5 flex-1">
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Layers className="size-3.5" />
                                    <span className="text-xs font-medium">Item — build</span>
                                </div>
                                <div className="flex items-center gap-2.5">
                                    <input
                                        defaultValue={item.name}
                                        onBlur={(e) => { if (e.target.value !== item.name) patchItem({ name: e.target.value }) }}
                                        className="text-[1.7rem] font-semibold tracking-tight bg-transparent outline-none border-b border-transparent focus:border-input w-full"
                                        placeholder="Item name"
                                    />
                                </div>
                            </div>
                            <div className="shrink-0">
                                <label className="text-xs text-muted-foreground">Qty</label>
                                <div className="w-20">
                                    <NumCell value={item.qty} onCommit={(v) => patchItem({ qty: v ?? 1 })} />
                                </div>
                            </div>
                        </div>

                        {/* Quote description — feeds the customer quote line */}
                        <div className="mt-5 rounded-lg border border-border/60 p-4 space-y-3">
                            <div className="text-xs font-medium text-muted-foreground">Quote description — shows on the customer quote</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="grid gap-1.5">
                                    <label className="text-xs text-muted-foreground">Size</label>
                                    <input defaultValue={item.size ?? ""} placeholder="e.g. 1400x400mm"
                                        onBlur={(e) => { if (e.target.value !== (item.size ?? "")) patchItem({ size: e.target.value || null }) }}
                                        className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring" />
                                </div>
                                <div className="grid gap-1.5">
                                    <label className="text-xs text-muted-foreground">Delivery</label>
                                    <select value={item.delivery ?? ""} onChange={(e) => patchItem({ delivery: e.target.value || null })}
                                        className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring">
                                        <option value="">—</option>
                                        <option value="Ex-factory">Ex-factory</option>
                                        <option value="Freight to site">Freight to site</option>
                                        <option value="Install on site">Install on site</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid gap-1.5">
                                <label className="text-xs text-muted-foreground">Details</label>
                                <textarea defaultValue={item.details ?? ""} placeholder="How it's made — extrusion, bracing, finish, face, LED, etc."
                                    onBlur={(e) => { if (e.target.value !== (item.details ?? "")) patchItem({ details: e.target.value || null }) }}
                                    className="min-h-[80px] rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring" />
                            </div>
                            <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground whitespace-pre-line">
                                {[item.name || "Item", `Qty: ${Number(item.qty)}`,
                                  item.size ? `Size: ${item.size}` : null,
                                  item.details ? `Details: ${item.details}` : null,
                                  item.delivery || null].filter(Boolean).join("\n")}
                            </div>
                        </div>

                        <CostSheet jobId={jobId} item={item} />

                        {/* Finish bar — everything auto-saves; this is a clear "done" + copy/reuse */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-6 mt-2 border-t border-border/60">
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Check className="size-3.5 text-emerald-500" /> Changes save automatically as you edit.
                            </p>
                            <div className="flex items-center gap-2">
                                {!isTemplate && item.mode === "build" && (
                                    <Button variant="outline" size="sm" className="gap-1.5" onClick={saveAsProduct}>
                                        <Package2 className="size-3.5" /> Save as product
                                    </Button>
                                )}
                                {!isTemplate && (
                                    <Button variant="outline" size="sm" className="gap-1.5" onClick={openCopy}>
                                        <Copy className="size-3.5" /> Copy to job…
                                    </Button>
                                )}
                                <Button size="sm" className="gap-1.5"
                                    onClick={() => router.push(isTemplate ? "/quoting/products" : `/quoting/${jobId}`)}>
                                    <Check className="size-3.5" /> {isTemplate ? "Done — back to Products" : "Done — back to job"}
                                </Button>
                            </div>
                        </div>
                    </>
                )}

                <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
                    <DialogContent className="sm:max-w-[520px]">
                        <DialogHeader>
                            <DialogTitle>Copy this BOM to another job</DialogTitle>
                            <DialogDescription>
                                Drops a full copy of <strong>{item?.name || "this item"}</strong> (with its whole BOM) into the job you
                                pick, then opens it there so you can tweak it for that project.
                            </DialogDescription>
                        </DialogHeader>
                        <Input placeholder="Search jobs…" value={jobSearch} onChange={(e) => setJobSearch(e.target.value)} />
                        <div className="max-h-[360px] overflow-y-auto -mx-1 mt-1">
                            {jobs === null ? (
                                <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
                            ) : filteredJobs.length === 0 ? (
                                <div className="py-8 text-center text-sm text-muted-foreground">
                                    {jobs.length === 0 ? "No other jobs yet." : "No jobs match."}
                                </div>
                            ) : (
                                <ul className="divide-y divide-border/60">
                                    {filteredJobs.map((j) => (
                                        <li key={j.id}>
                                            <button type="button" disabled={copying} onClick={() => copyToJob(j)}
                                                className="w-full text-left px-3 py-2.5 hover:bg-muted/50 rounded-md flex items-center gap-2 disabled:opacity-50">
                                                <Copy className="size-4 text-muted-foreground shrink-0" />
                                                <span className="flex-1 truncate">{j.title}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </PageShell>
        </DashboardLayout>
    )
}
