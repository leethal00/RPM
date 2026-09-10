"use client"

import { useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Calculator, FileText, Loader2, Pencil, RefreshCw, Send } from "lucide-react"
import Link from "next/link"
import { PageShell } from "@/components/page-shell"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ItemsList } from "@/components/costing/items-list"
import { CostingActuals } from "@/components/costing/costing-actuals"
import { EstVsActual } from "@/components/costing/est-vs-actual"
import { CostingJobForm } from "@/components/costing-job-form"
import type { CostingJob, CostingStatus } from "@/types/database"

const STATUS_LABEL: Record<CostingStatus, string> = {
    quote: "Draft Quote",
    quoted: "Xero Quote",
    approved: "Accepted",
    in_progress: "Job",
    complete: "Complete",
    invoiced: "Invoiced",
    cancelled: "Cancelled",
}

export default function CostingJobDetailPage() {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()
    const params = useParams()
    const id = params.id as string

    const [editOpen, setEditOpen] = useState(false)
    const [sendingXero, setSendingXero] = useState(false)
    const [syncingXero, setSyncingXero] = useState(false)
    const [xeroError, setXeroError] = useState("")

    const { data, isLoading, mutate } = useSupabaseQuery<CostingJob | null>(
        id ? `costing-job-${id}` : null,
        async () => {
            const { data: job, error } = await supabase
                .from("costing_jobs").select(`*, clients ( name ), stores ( name )`).eq("id", id).single()
            if (error) throw error
            return { data: job as CostingJob, error: null }
        }
    )

    const job = data ?? undefined

    async function sendToXero() {
        if (!job || sendingXero) return
        setXeroError("")
        setSendingXero(true)
        try {
            const response = await fetch(`/api/xero/quotes/${job.id}/send`, { method: "POST" })
            const body = await response.json()
            if (!response.ok) throw new Error(body.error || "Could not send quote to Xero.")
            await mutate()
        } catch (error) {
            setXeroError(error instanceof Error ? error.message : "Could not send quote to Xero.")
        } finally {
            setSendingXero(false)
        }
    }

    async function syncXero() {
        if (!job || syncingXero) return
        setXeroError("")
        setSyncingXero(true)
        try {
            const response = await fetch(`/api/xero/quotes/${job.id}/sync`, { method: "POST" })
            const body = await response.json()
            if (!response.ok) throw new Error(body.error || "Could not sync Xero status.")
            await mutate()
        } catch (error) {
            setXeroError(error instanceof Error ? error.message : "Could not sync Xero status.")
        } finally {
            setSyncingXero(false)
        }
    }

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
                        <div className="flex items-start justify-between gap-4 pb-5 border-b border-border/60">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2.5">
                                    <Calculator className="size-5 text-muted-foreground shrink-0" />
                                    <h1 className="text-[1.7rem] font-semibold tracking-tight text-foreground">{job.title}</h1>
                                    <button onClick={() => setEditOpen(true)} className="text-muted-foreground hover:text-foreground p-1 shrink-0" title="Edit job">
                                        <Pencil className="size-4" />
                                    </button>
                                </div>
                                {job.reference && <p className="text-sm text-muted-foreground mt-1">{job.reference}</p>}
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {[job.clients?.name || "Ad-hoc / wholesale", job.stores?.name].filter(Boolean).join(" · ")}
                                </p>
                                {(job.xero_quote_number || job.xero_invoice_number || job.job_number) && (
                                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                        {job.xero_quote_number && <span>Xero quote: <strong className="text-foreground">{job.xero_quote_number}</strong></span>}
                                        {job.xero_invoice_number && <span>Xero invoice: <strong className="text-foreground">{job.xero_invoice_number}</strong></span>}
                                        {job.job_number && <span>Job no: <strong className="text-foreground">{job.job_number}</strong></span>}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                                {!job.xero_quote_id ? (
                                    <Button size="sm" className="h-9 gap-1.5" onClick={sendToXero} disabled={sendingXero}>
                                        {sendingXero ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                                        {sendingXero ? "Sending..." : "Send to Xero"}
                                    </Button>
                                ) : (
                                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={syncXero} disabled={syncingXero}>
                                        {syncingXero ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                                        {syncingXero ? "Checking..." : "Check Xero"}
                                    </Button>
                                )}
                                <Button asChild variant="outline" size="sm" className="gap-1.5 h-9">
                                    <Link href={`/quoting/${id}/job-card`} target="_blank">
                                        <FileText className="size-3.5" /> Job card
                                    </Link>
                                </Button>
                                <Badge variant="secondary">{STATUS_LABEL[job.status]}</Badge>
                            </div>
                        </div>

                        {xeroError && (
                            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {xeroError}
                            </div>
                        )}

                        <Dialog open={editOpen} onOpenChange={setEditOpen}>
                            <DialogContent className="sm:max-w-[600px]">
                                <DialogHeader>
                                    <DialogTitle>Edit job</DialogTitle>
                                    <DialogDescription>Update the title, reference, client/site, qty or details.</DialogDescription>
                                </DialogHeader>
                                <CostingJobForm job={job} onSuccess={() => { setEditOpen(false); mutate() }} onCancel={() => setEditOpen(false)} />
                            </DialogContent>
                        </Dialog>

                        <Tabs defaultValue="items" className="mt-2">
                            <TabsList>
                                <TabsTrigger value="items">Items</TabsTrigger>
                                <TabsTrigger value="actuals">Actuals</TabsTrigger>
                                <TabsTrigger value="est-vs-actual">Est vs Actual</TabsTrigger>
                            </TabsList>
                            <TabsContent value="items"><ItemsList job={job} /></TabsContent>
                            <TabsContent value="actuals"><CostingActuals job={job} /></TabsContent>
                            <TabsContent value="est-vs-actual"><EstVsActual job={job} /></TabsContent>
                        </Tabs>
                    </>
                )}
            </PageShell>
        </DashboardLayout>
    )
}
