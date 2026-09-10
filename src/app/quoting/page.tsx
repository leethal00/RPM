"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Plus, Calculator, Search } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { CostingJobForm } from "@/components/costing-job-form"
import { XeroConnect } from "@/components/costing/xero-connect"
import { TablePagination } from "@/components/table-pagination"
import { useCustomerFilter } from "@/lib/customer-filter"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import type { CostingJob } from "@/types/database"

const PAGE_SIZE = 20
type QuoteRow = CostingJob & { clients?: { name: string } | null; stores?: { name: string } | null }
const STATUS = {
    quote: { label: "Draft Quote", className: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
    quoted: { label: "Xero Quote", className: "bg-blue-500/15 text-blue-600 dark:text-blue-300" },
    approved: { label: "Accepted", className: "bg-violet-500/15 text-violet-600 dark:text-violet-300" },
} as const

export default function QuotesPage() {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()
    const { clientId } = useCustomerFilter()
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState("")
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const key = `quotes-${page}-${clientId ?? "all"}-${search}`
    const { data: result, isLoading, mutate } = useSupabaseQuery<{ items: QuoteRow[]; count: number }>(key, async () => {
        let query = supabase.from("costing_jobs").select(`*, clients ( name ), stores ( name )`, { count: "exact" })
            .eq("is_template", false).in("status", ["quote", "quoted", "approved"])
        if (clientId) query = query.eq("client_id", clientId)
        if (search.trim()) {
            const term = search.trim().replace(/[,()*%]/g, "")
            query = query.or(`title.ilike.%${term}%,reference.ilike.%${term}%,xero_quote_number.ilike.%${term}%`)
        }
        query = query.order("created_at", { ascending: false })
        const from = (page - 1) * PAGE_SIZE
        query = query.range(from, from + PAGE_SIZE - 1)
        const { data, error, count } = await query
        if (error) throw error
        return { data: { items: (data as QuoteRow[]) || [], count: count ?? 0 }, error: null }
    })
    const quotes = result?.items || []
    const totalCount = result?.count ?? 0
    return <DashboardLayout><PageShell>
        <PageHeader icon={Calculator} kicker="Job & Project Management" title="Quotes" description="Build and cost quotes in RPM, then send and track them through Xero." actions={<div className="flex items-center gap-2"><XeroConnect /><Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}><DialogTrigger asChild><Button size="sm" className="gap-1.5 h-9"><Plus className="size-3.5" /> New quote</Button></DialogTrigger><DialogContent className="sm:max-w-[600px]"><DialogHeader><DialogTitle>New quote</DialogTitle><DialogDescription>Start a quote. Client and site are optional for ad-hoc / wholesale work.</DialogDescription></DialogHeader><CostingJobForm onSuccess={(id) => { setIsDialogOpen(false); mutate(); if (id) router.push(`/quoting/${id}`) }} onCancel={() => setIsDialogOpen(false)} /></DialogContent></Dialog></div>} />
        <div className="flex items-center gap-2 mb-4"><div className="relative flex-1 max-w-md"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder="Search quote, reference or Xero quote #…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-8 h-9" /></div><span className="text-xs text-muted-foreground ml-auto">{totalCount} {totalCount === 1 ? "quote" : "quotes"}</span></div>
        {isLoading ? <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />)}</div> : quotes.length ? <><div className="border border-border/60 rounded-lg overflow-hidden"><table className="w-full text-sm"><thead className="bg-muted/40 text-muted-foreground"><tr className="text-left"><th className="font-medium px-4 py-2.5">Quote</th><th className="font-medium px-4 py-2.5">Client / Site</th><th className="font-medium px-4 py-2.5 w-28">Xero #</th><th className="font-medium px-4 py-2.5 w-32">Status</th></tr></thead><tbody>{quotes.map(q => { const meta = STATUS[q.status as keyof typeof STATUS] || STATUS.quote; return <tr key={q.id} onClick={() => router.push(`/quoting/${q.id}`)} className="border-t border-border/60 cursor-pointer hover:bg-muted/30"><td className="px-4 py-3"><div className="font-medium">{q.title}</div>{q.reference && <div className="text-xs text-muted-foreground">{q.reference}</div>}</td><td className="px-4 py-3 text-muted-foreground">{q.clients?.name || "Ad-hoc"}{q.stores?.name ? ` · ${q.stores.name}` : ""}</td><td className="px-4 py-3 tabular-nums">{q.xero_quote_number || "—"}</td><td className="px-4 py-3"><Badge variant="secondary" className={meta.className}>{meta.label}</Badge></td></tr> })}</tbody></table></div><TablePagination page={page} pageCount={Math.ceil(totalCount / PAGE_SIZE)} onPageChange={setPage} totalItems={totalCount} pageSize={PAGE_SIZE} /></> : <div className="py-16 text-center border border-dashed border-border/60 rounded-lg text-sm text-muted-foreground">No quotes yet.</div>}
    </PageShell></DashboardLayout>
}
