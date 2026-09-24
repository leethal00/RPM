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
import { ArrowUpDown, Briefcase, Download, Plus, RotateCcw, Search } from "lucide-react"
import { TablePagination } from "@/components/table-pagination"
import { useCustomerFilter } from "@/lib/customer-filter"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { useColumnLayout } from "@/lib/costing/use-column-layout"
import { toast } from "sonner"
import { SiteForm } from "@/components/site-form"
import { CostingJobForm } from "@/components/costing-job-form"
import { siteDisplayName } from "@/lib/site-name"
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
type DateFilter = "all" | "overdue" | "today" | "next7" | "none"
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

type ColumnMeta = { key: SortKey; label: string; width: number; min: number }

const JOB_COLUMNS: ColumnMeta[] = [
    { key: "job", label: "Job", width: 300, min: 80 },
    { key: "client", label: "Client / Site", width: 220, min: 70 },
    { key: "job_number", label: "Job #", width: 105, min: 55 },
    { key: "job_lead", label: "People", width: 145, min: 70 },
    { key: "completion_date", label: "Complete by", width: 130, min: 75 },
    { key: "status", label: "Status", width: 110, min: 65 },
]

const JOB_COLUMN_BY_KEY: Record<SortKey, ColumnMeta> = {
    job: JOB_COLUMNS[0],
    client: JOB_COLUMNS[1],
    job_number: JOB_COLUMNS[2],
    job_lead: JOB_COLUMNS[3],
    completion_date: JOB_COLUMNS[4],
    status: JOB_COLUMNS[5],
}

const JOB_COLUMN_LAYOUT = {
    order: JOB_COLUMNS.map((column) => column.key),
    widths: Object.fromEntries(JOB_COLUMNS.map((column) => [column.key, column.width])),
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
const isoDate = (date: Date) => date.toISOString().slice(0, 10)

function JobColumnHeader({
    column,
    width,
    activeSort,
    onSort,
    onMove,
    onResize,
}: {
    column: ColumnMeta
    width: number
    activeSort: SortKey
    onSort: (key: SortKey) => void
    onMove: (from: string, to: string) => void
    onResize: (key: string, width: number) => void
}) {
    function startResize(event: React.PointerEvent) {
        event.preventDefault()
        event.stopPropagation()
        const startX = event.clientX
        const startWidth = width
        const handleMove = (pointer: PointerEvent) => onResize(column.key, Math.max(column.min, startWidth + pointer.clientX - startX))
        const handleUp = () => {
            window.removeEventListener("pointermove", handleMove)
            window.removeEventListener("pointerup", handleUp)
            document.body.style.cursor = ""
        }
        window.addEventListener("pointermove", handleMove)
        window.addEventListener("pointerup", handleUp)
        document.body.style.cursor = "col-resize"
    }

    return (
        <th
            draggable
            onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move"
                event.dataTransfer.setData("text/plain", column.key)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
                event.preventDefault()
                const from = event.dataTransfer.getData("text/plain")
                if (from) onMove(from, column.key)
            }}
            className="relative border-b border-border/60 p-0 select-none"
            title="Drag to reorder column"
        >
            <button type="button" onClick={() => onSort(column.key)} className="flex w-full items-center gap-1 px-2 py-2 text-left text-xs font-medium hover:text-foreground">
                <span className="truncate">{column.label}</span>
                <ArrowUpDown className={`size-3 shrink-0 ${activeSort === column.key ? "text-foreground" : "opacity-40"}`} />
            </button>
            <div onPointerDown={startResize} className="absolute top-0 -right-1.5 z-10 h-full w-3 cursor-col-resize touch-none" title={`Resize ${column.label}`} />
        </th>
    )
}

