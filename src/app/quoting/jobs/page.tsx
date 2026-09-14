"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowUpDown, Briefcase, Download, Search } from "lucide-react"
import { TablePagination } from "@/components/table-pagination"
import { useCustomerFilter } from "@/lib/customer-filter"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { toast } from "sonner"
import type { Client, CostingJob, Store } from "@/types/database"

const PAGE_SIZE = 20

type JobRow = CostingJob & {
    clients?: { name: string } | null
    stores?: { name: string } | null
    production_title?: string | null
}

type SortKey = "job" | "client" | "job_number" | "job_lead" | "completion_date" | "status"
type SortDirection = "asc" | "desc"
type JobView = "active" | "completed"
type ImportPreview = {
    invoiceId: string | null
    invoiceNumber: string
    reference: string
    contactName: string
    date: string | null
    dueDate: string | null
    status: string
    total: number
    lines: Array<{ index: number; itemCode: string; description: string; quantity: number; unitAmount: number; lineAmount: number }>
}

const STATUS = {
    in_progress: { label: "In progress", className: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
    complete: { label: "Complete", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
    invoiced: { label: "Invoiced", className: "bg-green-600/15 text-green-700 dark:text-green-300" },
    cancelled: { label: "Cancelled", className: "bg-red-500/15 text-red-600 dark:text-red-300" },
} as const

function formatDate(value?: string | null) {
    if (!value) return "—"
    return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })
}

const nz = (value: number) => value.toLocaleString("en-NZ", { style: "currency", currency: "NZD" })

