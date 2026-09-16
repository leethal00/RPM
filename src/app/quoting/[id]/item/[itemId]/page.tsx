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
        router.push(`/quoting/${target.id}/item/${newId}`)
    }

    const filteredJobs = (jobs ?? []).filter((j) => j.title.toLowerCase().includes(jobSearch.trim().toLowerCase()))

    return (
        <DashboardLayout>
            <PageShell>
                <div className="flex items-center justify-between gap-3">
                    <Button variant="ghost" size="sm" className="h-7 -ml-2 gap-1.5 text-muted-foreground"
                        onClick={() => router.push(isTemplate ? "/quoting/products" : `/quoting/${jobId}`)}>
                        <ArrowLeft className="size-3.5" /> {isTemplate ? "Products" : (job?.title || "Job")}
                    </Button>
                    {!isTemplate && !loading && item && item.mode === "build" && (
                        <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={saveAsProduct}>
                            <Package2 className="size-3" /> Save as product
                        </Button>
                    )}
                </div>

                {loading || !item ? (
                    <div className="h-20 rounded-lg bg-muted/40 animate-pulse mt-2" />
                ) : (
                    <>
                        <div className="mt-1 flex items-end justify-between gap-4 pb-3 border-b border-border/60">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
                                    <Layers className="size-3" />
                                    <span className="text-[11px] font-medium">Item — build</span>
                                </div>
                                <input
                                    defaultValue={item.name}
                                    onBlur={(e) => { if (e.target.value !== item.name) patchItem({ name: e.target.value }) }}
                                    className="text-[1.35rem] leading-tight font-semibold tracking-tight bg-transparent outline-none border-b border-transparent focus:border-input w-full"
                                    placeholder="Item name"
                                />
                            </div>
                            <div className="flex items-end gap-3 shrink-0">
                                <div className="w-20">
                                    <label className="text-[11px] text-muted-foreground">Quote qty</label>
                                    <NumCell value={item.qty} onCommit={(v) => patchItem({ qty: v ?? 1 })} />
                                </div>
                                {item.mode === "build" && (
                                    <div className="w-20">
                                        <label className="text-[11px] text-muted-foreground">Build qty</label>
                                        <NumCell value={item.build_qty ?? item.qty} onCommit={(v) => patchItem({ build_qty: v == null ? null : v })} />
                                    </div>
                                )}
                            </div>
                        </div>

                        {item.mode === "build" && item.build_qty != null && Number(item.build_qty) !== Number(item.qty) && (
                            <div className="mt-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                                Batch build: customer quote quantity is <span className="font-medium text-foreground">{Number(item.qty)}</span>; production quantity is <span className="font-medium text-foreground">{Number(item.build_qty)}</span>. BOM quantities below are for the complete batch and are not multiplied automatically.
                            </div>
                        )}

                        <div className="mt-3 rounded-lg border border-border/60 p-3 space-y-2.5">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-[11px] font-medium text-muted-foreground">Quote description — customer facing</div>
                                <div className="hidden lg:block text-[11px] text-muted-foreground truncate max-w-[48%]">
                                    {[item.size, item.delivery].filter(Boolean).join(" · ")}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-2.5">
                                <div>
                                    <label className="mb-1 block text-[11px] text-muted-foreground">Size</label>
                                    <input defaultValue={item.size ?? ""} placeholder="e.g. 1400x400mm"
                                        onBlur={(e) => { if (e.target.value !== (item.size ?? "")) patchItem({ size: e.target.value || null }) }}
                                        className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring" />
                                </div>
                                <div>
                                    <label className="mb-1 block text-[11px] text-muted-foreground">Delivery</label>
                                    <select value={item.delivery ?? ""} onChange={(e) => patchItem({ delivery: e.target.value || null })}
                                        className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring">
                                        <option value="">—</option>
                                        <option value="Ex-factory">Ex-factory</option>
                                        <option value="Freight to site">Freight to site</option>
                                        <option value="Install on site">Install on site</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-[11px] text-muted-foreground">Details</label>
                                <textarea defaultValue={item.details ?? ""} placeholder="How it's made — extrusion, bracing, finish, face, LED, etc."
                                    onBlur={(e) => { if (e.target.value !== (item.details ?? "")) patchItem({ details: e.target.value || null }) }}
                                    className="min-h-[96px] w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-sm leading-5 outline-none focus:border-ring" />
                            </div>
                            <div className="rounded-md bg-muted/25 px-2.5 py-2 text-xs leading-5 text-foreground/80">
                                <div className="mb-1 text-[11px] font-medium text-muted-foreground">Customer quote preview</div>
                                <div><span className="font-medium">Item:</span> {item.name || "Item"}</div>
                                <div><span className="font-medium">Qty:</span> {Number(item.qty)}</div>
                                {item.size?.trim() && <div><span className="font-medium">Size:</span> {item.size.trim()}</div>}
                                <div className="whitespace-pre-wrap"><span className="font-medium">Details:</span>{item.details?.trim() ? ` ${item.details.trim()}` : " —"}</div>
                                {item.delivery?.trim() && <div>{item.delivery.trim()}</div>}
                            </div>
                        </div>

                        <CostSheet jobId={jobId} item={item} />

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-4 mt-1 border-t border-border/60">
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Check className="size-3.5 text-emerald-500" /> Changes save automatically.
                            </p>
                            <div className="flex items-center gap-2">
                                {!isTemplate && item.mode === "build" && (
                                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={saveAsProduct}>
                                        <Package2 className="size-3.5" /> Save as product
                                    </Button>
                                )}
                                {!isTemplate && (
                                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={openCopy}>
                                        <Copy className="size-3.5" /> Copy to job…
                                    </Button>
                                )}
                                <Button size="sm" className="h-8 gap-1.5"
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
                                Drops a full copy of <strong>{item?.name || "this item"}</strong> (with its whole BOM) into the job you pick, then opens it there so you can tweak it for that project.
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
