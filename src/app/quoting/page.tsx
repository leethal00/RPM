"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Plus, Calculator, Search, Copy, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { CostingJobForm } from "@/components/costing-job-form"
import { XeroConnect } from "@/components/costing/xero-connect"
import { TablePagination } from "@/components/table-pagination"
import { useCustomerFilter } from "@/lib/customer-filter"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { toast } from "sonner"
import type { CostingJob } from "@/types/database"

const PAGE_SIZE = 20
type QuoteRow = CostingJob & { clients?: { name: string } | null; stores?: { name: string } | null }
type QuoteView = "active" | "completed"

const STATUS: Record<string, { label: string; className: string }> = {
    quote: { label: "Draft Quote", className: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
    quoted: { label: "Pending", className: "bg-blue-500/15 text-blue-600 dark:text-blue-300" },
    approved: { label: "Accepted", className: "bg-violet-500/15 text-violet-600 dark:text-violet-300" },
    in_progress: { label: "Converted to job", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
    complete: { label: "Job complete", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
    invoiced: { label: "Invoiced", className: "bg-green-600/15 text-green-700 dark:text-green-300" },
    cancelled: { label: "Cancelled", className: "bg-red-500/15 text-red-600 dark:text-red-300" },
}

export default function QuotesPage() {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()
    const { clientId } = useCustomerFilter()
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState("")
    const [view, setView] = useState<QuoteView>("active")
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [copyingId, setCopyingId] = useState<string | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<QuoteRow | null>(null)
    const [deleting, setDeleting] = useState(false)
    const statuses = view === "active" ? ["quote", "quoted"] : ["approved", "in_progress", "complete", "invoiced", "cancelled"]
    const key = `quotes-${view}-${page}-${clientId ?? "all"}-${search}`

    const { data: result, isLoading, mutate } = useSupabaseQuery<{ items: QuoteRow[]; count: number }>(key, async () => {
        let query = supabase.from("costing_jobs").select(`*, clients ( name ), stores ( name )`, { count: "exact" }).eq("is_template", false).in("status", statuses)
        if (clientId) query = query.eq("client_id", clientId)
        if (search.trim()) {
            const term = search.trim().replace(/[,()*%]/g, "")
            query = query.or(`title.ilike.%${term}%,reference.ilike.%${term}%,xero_quote_number.ilike.%${term}%,quoted_by_name.ilike.%${term}%,job_lead_name.ilike.%${term}%`)
        }
        query = query.order("created_at", { ascending: false })
        const from = (page - 1) * PAGE_SIZE
        query = query.range(from, from + PAGE_SIZE - 1)
        const { data, error, count } = await query
        if (error) throw error
        return { data: { items: (data as QuoteRow[]) || [], count: count ?? 0 }, error: null }
    })

    async function copyQuote(source: QuoteRow) {
        if (copyingId) return
        setCopyingId(source.id)
        try {
            const { data: auth } = await supabase.auth.getUser()
            const { data: currentMember } = auth.user?.id
                ? await supabase.from("users").select("name,email").eq("id", auth.user.id).maybeSingle()
                : { data: null }
            const quotedByName = currentMember?.name?.trim() || currentMember?.email?.split("@")[0] || null
            const { data: newQuote, error: createError } = await supabase.from("costing_jobs").insert({
                title: source.title,
                client_id: source.client_id,
                store_id: source.store_id,
                reference: source.reference,
                details: source.details,
                contact_name: source.contact_name,
                qty: source.qty || 1,
                status: "quote",
                is_template: false,
                created_by: auth.user?.id || null,
                quoted_by: auth.user?.id || null,
                quoted_by_name: quotedByName,
                job_lead_name: null,
            }).select("id").single()
            if (createError || !newQuote) throw createError || new Error("Could not create copied quote")

            const { data: sourceItems, error: itemsError } = await supabase.from("costing_items").select("id").eq("job_id", source.id).order("sort")
            if (itemsError) throw itemsError
            for (const item of sourceItems || []) {
                const { error } = await supabase.rpc("clone_costing_item", { src_item: item.id, target_job: newQuote.id })
                if (error) throw error
            }
            toast.success("Copied to a new draft quote")
            router.push(`/quoting/${newQuote.id}`)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not copy quote")
        } finally {
            setCopyingId(null)
        }
    }

    async function deleteQuote() {
        if (!deleteTarget || deleting) return
        setDeleting(true)
        try {
            const { error } = await supabase.from("costing_jobs").delete().eq("id", deleteTarget.id)
            if (error) throw error
            toast.success("Quote deleted from RPM")
            setDeleteTarget(null)
            await mutate()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not delete quote")
        } finally {
            setDeleting(false)
        }
    }

    const quotes = result?.items || []
    const totalCount = result?.count ?? 0

    return <DashboardLayout><PageShell>
        <PageHeader icon={Calculator} kicker="Job & Project Management" title="Quotes" description="Build active quotes and keep completed quotes as reusable history." actions={<div className="flex items-center gap-2"><XeroConnect /><Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}><DialogTrigger asChild><Button size="sm" className="gap-1.5 h-9"><Plus className="size-3.5" /> New quote</Button></DialogTrigger><DialogContent className="sm:max-w-[600px]"><DialogHeader><DialogTitle>New quote</DialogTitle><DialogDescription>Start a quote. Client and site are optional for ad-hoc / wholesale work.</DialogDescription></DialogHeader><CostingJobForm onSuccess={(id) => { setIsDialogOpen(false); mutate(); if (id) router.push(`/quoting/${id}`) }} onCancel={() => setIsDialogOpen(false)} /></DialogContent></Dialog></div>} />

        <div className="mb-4 inline-flex rounded-md border border-border/60 bg-muted/30 p-1">
            <button onClick={() => { setView("active"); setPage(1) }} className={`rounded px-3 py-1.5 text-sm ${view === "active" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>Active Quotes</button>
            <button onClick={() => { setView("completed"); setPage(1) }} className={`rounded px-3 py-1.5 text-sm ${view === "completed" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>Completed Quotes</button>
        </div>

        <div className="flex items-center gap-2 mb-4"><div className="relative flex-1 max-w-md"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="Search quote, reference or Xero quote #…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-8 h-9" /></div><span className="text-xs text-muted-foreground ml-auto">{totalCount} {totalCount === 1 ? "quote" : "quotes"}</span></div>

        {isLoading ? <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />)}</div> : quotes.length ? <><div className="border border-border/60 rounded-lg overflow-hidden"><table className="w-full text-sm"><thead className="bg-muted/40 text-muted-foreground"><tr className="text-left"><th className="font-medium px-4 py-2.5">Quote</th><th className="font-medium px-4 py-2.5">Client / Site</th><th className="font-medium px-4 py-2.5">People</th><th className="font-medium px-4 py-2.5 w-28">Xero #</th><th className="font-medium px-4 py-2.5 w-36">Status</th><th className="w-36"></th></tr></thead><tbody>{quotes.map(q => { const meta = STATUS[q.status] || STATUS.quote; return <tr key={q.id} onClick={() => router.push(q.status === "in_progress" || q.status === "complete" || q.status === "invoiced" || q.status === "cancelled" ? `/quoting/jobs/${q.id}` : `/quoting/${q.id}`)} className="border-t border-border/60 cursor-pointer hover:bg-muted/30"><td className="px-4 py-3"><div className="font-medium">{q.title}</div>{q.reference && <div className="text-xs text-muted-foreground">{q.reference}</div>}</td><td className="px-4 py-3 text-muted-foreground">{q.clients?.name || "Ad-hoc"}{q.stores?.name ? ` · ${q.stores.name}` : ""}</td><td className="px-4 py-3 text-xs"><div>Quoted: <span className="font-medium">{q.quoted_by_name || "—"}</span></div><div className="text-muted-foreground">Lead: {q.job_lead_name || "Unassigned"}</div></td><td className="px-4 py-3 tabular-nums">{q.xero_quote_number || "—"}</td><td className="px-4 py-3"><Badge variant="secondary" className={meta.className}>{meta.label}</Badge></td><td className="px-3 py-2"><div className="flex justify-end gap-1.5"><Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={copyingId === q.id} onClick={(e) => { e.stopPropagation(); copyQuote(q) }}><Copy className="size-3.5" /> Copy</Button>{view === "active" && <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Delete quote" onClick={(e) => { e.stopPropagation(); setDeleteTarget(q) }}><Trash2 className="size-3.5" /></Button>}</div></td></tr> })}</tbody></table></div><TablePagination page={page} pageCount={Math.ceil(totalCount / PAGE_SIZE)} onPageChange={setPage} totalItems={totalCount} pageSize={PAGE_SIZE} /></> : <div className="py-16 text-center border border-dashed border-border/60 rounded-lg text-sm text-muted-foreground">{view === "active" ? "No active quotes." : "No completed quotes yet."}</div>}

        <Dialog open={deleteTarget != null} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null) }}>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle>Delete this quote?</DialogTitle>
                    <DialogDescription>
                        <strong>{deleteTarget?.title}</strong> will be removed from RPM. {deleteTarget?.xero_quote_id ? "The Xero quote will not be deleted, so remove it separately in Xero if you no longer need it." : "This cannot be undone."}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
                    <Button variant="destructive" onClick={deleteQuote} disabled={deleting}>{deleting ? "Deleting…" : "Delete quote"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </PageShell></DashboardLayout>
}
