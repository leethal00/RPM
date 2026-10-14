"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Calculator, ExternalLink, FileText, Loader2, MapPin, Pencil, RefreshCw, Send } from "lucide-react"
import Link from "next/link"
import { PageShell } from "@/components/page-shell"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ItemsList } from "@/components/costing/items-list"
import { QuotePreviewButton } from "@/components/costing/quote-preview-button"
import { JobDrawings } from "@/components/costing/job-drawings"
import { JobEmails } from "@/components/costing/job-emails"
import { JobInternalNotes } from "@/components/costing/job-internal-notes"
import { JobPhotos } from "@/components/costing/job-photos"
import { CostingActuals } from "@/components/costing/costing-actuals"
import { EstVsActual } from "@/components/costing/est-vs-actual"
import { CostingJobForm } from "@/components/costing-job-form"
import { JobXeroInvoice } from "@/components/costing/job-xero-invoice"
import { isStaffAdmin } from "@/lib/permissions"
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

type XeroQuoteSnapshot = {
    xeroQuoteNumber: string
    rpmQuoteNumber: string | null
    status: string
    subtotal: number
    lines: { description?: string; quantity?: number; unitAmount?: number; amount?: number }[]
}

function formatDate(value?: string | null) {
    if (!value) return null
    return new Date(`${value}T00:00:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })
}

export default function CostingJobDetailPage() {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()
    const params = useParams()
    const id = params.id as string

    const [editOpen, setEditOpen] = useState(false)
    const [sendingXero, setSendingXero] = useState(false)
    const [syncingXero, setSyncingXero] = useState(false)
    const [updatingXero, setUpdatingXero] = useState(false)
    const [xeroError, setXeroError] = useState("")
    const [xeroNotice, setXeroNotice] = useState("")
    const [xeroSnapshot, setXeroSnapshot] = useState<XeroQuoteSnapshot | null>(null)
    const [xeroSnapshotOpen, setXeroSnapshotOpen] = useState(false)
    const [inspectingXero, setInspectingXero] = useState(false)
    const autoCheckedQuoteId = useRef<string | null>(null)
    const xeroCheckInFlight = useRef(false)
    const lastXeroCheckAt = useRef(0)
    const [canManageXero, setCanManageXero] = useState(false)

    useEffect(() => {
        let active = true
        async function loadRole() {
            const { data: auth } = await supabase.auth.getUser()
            if (!auth.user) return
            const { data: profile } = await supabase.from("users").select("role").eq("id", auth.user.id).single()
            if (active) setCanManageXero(isStaffAdmin(profile?.role))
        }
        void loadRole()
        return () => { active = false }
    }, [supabase])

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
    const isJobStage = !!job && ["in_progress", "complete", "invoiced", "cancelled"].includes(job.status)
    useEffect(() => {
        if (isJobStage && job?.id === id) router.replace(`/quoting/jobs/${id}`)
    }, [id, isJobStage, job?.id, router])
    const backPath = isJobStage ? "/quoting/jobs" : "/quoting"
    const backLabel = isJobStage ? "Active Jobs" : "Quotes"
    const xeroQuoteUrl = job?.xero_quote_id
        ? `https://go.xero.com/Accounts/Receivable/Quotes/View/${job.xero_quote_id}`
        : null

    useEffect(() => {
        if (!job?.xero_quote_id || job.status !== "quoted") return
        if (autoCheckedQuoteId.current !== job.id) {
            autoCheckedQuoteId.current = job.id
            lastXeroCheckAt.current = 0
        }
        const quoteId = job.id
        async function checkOnReturn() {
            if (xeroCheckInFlight.current || Date.now() - lastXeroCheckAt.current < 15_000) return
            xeroCheckInFlight.current = true
            lastXeroCheckAt.current = Date.now()
            setSyncingXero(true)
            try {
                const response = await fetch(`/api/xero/quotes/${quoteId}/sync`, { method: "POST" })
                const body = await response.json()
                if (!response.ok) throw new Error(body.error || "Could not check Xero quote status.")
                if (body.changedToJob || body.xeroStatus === "ACCEPTED" || body.xeroStatus === "INVOICED") await mutate()
            } catch (error) {
                setXeroError(error instanceof Error ? error.message : "Could not check Xero quote status.")
            } finally {
                xeroCheckInFlight.current = false
                setSyncingXero(false)
            }
        }
        void checkOnReturn()
        window.addEventListener("focus", checkOnReturn)
        return () => window.removeEventListener("focus", checkOnReturn)
    }, [job?.id, job?.status, job?.xero_quote_id, mutate])

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

    async function updateXero() {
        if (!job || updatingXero) return
        setXeroError("")
        setXeroNotice("")
        setUpdatingXero(true)
        try {
            const response = await fetch(`/api/xero/quotes/${job.id}/update`, { method: "POST" })
            const body = await response.json()
            if (!response.ok) throw new Error(body.error || "Could not update Xero quote.")
            await mutate()
            setXeroNotice(body.resendRequired
                ? "Xero quote updated. Open it in Xero and resend the revised quote to the client."
                : "Xero draft updated. Review and send it from Xero when ready.")
        } catch (error) {
            setXeroError(error instanceof Error ? error.message : "Could not update Xero quote.")
        } finally {
            setUpdatingXero(false)
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
            if (body.warning) setXeroError(body.warning)
        } catch (error) {
            setXeroError(error instanceof Error ? error.message : "Could not sync Xero status.")
        } finally {
            setSyncingXero(false)
        }
    }

    async function inspectXero() {
        if (!job || inspectingXero) return
        setXeroError("")
        setInspectingXero(true)
        try {
            const response = await fetch(`/api/xero/quotes/${job.id}/update`, { cache: "no-store" })
            const body = await response.json()
            if (!response.ok) throw new Error(body.error || "Could not read the Xero quote.")
            setXeroSnapshot(body)
            setXeroSnapshotOpen(true)
        } catch (error) {
            setXeroError(error instanceof Error ? error.message : "Could not read the Xero quote.")
        } finally {
            setInspectingXero(false)
        }
    }

    return (
        <DashboardLayout>
            <PageShell>
                <Button variant="ghost" size="sm" className="mb-2 -ml-2 gap-1.5 text-muted-foreground" onClick={() => router.push(backPath)}>
                    <ArrowLeft className="size-3.5" /> {backLabel}
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
                                    {!isJobStage && (
                                        <button onClick={() => setEditOpen(true)} className="text-muted-foreground hover:text-foreground p-1 shrink-0" title="Edit quote">
                                            <Pencil className="size-4" />
                                        </button>
                                    )}
                                </div>
                                {job.reference && <p className="text-sm text-muted-foreground mt-1">{job.reference}</p>}
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {`${job.clients?.name || "Ad-hoc"} · ${job.stores?.name || "Manufacture only / No site"}`}
                                </p>
                                {(job.quoted_by_name || job.job_lead_name || job.xero_quote_number || job.xero_invoice_number || job.job_number || job.due_date) && (
                                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                        <span>Quoted by: <strong className="text-foreground">{job.quoted_by_name || "—"}</strong></span>
                                        <span>Job lead: <strong className="text-foreground">{job.job_lead_name || "Unassigned"}</strong></span>
                                        {job.xero_quote_number && (
                                            xeroQuoteUrl ? (
                                                <a href={xeroQuoteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                                                    Xero quote: <strong className="text-foreground">{job.xero_quote_number}</strong><ExternalLink className="size-3" />
                                                </a>
                                            ) : <span>Xero quote: <strong className="text-foreground">{job.xero_quote_number}</strong></span>
                                        )}
                                        {job.xero_invoice_number && <span>Xero invoice: <strong className="text-foreground">{job.xero_invoice_number}</strong></span>}
                                        {job.job_number && <span>Job no: <strong className="text-foreground">{job.job_number}</strong></span>}
                                        {job.due_date && <span>Due: <strong className="text-foreground">{formatDate(job.due_date)}</strong></span>}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                                {job.store_id && <Button asChild variant="outline" size="sm" className="h-9 gap-1.5"><Link href={`/stores/${job.store_id}`}><MapPin className="size-3.5" /> View site</Link></Button>}
                                {!isJobStage && <QuotePreviewButton jobId={job.id} />}
                                {!job.xero_quote_id && !job.xero_invoice_id && !isJobStage ? (
                                    <Button size="sm" className="h-9 gap-1.5" onClick={sendToXero} disabled={sendingXero}>
                                        {sendingXero ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                                        {sendingXero ? "Sending..." : "Send to Xero"}
                                    </Button>
                                ) : job.xero_quote_id && !isJobStage ? (
                                    <>
                                        {job.status === "quoted" && (
                                            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={updateXero} disabled={updatingXero || syncingXero}>
                                                {updatingXero ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                                                {updatingXero ? "Updating..." : "Update Xero"}
                                            </Button>
                                        )}
                                        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={syncXero} disabled={syncingXero}>
                                            {syncingXero ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                                            {syncingXero ? "Checking..." : "Check Xero"}
                                        </Button>
                                        {job.status === "quoted" && <Button variant="outline" size="sm" className="h-9" onClick={inspectXero} disabled={inspectingXero}>
                                            {inspectingXero ? "Loading Xero..." : "View Xero lines"}
                                        </Button>}
                                        {canManageXero && !job.xero_invoice_id && !job.xero_invoice_number && ["quoted", "approved"].includes(job.status) && (
                                            <JobXeroInvoice job={job} onChanged={() => { setXeroError(""); void mutate() }} />
                                        )}
                                    </>
                                ) : null}
                                {["approved", "in_progress", "complete", "invoiced"].includes(job.status) && (
                                    <Button asChild variant="outline" size="sm" className="gap-1.5 h-9">
                                        <Link href={`/quoting/${id}/job-pack`}>
                                            <FileText className="size-3.5" /> Job pack
                                        </Link>
                                    </Button>
                                )}
                                {xeroQuoteUrl && job.status !== "quote" ? (
                                    <a href={xeroQuoteUrl} target="_blank" rel="noreferrer" title="Open this quote in Xero">
                                        <Badge variant="secondary" className="cursor-pointer hover:bg-muted">{STATUS_LABEL[job.status]} <ExternalLink className="ml-1 inline size-3" /></Badge>
                                    </a>
                                ) : (
                                    <Badge variant="secondary">{STATUS_LABEL[job.status]}</Badge>
                                )}
                            </div>
                        </div>

                        {xeroError && (
                            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {xeroError}
                            </div>
                        )}
                        {xeroNotice && <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
                            {xeroNotice} {xeroQuoteUrl && <a href={xeroQuoteUrl} target="_blank" rel="noreferrer" className="font-medium underline">Open Xero quote</a>}
                        </div>}

                        <Dialog open={editOpen} onOpenChange={setEditOpen}>
                            <DialogContent className="sm:max-w-[600px]">
                                <DialogHeader>
                                    <DialogTitle>Edit quote</DialogTitle>
                                    <DialogDescription>Update the title, reference, client/site, qty or details.</DialogDescription>
                                </DialogHeader>
                                <CostingJobForm job={job} onSuccess={() => { setEditOpen(false); mutate() }} onCancel={() => setEditOpen(false)} />
                            </DialogContent>
                        </Dialog>

                        <Dialog open={xeroSnapshotOpen} onOpenChange={setXeroSnapshotOpen}>
                            <DialogContent className="sm:max-w-[760px] max-h-[85vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle>Xero quote {xeroSnapshot?.xeroQuoteNumber}</DialogTitle>
                                    <DialogDescription>Current lines saved in Xero · {xeroSnapshot?.status} · subtotal before GST ${Number(xeroSnapshot?.subtotal || 0).toFixed(2)}</DialogDescription>
                                </DialogHeader>
                                {xeroSnapshot?.xeroQuoteNumber !== xeroSnapshot?.rpmQuoteNumber && <p className="text-sm text-red-700">RPM and Xero quote numbers differ. Check this before sending the quote.</p>}
                                <div className="space-y-2 text-sm">
                                    {xeroSnapshot?.lines.map((line, index) => <div key={index} className="flex gap-4 border-b pb-2">
                                        <span className="whitespace-pre-wrap flex-1">{line.description || "—"}</span>
                                        {line.amount != null && <span className="shrink-0 font-medium">${Number(line.amount).toFixed(2)}</span>}
                                    </div>)}
                                </div>
                            </DialogContent>
                        </Dialog>

                        <Tabs defaultValue={isJobStage ? "actuals" : "items"} className="mt-2">
                            <TabsList>
                                <TabsTrigger value="notes">Notes</TabsTrigger>
                                <TabsTrigger value="items">{isJobStage ? "Quoted Items" : "Items"}</TabsTrigger>
                                <TabsTrigger value="drawings">Drawings</TabsTrigger>
                                <TabsTrigger value="emails">Emails</TabsTrigger>
                                <TabsTrigger value="photos">Photos</TabsTrigger>
                                {isJobStage && <TabsTrigger value="actuals">Actuals</TabsTrigger>}
                                {isJobStage && <TabsTrigger value="est-vs-actual">Est vs Actual</TabsTrigger>}
                            </TabsList>
                            <TabsContent value="notes"><JobInternalNotes jobId={job.id} /></TabsContent>
                            <TabsContent value="items">
                                <div className={isJobStage ? "pointer-events-none select-none" : ""}><ItemsList job={job} /></div>
                            </TabsContent>
                            <TabsContent value="drawings"><JobDrawings jobId={job.id} /></TabsContent>
                            <TabsContent value="emails"><JobEmails jobId={job.id} /></TabsContent>
                            <TabsContent value="photos"><JobPhotos jobId={job.id} /></TabsContent>
                            {isJobStage && <TabsContent value="actuals"><CostingActuals job={job} /></TabsContent>}
                            {isJobStage && <TabsContent value="est-vs-actual"><EstVsActual job={job} /></TabsContent>}
                        </Tabs>
                    </>
                )}
            </PageShell>
        </DashboardLayout>
    )
}

