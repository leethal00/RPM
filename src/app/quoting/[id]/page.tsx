"use client"

import { useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Calculator } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import type { CostingJob, CostingLine, CostingStatus } from "@/types/database"

const STATUS_LABEL: Record<CostingStatus, string> = {
    quote: "Quote", quoted: "Quoted", approved: "Approved", in_progress: "In progress",
    complete: "Complete", invoiced: "Invoiced", cancelled: "Cancelled",
}

const nz = (n: number) => n.toLocaleString("en-NZ", { style: "currency", currency: "NZD" })

export default function CostingJobDetailPage() {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()
    const params = useParams()
    const id = params.id as string

    const { data, isLoading } = useSupabaseQuery<{ job: CostingJob; lines: CostingLine[] } | null>(
        id ? `costing-job-${id}` : null,
        async () => {
            const [{ data: job, error: je }, { data: lines, error: le }] = await Promise.all([
                supabase.from("costing_jobs").select(`*, clients ( name ), stores ( name )`).eq("id", id).single(),
                supabase.from("costing_lines").select("*").eq("job_id", id).order("sort"),
            ])
            if (je) throw je
            if (le) throw le
            return { data: { job: job as CostingJob, lines: (lines as CostingLine[]) || [] }, error: null }
        }
    )

    const job = data?.job
    const lines = data?.lines || []

    const cost = lines.reduce((s, l) => s + Number(l.line_cost), 0)
    const sell = lines.reduce((s, l) => s + Number(l.line_sell), 0)
    const margin = sell > 0 ? 1 - cost / sell : 0
    const grandSell = job?.adjusted_total ?? sell

    return (
        <DashboardLayout>
            <PageShell>
                <Button variant="ghost" size="sm" className="mb-2 -ml-2 gap-1.5 text-muted-foreground" onClick={() => router.push("/quoting")}>
                    <ArrowLeft className="size-3.5" /> Jobs & Quotes
                </Button>

                {isLoading ? (
                    <div className="h-24 rounded-lg bg-muted/40 animate-pulse" />
                ) : !job ? (
                    <div className="py-16 text-center text-muted-foreground">Job not found.</div>
                ) : (
                    <>
                        <PageHeader
                            icon={Calculator}
                            kicker={job.reference || "Costing job"}
                            title={job.title}
                            description={[job.clients?.name || "Ad-hoc / wholesale", job.stores?.name].filter(Boolean).join(" · ")}
                            actions={<Badge variant="secondary">{STATUS_LABEL[job.status]}</Badge>}
                        />

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                            {[
                                { label: "Cost", value: nz(cost) },
                                { label: "Sell", value: nz(sell) },
                                { label: "Margin", value: `${(margin * 100).toFixed(1)}%` },
                                { label: "Quoted total", value: nz(grandSell) },
                            ].map((s) => (
                                <div key={s.label} className="rounded-lg border border-border/60 p-4">
                                    <div className="text-xs text-muted-foreground">{s.label}</div>
                                    <div className="text-lg font-semibold tabular-nums mt-0.5">{s.value}</div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 rounded-lg border border-dashed border-border/60 p-8 text-center">
                            <h3 className="text-base font-medium text-foreground">Cost sheet</h3>
                            <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
                                The BOM editor (add materials &amp; labour from the catalogue, sectioned, with
                                estimated vs. actual) lands here next. {lines.length} line{lines.length === 1 ? "" : "s"} so far.
                            </p>
                        </div>
                    </>
                )}
            </PageShell>
        </DashboardLayout>
    )
}