export default function ActiveJobsPage() {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()
    const { clientId } = useCustomerFilter()
    const [view, setView] = useState<JobView>("active")
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState("")
    const [sortKey, setSortKey] = useState<SortKey>("completion_date")
    const [sortDirection, setSortDirection] = useState<SortDirection>("asc")

    const [importOpen, setImportOpen] = useState(false)
    const [invoiceSearch, setInvoiceSearch] = useState("")
    const [preview, setPreview] = useState<ImportPreview | null>(null)
    const [importError, setImportError] = useState<string | null>(null)
    const [lookingUp, setLookingUp] = useState(false)
    const [importing, setImporting] = useState(false)
    const [clients, setClients] = useState<Pick<Client, "id" | "name">[]>([])
    const [stores, setStores] = useState<Pick<Store, "id" | "name" | "client_id">[]>([])
    const [selectedClient, setSelectedClient] = useState("none")
    const [selectedStore, setSelectedStore] = useState("none")
    const [importTitle, setImportTitle] = useState("")
    const [completionDate, setCompletionDate] = useState("")

    const statuses = view === "active" ? ["in_progress"] : ["complete", "invoiced", "cancelled"]
    const key = `costing-jobs-${view}-${page}-${clientId ?? "all"}-${search}`

    const { data: result, isLoading, mutate } = useSupabaseQuery<{ items: JobRow[]; count: number }>(key, async () => {
        let query = supabase
            .from("costing_jobs")
            .select(`*, clients ( name ), stores ( name )`, { count: "exact" })
            .eq("is_template", false)
            .in("status", statuses)

        if (clientId) query = query.eq("client_id", clientId)
        if (search.trim()) {
            const term = search.trim().replace(/[,()*%]/g, "")
            query = query.or(`title.ilike.%${term}%,production_title.ilike.%${term}%,reference.ilike.%${term}%,job_number.ilike.%${term}%,xero_invoice_number.ilike.%${term}%,quoted_by_name.ilike.%${term}%,job_lead_name.ilike.%${term}%`)
        }

        query = query.order("created_at", { ascending: false })
        const from = (page - 1) * PAGE_SIZE
        query = query.range(from, from + PAGE_SIZE - 1)
        const { data, error, count } = await query
        if (error) throw error
        return { data: { items: (data as JobRow[]) || [], count: count ?? 0 }, error: null }
    })

    const jobs = useMemo(() => {
        const rows = [...(result?.items || [])]
        const direction = sortDirection === "asc" ? 1 : -1
        rows.sort((a, b) => {
            let av = ""
            let bv = ""
            if (sortKey === "job") {
                av = a.production_title || a.title || ""
                bv = b.production_title || b.title || ""
            } else if (sortKey === "client") {
                av = `${a.clients?.name || ""} ${a.stores?.name || ""}`
                bv = `${b.clients?.name || ""} ${b.stores?.name || ""}`
            } else if (sortKey === "job_number") {
                av = a.job_number || a.xero_invoice_number || ""
                bv = b.job_number || b.xero_invoice_number || ""
            } else if (sortKey === "job_lead") {
                av = a.job_lead_name || ""
                bv = b.job_lead_name || ""
            } else if (sortKey === "completion_date") {
                av = a.completion_date || "9999-12-31"
                bv = b.completion_date || "9999-12-31"
            } else {
                av = STATUS[a.status as keyof typeof STATUS]?.label || a.status
                bv = STATUS[b.status as keyof typeof STATUS]?.label || b.status
            }
            return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" }) * direction
        })
        return rows
    }, [result?.items, sortKey, sortDirection])

    const totalCount = result?.count ?? 0
    const clientStores = selectedClient === "none" ? [] : stores.filter((store) => store.client_id === selectedClient)

    function changeView(next: JobView) {
        setView(next)
        setPage(1)
        setSortKey(next === "active" ? "completion_date" : "job")
        setSortDirection("asc")
    }

    function toggleSort(field: SortKey) {
        if (sortKey === field) setSortDirection((direction) => direction === "asc" ? "desc" : "asc")
        else {
            setSortKey(field)
            setSortDirection("asc")
        }
    }

    function renderSortHeader(field: SortKey, children: React.ReactNode, className = "") {
        return (
            <th className={`font-medium px-4 py-2.5 ${className}`}>
                <button type="button" onClick={() => toggleSort(field)} className="inline-flex items-center gap-1.5 hover:text-foreground">
                    {children}
                    <ArrowUpDown className={`size-3.5 ${sortKey === field ? "text-foreground" : "opacity-45"}`} />
                </button>
            </th>
        )
    }

    async function openImport() {
        setImportOpen(true)
        setPreview(null)
        setImportError(null)
        if (!clients.length || !stores.length) {
            const [{ data: clientRows }, { data: storeRows }] = await Promise.all([
                supabase.from("clients").select("id,name").order("name"),
                supabase.from("stores").select("id,name,client_id").order("name"),
            ])
            setClients((clientRows || []) as Pick<Client, "id" | "name">[])
            setStores((storeRows || []) as Pick<Store, "id" | "name" | "client_id">[])
        }
    }

    async function lookupInvoice() {
        const invoiceNumber = invoiceSearch.trim()
        if (!invoiceNumber) return
        setLookingUp(true)
        setImportError(null)
        setPreview(null)
        try {
            const response = await fetch(`/api/xero/import-job?invoice=${encodeURIComponent(invoiceNumber)}`, { cache: "no-store" })
            const body = await response.json()
            if (!response.ok) {
                if (body?.existingJobId) {
                    setImportError(`${body.error} Open the existing RPM job instead.`)
                } else {
                    setImportError(body?.error || "Could not find that Xero invoice.")
                }
                return
            }
            const invoice = body.invoice as ImportPreview
            setPreview(invoice)
            setImportTitle(invoice.reference || invoice.invoiceNumber)
        } catch (error) {
            setImportError(error instanceof Error ? error.message : "Could not find that Xero invoice.")
        } finally {
            setLookingUp(false)
        }
    }

    async function importInvoice() {
        if (!preview) return
        setImporting(true)
        setImportError(null)
        try {
            const response = await fetch("/api/xero/import-job", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    invoiceNumber: preview.invoiceNumber,
                    clientId: selectedClient === "none" ? null : selectedClient,
                    storeId: selectedStore === "none" ? null : selectedStore,
                    title: importTitle.trim() || preview.reference || preview.invoiceNumber,
                    completionDate: completionDate || null,
                }),
            })
            const body = await response.json()
            if (!response.ok) throw new Error(body?.error || "Could not import the Xero invoice.")
            toast.success(`${preview.invoiceNumber} imported as an RPM job`)
            setImportOpen(false)
            mutate()
            router.push(`/quoting/jobs/${body.jobId}`)
        } catch (error) {
            setImportError(error instanceof Error ? error.message : "Could not import the Xero invoice.")
        } finally {
            setImporting(false)
        }
    }

    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader icon={Briefcase} kicker="Job & Project Management" title="Jobs" description="Manage live production work and keep completed jobs available as history." />

                <Tabs value={view} onValueChange={(value) => changeView(value as JobView)} className="mb-5">
                    <TabsList>
                        <TabsTrigger value="active">Active Jobs</TabsTrigger>
                        <TabsTrigger value="completed">Completed Jobs</TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="flex items-center gap-2 mb-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input placeholder={view === "active" ? "Search active jobs…" : "Search completed jobs…"} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="pl-8 h-9" />
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={openImport}><Download className="size-3.5"/> Import from Xero</Button>
                    <span className="text-xs text-muted-foreground ml-2">{totalCount} {totalCount === 1 ? "job" : "jobs"}</span>
                </div>

                {isLoading ? (
                    <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />)}</div>
                ) : jobs.length ? (
                    <>
                        <div className="border border-border/60 rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/40 text-muted-foreground">
                                    <tr className="text-left">
                                        {renderSortHeader("job", "Job")}
                                        {renderSortHeader("client", "Client / Site")}
                                        {renderSortHeader("job_number", "Job #", "w-32")}
                                        {renderSortHeader("job_lead", "People", "w-36")}
                                        {renderSortHeader("completion_date", "Complete by", "w-36")}
                                        {renderSortHeader("status", "Status", "w-32")}
                                    </tr>
                                </thead>
                                <tbody>
                                    {jobs.map(job => {
                                        const meta = STATUS[job.status as keyof typeof STATUS] || STATUS.in_progress
                                        return (
                                            <tr key={job.id} onClick={() => router.push(`/quoting/jobs/${job.id}`)} className="border-t border-border/60 cursor-pointer hover:bg-muted/30">
                                                <td className="px-4 py-3"><div className="font-medium">{job.production_title || job.title}</div>{job.reference && <div className="text-xs text-muted-foreground">{job.reference}</div>}</td>
                                                <td className="px-4 py-3 text-muted-foreground">{job.clients?.name || "Ad-hoc"}{job.stores?.name ? ` · ${job.stores.name}` : ""}</td>
                                                <td className="px-4 py-3 tabular-nums">{job.job_number || job.xero_invoice_number || "—"}</td>
                                                <td className="px-4 py-3 text-xs"><div className="font-medium">{job.job_lead_name || "Unassigned"}</div><div className="text-muted-foreground">Quoted: {job.quoted_by_name || "—"}</div></td>
                                                <td className="px-4 py-3 tabular-nums">{formatDate(job.completion_date)}</td>
                                                <td className="px-4 py-3"><Badge variant="secondary" className={meta.className}>{meta.label}</Badge></td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <TablePagination page={page} pageCount={Math.ceil(totalCount / PAGE_SIZE)} onPageChange={setPage} totalItems={totalCount} pageSize={PAGE_SIZE} />
                    </>
                ) : (
                    <div className="py-16 text-center border border-dashed border-border/60 rounded-lg text-sm text-muted-foreground">
                        {view === "active" ? "No active jobs." : "No completed jobs yet."}
                    </div>
                )}

                <Dialog open={importOpen} onOpenChange={setImportOpen}>
                    <DialogContent className="sm:max-w-[680px]">
                        <DialogHeader>
                            <DialogTitle>Import a Xero invoice as a job</DialogTitle>
                            <DialogDescription>Use this only for specific existing jobs that were created in Xero before RPM. Future jobs can continue through the normal RPM quote workflow.</DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <div className="flex gap-2">
                                <Input value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void lookupInvoice() }} placeholder="Invoice number, e.g. INV-7569" />
                                <Button onClick={lookupInvoice} disabled={lookingUp || !invoiceSearch.trim()}>{lookingUp ? "Looking…" : "Find invoice"}</Button>
                            </div>

                            {importError && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{importError}</div>}

                            {preview && <>
                                <div className="rounded-lg border border-border/60 p-4 space-y-2">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="font-semibold">{preview.invoiceNumber}</div>
                                            <div className="text-sm text-muted-foreground">{preview.contactName || "No Xero contact"}</div>
                                            {preview.reference && <div className="text-sm mt-1">Reference: {preview.reference}</div>}
                                        </div>
                                        <div className="text-right">
                                            <Badge variant="secondary">{preview.status || "Xero invoice"}</Badge>
                                            <div className="mt-2 font-semibold tabular-nums">{nz(preview.total)}</div>
                                        </div>
                                    </div>
                                    <div className="pt-2 border-t text-xs text-muted-foreground">{preview.lines.length} {preview.lines.length === 1 ? "line item" : "line items"} will be imported as editable RPM items. Xero does not contain RPM cost/BOM data, so imported item cost starts at $0 until you add it.</div>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2 sm:col-span-2">
                                        <Label>RPM job title</Label>
                                        <Input value={importTitle} onChange={(event) => setImportTitle(event.target.value)} />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Customer</Label>
                                        <select value={selectedClient} onChange={(event) => { setSelectedClient(event.target.value); setSelectedStore("none") }} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                                            <option value="none">Ad-hoc / no customer</option>
                                            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Site</Label>
                                        <select value={selectedStore} onChange={(event) => setSelectedStore(event.target.value)} disabled={selectedClient === "none"} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50">
                                            <option value="none">No site</option>
                                            {clientStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Complete by</Label>
                                        <Input type="date" value={completionDate} onChange={(event) => setCompletionDate(event.target.value)} />
                                    </div>
                                </div>
                            </>}
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
                            <Button onClick={importInvoice} disabled={!preview || importing}>{importing ? "Importing…" : "Import as Job"}</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </PageShell>
        </DashboardLayout>
    )
}
