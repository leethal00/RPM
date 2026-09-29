"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
    const { clientId, customers, isAdmin } = useCustomerFilter()
    const [filters, setFilters] = useState({ client: "all", site: "", quotedBy: "", xero: "", status: "all" })
    const [previousClientId, setPreviousClientId] = useState(clientId)
    const [page, setPage] = useState(1)
    // Reset local filters and pagination when the shared customer scope changes.
    if (previousClientId !== clientId) {
        setPreviousClientId(clientId)
        setFilters({ client: "all", site: "", quotedBy: "", xero: "", status: "all" })
        setPage(1)
    }
    const [search, setSearch] = useState("")
    const [view, setView] = useState<QuoteView>("active")
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [copyingId, setCopyingId] = useState<string | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<QuoteRow | null>(null)
    const [deleting, setDeleting] = useState(false)
    const statuses = view === "active" ? ["quote", "quoted"] : ["approved", "in_progress", "complete", "invoiced", "cancelled"]
    const key = JSON.stringify(["quotes", view, page, clientId, search, filters])
    const hasFilters = search.trim() !== "" || Object.entries(filters).some(([key, value]) => value !== (key === "client" || key === "status" ? "all" : ""))

    function updateFilter(name: keyof typeof filters, value: string) {
        setFilters(current => ({ ...current, [name]: value }))
        setPage(1)
    }

    function clearFilters() {
        setFilters({ client: "all", site: "", quotedBy: "", xero: "", status: "all" })
        setSearch("")
        setPage(1)
    }

    const { data: result, error, isLoading, mutate } = useSupabaseQuery<{ items: QuoteRow[]; count: number }>(key, async () => {
        const site = filters.site.trim()
        let query = supabase.from("costing_jobs").select(`*, clients ( name ), stores${site ? "!inner" : ""} ( name )`, { count: "exact" }).eq("is_template", false).in("status", statuses)
        if (clientId) query = query.eq("client_id", clientId)
        else if (isAdmin && filters.client === "adhoc") query = query.is("client_id", null)
        else if (isAdmin && filters.client !== "all") query = query.eq("client_id", filters.client)
        const contains = (value: string) => `%${value.trim().replace(/[\\%_*]/g, "\\$&")}%`
        if (site) query = query.ilike("stores.name", contains(site))
        if (filters.quotedBy.trim()) query = query.ilike("quoted_by_name", contains(filters.quotedBy))
        if (filters.xero.trim()) query = query.ilike("xero_quote_number", contains(filters.xero))
        if (filters.status !== "all") query = query.eq("status", filters.status)
        if (search.trim()) {
            const term = search.trim().replace(/[,()*%]/g, "")
            query = query.or(`title.ilike.%${term}%,reference.ilike.%${term}%,xero_quote_number.ilike.%${term}%,quoted_by_name.ilike.%${term}%`)
        }
        query = query.order("created_at", { ascending: false })
        const from = (page - 1) * PAGE_SIZE
        query = query.range(from, from + PAGE_SIZE - 1)
        const { data, error, count } = await query
        if (error) throw error
        return { data: { items: (data as QuoteRow[]) || [], count: count ?? 0 }, error: null }
    }, { keepPreviousData: false })

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

    return <DashboardLayout><PageShell width="full" className="px-4 xl:px-6 gap-2 py-4">
        <PageHeader icon={Calculator} kicker="Job & Project Management" title="Quotes" description="Build active quotes and keep completed quotes as reusable history." actions={<div className="flex items-center gap-2"><XeroConnect /><Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}><DialogTrigger asChild><Button size="sm" className="gap-1.5 h-9"><Plus className="size-3.5" /> New quote</Button></DialogTrigger><DialogContent className="sm:max-w-[600px]"><DialogHeader><DialogTitle>New quote</DialogTitle><DialogDescription>Start a quote. Client and site are optional for ad-hoc / wholesale work.</DialogDescription></DialogHeader><CostingJobForm onSuccess={(id) => { setIsDialogOpen(false); mutate(); if (id) router.push(`/quoting/${id}`) }} onCancel={() => setIsDialogOpen(false)} /></DialogContent></Dialog></div>} />

        <div className="inline-flex w-fit rounded-md border border-border/60 bg-muted/30 p-0.5">
            <button onClick={() => { setView("active"); updateFilter("status", "all") }} className={`rounded px-3 py-1 text-sm ${view === "active" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>Active Quotes</button>
            <button onClick={() => { setView("completed"); updateFilter("status", "all") }} className={`rounded px-3 py-1 text-sm ${view === "completed" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>Completed Quotes</button>
        </div>

        <div className="flex items-center gap-2"><div className="relative flex-1 max-w-md"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="Search quote, reference or Xero quote #…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-8 h-8" /></div>{hasFilters && <Button size="sm" variant="ghost" className="h-8" onClick={clearFilters}>Clear filters</Button>}<span aria-live="polite" className="text-xs text-muted-foreground ml-auto">{totalCount} {totalCount === 1 ? "quote" : "quotes"}</span></div>

        <div className="border border-border/60 rounded-lg overflow-x-auto"><table aria-label="Quotes" className="w-full text-sm"><thead className="bg-muted/40 text-muted-foreground"><tr className="text-left"><th className="font-medium px-3 py-1.5">Quote</th><th className="font-medium px-3 py-1.5">Client / Site</th><th className="font-medium px-3 py-1.5">People</th><th className="font-medium px-3 py-1.5 w-28">Xero #</th><th className="font-medium px-3 py-1.5 w-36">Status</th><th className="w-36"><span className="sr-only">Actions</span></th></tr>
            <tr>
                <th className="px-3 pb-2 font-normal"><span className="text-xs">Use search above</span></th>
                <th className="px-3 pb-2 font-normal">
                    <div className="flex flex-col gap-1 min-w-40">
                        {isAdmin && !clientId ? <Select value={filters.client} onValueChange={value => updateFilter("client", value)}>
                            <SelectTrigger size="sm" aria-label="Filter by client" className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All clients</SelectItem>
                                <SelectItem value="adhoc">Ad-hoc / No client</SelectItem>
                                {customers.map(client => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
                            </SelectContent>
                        </Select> : <span className="text-xs text-left">{customers.find(client => client.id === clientId)?.name || "Current customer"}</span>}
                        <Input aria-label="Filter by site" placeholder="Site…" className="h-8" value={filters.site} onChange={e => updateFilter("site", e.target.value)} />
                    </div>
                </th>
                <th className="px-3 pb-2 font-normal"><Input aria-label="Filter by quoted by" placeholder="Quoted by…" className="h-8 min-w-28" value={filters.quotedBy} onChange={e => updateFilter("quotedBy", e.target.value)} /></th>
                <th className="px-3 pb-2 font-normal"><Input aria-label="Filter by Xero quote number" placeholder="Xero #…" className="h-8 min-w-24" value={filters.xero} onChange={e => updateFilter("xero", e.target.value)} /></th>
                <th className="px-3 pb-2 font-normal">
                    <Select value={filters.status} onValueChange={value => updateFilter("status", value)}>
                        <SelectTrigger size="sm" aria-label="Filter by status" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="all">All statuses</SelectItem>{statuses.map(status => <SelectItem key={status} value={status}>{STATUS[status].label}</SelectItem>)}</SelectContent>
                    </Select>
                </th>
                <th />
            </tr></thead><tbody>{error ? <tr><td colSpan={6} role="alert" className="px-3 py-10 text-center text-sm">Could not load quotes. <Button variant="link" onClick={() => mutate()}>Try again</Button></td></tr> : isLoading ? <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">Loading quotes…</td></tr> : !quotes.length ? <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">{hasFilters ? "No quotes match these filters." : view === "active" ? "No active quotes." : "No completed quotes yet."}</td></tr> : quotes.map(q => { const meta = STATUS[q.status] || STATUS.quote; return <tr key={q.id} onClick={() => router.push(q.status === "in_progress" || q.status === "complete" || q.status === "invoiced" || q.status === "cancelled" ? `/quoting/jobs/${q.id}` : `/quoting/${q.id}`)} className="border-t border-border/60 cursor-pointer hover:bg-muted/30"><td className="px-3 py-1.5"><div className="font-medium leading-tight">{q.title}</div>{q.reference && <div className="text-[11px] leading-tight text-muted-foreground">{q.reference}</div>}</td><td className="px-3 py-1.5 text-muted-foreground">{q.clients?.name || "Ad-hoc"}{q.stores?.name ? ` · ${q.stores.name}` : ""}</td><td className="px-3 py-1.5 text-xs"><div>Quoted: <span className="font-medium">{q.quoted_by_name || "—"}</span></div></td><td className="px-3 py-1.5 tabular-nums">{q.xero_quote_number || "—"}</td><td className="px-3 py-1.5"><Badge variant="secondary" className={meta.className}>{meta.label}</Badge></td><td className="px-2 py-1"><div className="flex justify-end gap-1"><Button size="sm" variant="outline" className="h-7 gap-1.5 px-2" disabled={copyingId === q.id} onClick={(e) => { e.stopPropagation(); copyQuote(q) }}><Copy className="size-3.5" /> Copy</Button>{view === "active" && <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Delete quote" onClick={(e) => { e.stopPropagation(); setDeleteTarget(q) }}><Trash2 className="size-3.5" /></Button>}</div></td></tr> })}</tbody></table></div>{!error && !isLoading && <TablePagination page={page} pageCount={Math.ceil(totalCount / PAGE_SIZE)} onPageChange={setPage} totalItems={totalCount} pageSize={PAGE_SIZE} />}

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
