"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Layers } from "lucide-react"
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

    useEffect(() => {
        let active = true
        ;(async () => {
            const [{ data: j }, { data: i }] = await Promise.all([
                supabase.from("costing_jobs").select("id, title").eq("id", jobId).single(),
                supabase.from("costing_items").select("*").eq("id", itemId).single(),
            ])
            if (!active) return
            setJob(j as CostingJob)
            setItem(i as CostingItem)
            setLoading(false)
        })()
        return () => { active = false }
    }, [supabase, jobId, itemId])

    async function patchItem(patch: Partial<CostingItem>) {
        setItem((prev) => (prev ? { ...prev, ...patch } : prev))
        const { error } = await supabase.from("costing_items").update(patch).eq("id", itemId)
        if (error) console.error(error)
    }

    return (
        <DashboardLayout>
            <PageShell>
                <Button variant="ghost" size="sm" className="mb-2 -ml-2 gap-1.5 text-muted-foreground"
                    onClick={() => router.push(`/quoting/${jobId}`)}>
                    <ArrowLeft className="size-3.5" /> {job?.title || "Job"}
                </Button>

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
                    </>
                )}
            </PageShell>
        </DashboardLayout>
    )
}
