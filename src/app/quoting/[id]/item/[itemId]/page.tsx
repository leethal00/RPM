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

                        <CostSheet jobId={jobId} item={item} />
                    </>
                )}
            </PageShell>
        </DashboardLayout>
    )
}