export default function ActiveJobsPage() {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()
    const { clientId } = useCustomerFilter()
    const [view, setView] = useState<JobView>("active")
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState("")
    const [sortKey, setSortKey] = useState<SortKey>("completion_date")
    const [sortDirection, setSortDirection] = useState<SortDirection>("asc")
    const [clientFilter, setClientFilter] = useState("all")
    const [siteFilter, setSiteFilter] = useState("all")
    const [leadFilter, setLeadFilter] = useState("all")
    const [dateFilter, setDateFilter] = useState<DateFilter>("all")
    const [statusFilter, setStatusFilter] = useState("all")
    const { order, widths, move, setWidth, reset } = useColumnLayout("jobs-columns-v1", JOB_COLUMN_LAYOUT)

    const [importOpen, setImportOpen] = useState(false)
    const [newJobOpen, setNewJobOpen] = useState(false)
    const [creatingSite, setCreatingSite] = useState(false)
    const [invoiceSearch, setInvoiceSearch] = useState("")
    const [preview, setPreview] = useState<ImportPreview | null>(null)
    const [importError, setImportError] = useState<string | null>(null)
    const [lookingUp, setLookingUp] = useState(false)
    const [importing, setImporting] = useState(false)
    const [clients, setClients] = useState<Pick<Client, "id" | "name">[]>([])
    const [stores, setStores] = useState<Pick<Store, "id" | "name" | "client_id" | "address">[]>([])
    const [selectedClient, setSelectedClient] = useState("auto")
    const [selectedStore, setSelectedStore] = useState("none")
    const [importTitle, setImportTitle] = useState("")
    const [completionDate, setCompletionDate] = useState("")

    const statuses = view === "active" ? ["in_progress"] : ["complete", "invoiced", "cancelled"]
    const key = `costing-jobs-all-${view}-${clientId ?? "all"}`

    const { data: allJobs = [], isLoading, mutate } = useSupabaseQuery<JobRow[]>(key, async () => {
        let query = supabase
            .from("costing_jobs")
            .select(`*, clients ( name ), stores ( name )`)
            .eq("is_template", false)
            .in("status", statuses)
            .order("created_at", { ascending: false })

        if (clientId) query = query.eq("client_id", clientId)

        const { data, error } = await query
        if (error) throw error
        return { data: (data as JobRow[]) || [], error: null }
    })

    const filterClients = useMemo(() => {
        const map = new Map<string, string>()
        for (const job of allJobs) if (job.client_id && job.clients?.name) map.set(job.client_id, job.clients.name)
        return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
    }, [allJobs])

    const filterStores = useMemo(() => {
        const map = new Map<string, { id: string; name: string; client_id: string | null }>()
        for (const job of allJobs) {
            if (job.store_id && job.stores?.name && (clientFilter === "all" || job.client_id === clientFilter)) {
                map.set(job.store_id, { id: job.store_id, name: job.stores.name, client_id: job.client_id })
            }
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
    }, [allJobs, clientFilter])

    const filterLeads = useMemo(() => {
        return Array.from(new Set(allJobs.map((job) => job.job_lead_name?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b))
    }, [allJobs])

    const filteredJobs = useMemo(() => {
        const today = isoDate(new Date())
        const week = new Date()
        week.setDate(week.getDate() + 7)
        const next7 = isoDate(week)
        const term = search.trim().toLowerCase()

        return allJobs.filter((job) => {
            if (clientFilter !== "all" && job.client_id !== clientFilter) return false
            if (siteFilter !== "all" && job.store_id !== siteFilter) return false
            if (leadFilter !== "all" && job.job_lead_name !== leadFilter) return false
            if (statusFilter !== "all" && job.status !== statusFilter) return false
            if (dateFilter === "overdue" && (!job.completion_date || job.completion_date >= today)) return false
            if (dateFilter === "today" && job.completion_date !== today) return false
            if (dateFilter === "next7" && (!job.completion_date || job.completion_date < today || job.completion_date > next7)) return false
            if (dateFilter === "none" && job.completion_date) return false
            if (term) {
                const haystack = [
                    job.title,
                    job.production_title,
                    job.reference,
                    job.job_number,
                    job.xero_invoice_number,
                    job.job_lead_name,
                    job.quoted_by_name,
                    job.clients?.name,
                    job.stores?.name,
                ].filter(Boolean).join(" ").toLowerCase()
                if (!haystack.includes(term)) return false
            }
            return true
        })
    }, [allJobs, clientFilter, siteFilter, leadFilter, statusFilter, dateFilter, search])

    const sortedJobs = useMemo(() => {
        const rows = [...filteredJobs]
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
    }, [filteredJobs, sortKey, sortDirection])

    const totalCount = sortedJobs.length
    const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
    const jobs = sortedJobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    const clientStores = selectedClient === "none" ? [] : stores.filter((store) => store.client_id === selectedClient)
    const selectedClientName = clients.find((client) => client.id === selectedClient)?.name || ""
    const siteLabels = clientStores.map((store) => ({ store, label: siteDisplayName(store.name, selectedClientName) }))
    const siteLabelCounts = new Map<string, number>()
    for (const { label } of siteLabels) siteLabelCounts.set(label, (siteLabelCounts.get(label) || 0) + 1)
    const totalColumnWeight = order.reduce((sum, key) => sum + (widths[key] || JOB_COLUMN_BY_KEY[key as SortKey].width), 0) || 1

    function changeView(next: JobView) {
        setView(next)
        setPage(1)
        setSortKey(next === "active" ? "completion_date" : "job")
        setSortDirection("asc")
        setClientFilter("all")
        setSiteFilter("all")
        setLeadFilter("all")
        setDateFilter("all")
        setStatusFilter("all")
    }

    function toggleSort(field: SortKey) {
        if (sortKey === field) setSortDirection((direction) => direction === "asc" ? "desc" : "asc")
        else {
            setSortKey(field)
            setSortDirection("asc")
        }
    }

    function resetFilters() {
        setSearch("")
        setClientFilter("all")
        setSiteFilter("all")
        setLeadFilter("all")
        setDateFilter("all")
        setStatusFilter("all")
        setPage(1)
    }

    function renderCell(key: SortKey, job: JobRow) {
        if (key === "job") return <><div className="font-medium truncate">{job.production_title || job.title}</div>{job.reference && <div className="text-xs text-muted-foreground truncate">{job.reference}</div>}</>
        if (key === "client") return <span className="block truncate text-muted-foreground">{job.clients?.name || "Ad-hoc"} · {job.stores?.name || "Manufacture only / No site"}</span>
        if (key === "job_number") return <span className="tabular-nums truncate block">{job.job_number || job.xero_invoice_number || "—"}</span>
        if (key === "job_lead") return <div className="text-xs"><div className="font-medium truncate">{job.job_lead_name || "Unassigned"}</div><div className="text-muted-foreground truncate">Quoted: {job.quoted_by_name || "—"}</div></div>
        if (key === "completion_date") return <span className="tabular-nums whitespace-nowrap">{formatDate(job.completion_date)}</span>
        const meta = STATUS[job.status as keyof typeof STATUS] || STATUS.in_progress
        return <Badge variant="secondary" className={`${meta.className} whitespace-nowrap`}>{meta.label}</Badge>
    }

    async function openImport() {
        setImportOpen(true)
        setCreatingSite(false)
        setPreview(null)
        setImportError(null)
        setSelectedClient("auto")
        setSelectedStore("none")
        if (!clients.length || !stores.length) {
            const [{ data: clientRows }, { data: storeRows }] = await Promise.all([
                supabase.from("clients").select("id,name").order("name"),
                supabase.from("stores").select("id,name,client_id,address").order("name"),
            ])
            setClients((clientRows || []) as Pick<Client, "id" | "name">[])
            setStores((storeRows || []) as Pick<Store, "id" | "name" | "client_id" | "address">[])
        }
    }

    async function siteCreated(siteId?: string) {
        const { data, error } = await supabase.from("stores").select("id,name,client_id,address").eq("client_id", selectedClient).order("name")
        if (error) {
            setImportError(`Site saved, but the site list could not refresh: ${error.message}`)
            setCreatingSite(false)
            return
        }
        setStores((current) => [...current.filter((store) => store.client_id !== selectedClient), ...((data || []) as Pick<Store, "id" | "name" | "client_id" | "address">[])])
        if (siteId) setSelectedStore(siteId)
        setCreatingSite(false)
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
                if (body?.existingJobId) setImportError(`${body.error} Open the existing RPM job instead.`)
                else setImportError(body?.error || "Could not find that Xero invoice.")
                return
            }
            const invoice = body.invoice as ImportPreview
            setPreview(invoice)
            setImportTitle(invoice.reference || invoice.invoiceNumber)
            const matches = clients.filter((client) => client.name.trim().toLocaleLowerCase() === invoice.contactName.trim().toLocaleLowerCase())
            setSelectedClient(matches.length === 1 ? matches[0].id : "auto")
            setSelectedStore("none")
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
                    invoiceId: preview.invoiceId,
                    clientId: selectedClient === "auto" ? null : selectedClient,
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
            <PageShell width="full" className="px-4 xl:px-6 gap-2 py-4">
                <PageHeader icon={Briefcase} kicker="Job & Project Management" title="Jobs" description="Manage live production work and keep completed jobs available as history." />

                <Tabs value={view} onValueChange={(value) => changeView(value as JobView)}>
                    <TabsList>
                        <TabsTrigger value="active">Active Jobs</TabsTrigger>
                        <TabsTrigger value="completed">Completed Jobs</TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[260px] flex-1 max-w-md">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input placeholder={view === "active" ? "Search active jobs…" : "Search completed jobs…"} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} className="pl-8 h-8" />
                    </div>
                    <select value={clientFilter} onChange={(event) => { setClientFilter(event.target.value); setSiteFilter("all"); setPage(1) }} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                        <option value="all">All customers</option>
                        {filterClients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                    </select>
                    <select value={siteFilter} onChange={(event) => { setSiteFilter(event.target.value); setPage(1) }} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                        <option value="all">All sites</option>
                        {filterStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                    </select>
                    <select value={leadFilter} onChange={(event) => { setLeadFilter(event.target.value); setPage(1) }} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                        <option value="all">All job leads</option>
                        {filterLeads.map((lead) => <option key={lead} value={lead}>{lead}</option>)}
                    </select>
                    <select value={dateFilter} onChange={(event) => { setDateFilter(event.target.value as DateFilter); setPage(1) }} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                        <option value="all">All complete-by dates</option>
                        <option value="overdue">Overdue</option>
                        <option value="today">Due today</option>
                        <option value="next7">Next 7 days</option>
                        <option value="none">No date</option>
                    </select>
                    {view === "completed" && (
                        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                            <option value="all">All statuses</option>
                            <option value="complete">Complete</option>
                            <option value="invoiced">Invoiced</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    )}
                    <Button size="sm" className="h-8 gap-1.5" onClick={() => setNewJobOpen(true)}><Plus className="size-3.5"/> New job</Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={openImport}><Download className="size-3.5"/> Import from Xero</Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-muted-foreground" onClick={resetFilters}>Clear filters</Button>
                    <span className="text-xs text-muted-foreground ml-auto">{totalCount} {totalCount === 1 ? "job" : "jobs"}</span>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs text-muted-foreground" onClick={reset} title="Reset column order and widths"><RotateCcw className="size-3.5" /> Reset columns</Button>
                </div>

                {isLoading ? (
                    <div className="space-y-1">{[1,2,3,4].map((i) => <div key={i} className="h-10 rounded-lg bg-muted/40 animate-pulse" />)}</div>
                ) : jobs.length ? (
                    <>
                        <div className="border border-border/60 rounded-lg overflow-hidden">
                            <table className="w-full table-fixed text-sm">
                                <colgroup>
                                    {order.map((key) => {
                                        const weight = widths[key] || JOB_COLUMN_BY_KEY[key as SortKey].width
                                        return <col key={key} style={{ width: `${(weight / totalColumnWeight) * 100}%` }} />
                                    })}
                                </colgroup>
                                <thead className="bg-muted/40 text-muted-foreground">
                                    <tr className="text-left">
                                        {order.map((key) => (
                                            <JobColumnHeader
                                                key={key}
                                                column={JOB_COLUMN_BY_KEY[key as SortKey]}
                                                width={widths[key] || JOB_COLUMN_BY_KEY[key as SortKey].width}
                                                activeSort={sortKey}
                                                onSort={toggleSort}
                                                onMove={move}
                                                onResize={setWidth}
                                            />
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {jobs.map((job) => (
                                        <tr key={job.id} onClick={() => router.push(`/quoting/jobs/${job.id}`)} className="border-t border-border/60 cursor-pointer hover:bg-muted/30">
                                            {order.map((key) => <td key={key} className="px-2 py-1.5 overflow-hidden align-middle">{renderCell(key as SortKey, job)}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <TablePagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={totalCount} pageSize={PAGE_SIZE} />
                    </>
                ) : (
                    <div className="py-12 text-center border border-dashed border-border/60 rounded-lg text-sm text-muted-foreground">
                        {view === "active" ? "No active jobs match the selected filters." : "No completed jobs match the selected filters."}
                    </div>
                )}

                <Dialog open={newJobOpen} onOpenChange={setNewJobOpen}>
                    <DialogContent className="sm:max-w-[600px]">
                        <DialogHeader>
                            <DialogTitle>New job</DialogTitle>
                            <DialogDescription>Create the job in RPM. You can then create its draft Xero invoice and receive an INV number from the job page.</DialogDescription>
                        </DialogHeader>
                        <CostingJobForm createAsJob onSuccess={(jobId) => { setNewJobOpen(false); mutate(); if (jobId) router.push(`/quoting/jobs/${jobId}`) }} onCancel={() => setNewJobOpen(false)} />
                    </DialogContent>
                </Dialog>

                <Dialog open={importOpen} onOpenChange={setImportOpen}>
                    <DialogContent className="sm:max-w-[680px]">
                        <DialogHeader>
                            <DialogTitle>{creatingSite ? "Create new site" : "Import a Xero invoice as a job"}</DialogTitle>
                            {!creatingSite && <DialogDescription>Use this when the invoice already exists in Xero. Start new work with New job instead.</DialogDescription>}
                        </DialogHeader>

                        {creatingSite ? (
                            <SiteForm
                                key={selectedClient}
                                initialClientId={selectedClient}
                                initialClientName={selectedClientName}
                                lockClient
                                onSuccess={(siteId) => { void siteCreated(siteId) }}
                                onCancel={() => setCreatingSite(false)}
                            />
                        ) : <>
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
                                    <div className="pt-2 border-t text-xs text-muted-foreground">{preview.lines.length} {preview.lines.length === 1 ? "line item" : "line items"} will be imported for BOMs. Xero does not contain RPM cost/BOM data, so imported item cost starts at $0 until you add it.</div>
                                    <div className="max-h-36 overflow-y-auto divide-y text-xs">
                                        {preview.lines.map((line) => <div key={line.index} className="flex justify-between gap-3 py-1.5"><span className="min-w-0 truncate">{line.description || line.itemCode || `Line ${line.index + 1}`}</span><span className="shrink-0 tabular-nums">{line.quantity} × {nz(line.unitAmount)} · {nz(line.lineAmount)}</span></div>)}
                                    </div>
                                    {(preview.status === "AUTHORISED" || preview.status === "PAID") && <div className="rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-foreground">Approved invoice: RPM will preserve these sales values. You can build BOMs under the lines; BOM changes will not update Xero.</div>}
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2 sm:col-span-2">
                                        <Label>RPM job title</Label>
                                        <Input value={importTitle} onChange={(event) => setImportTitle(event.target.value)} />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Customer</Label>
                                        <select value={selectedClient} onChange={(event) => { setSelectedClient(event.target.value); setSelectedStore("none") }} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                                            <option value="auto">{preview.contactName ? `Use Xero customer: ${preview.contactName}` : "Use Xero customer"}</option>
                                            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="grid gap-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <Label htmlFor="import-site">Site</Label>
                                            <Button type="button" variant="link" size="sm" className="h-auto px-0" disabled={selectedClient === "auto"} onClick={() => setCreatingSite(true)}>+ Create new site</Button>
                                        </div>
                                        <select id="import-site" value={selectedStore} onChange={(event) => setSelectedStore(event.target.value)} disabled={selectedClient === "auto"} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50">
                                            <option value="none">Manufacture only / No site</option>
                                            {siteLabels.map(({ store, label }) => <option key={store.id} value={store.id}>{(siteLabelCounts.get(label) || 0) > 1 ? `${label} · ${store.address || store.name}` : label}</option>)}
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
                        </>}
                    </DialogContent>
                </Dialog>
            </PageShell>
        </DashboardLayout>
    )
}

