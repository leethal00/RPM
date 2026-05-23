"use client"

import { useState, useMemo } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { Input } from "@/components/ui/input"
import {
    Search,
    Plus,
    Edit2,
    HardHat,
    Briefcase,
} from "lucide-react"
import type { Vendor, Job } from "@/types/database"
import { useCustomerFilter } from "@/lib/customer-filter"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

type VendorMetrics = { openJobs: number; avgResolutionHours: number }
type VendorWithMetrics = Vendor & { metrics: VendorMetrics }
type JobMetricRow = Pick<Job, 'vendor_id' | 'status' | 'created_at' | 'resolved_at'>
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { VendorForm } from "@/components/vendor-form"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { TablePagination } from "@/components/table-pagination"

const PAGE_SIZE = 20

export default function VendorsPage() {
    const supabase = useMemo(() => createClient(), [])
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState("")
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
    const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
    const { clientId } = useCustomerFilter()

    const vendorsKey = `vendors-${page}-${search}-${clientId ?? 'all'}`

    const { data: vendorsResult, isLoading: loading, mutate: mutateVendors } = useSupabaseQuery<{ items: VendorWithMetrics[], count: number }>(
        vendorsKey,
        async () => {
            let query = supabase
                .from('vendors')
                .select('*', { count: "exact" })

            if (search.trim()) {
                const term = `%${search.trim()}%`
                query = query.or(`name.ilike.${term},trade.ilike.${term}`)
            }

            if (clientId) {
                query = query.eq('client_id', clientId)
            }

            query = query.order('name')

            const from = (page - 1) * PAGE_SIZE
            const to = from + PAGE_SIZE - 1
            query = query.range(from, to)

            const { data: vendorData, error: vendorError, count } = await query

            if (vendorError) throw vendorError

            // Fetch Jobs to calculate metrics for current page vendors
            const vendorList = (vendorData || []) as Vendor[]
            const vendorIds = vendorList.map((v) => v.id)
            let jobData: JobMetricRow[] = []

            if (vendorIds.length > 0) {
                const { data: jobs, error: jobError } = await supabase
                    .from('jobs')
                    .select('vendor_id, status, created_at, resolved_at')
                    .in('vendor_id', vendorIds)

                if (!jobError) {
                    jobData = (jobs || []) as JobMetricRow[]
                }
            }

            const enrichedVendors: VendorWithMetrics[] = vendorList.map((vendor) => {
                const vendorJobs = jobData.filter((j) => j.vendor_id === vendor.id)
                const openJobs = vendorJobs.filter((j) => j.status !== 'resolved' && j.status !== 'closed').length

                const resolvedJobs = vendorJobs.filter((j) => j.status === 'resolved' && j.resolved_at && j.created_at)
                let avgResolutionHours = 0

                if (resolvedJobs.length > 0) {
                    const totalHours = resolvedJobs.reduce((acc, j) => {
                        const start = new Date(j.created_at).getTime()
                        const end = new Date(j.resolved_at!).getTime()
                        return acc + (end - start) / (1000 * 60 * 60)
                    }, 0)
                    avgResolutionHours = Math.round(totalHours / resolvedJobs.length)
                }

                return {
                    ...vendor,
                    metrics: { openJobs, avgResolutionHours }
                }
            })

            return { data: { items: enrichedVendors, count: count ?? 0 }, error: null }
        }
    )

    const vendors = vendorsResult?.items || []
    const totalCount = vendorsResult?.count ?? 0

    const fetchVendors = () => mutateVendors()

    const handleSearchChange = (value: string) => {
        setSearch(value)
        setPage(1)
    }

    const pageCount = Math.ceil(totalCount / PAGE_SIZE)

    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader
                    icon={Briefcase}
                    title="Vendor Directory"
                    description="Manage contractors and trade partners."
                    actions={
                        <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
                            setIsAddDialogOpen(open)
                            if (!open) setEditingVendor(null)
                        }}>
                            <DialogTrigger asChild>
                                <Button size="sm" className="gap-1.5 h-9">
                                    <Plus className="size-3.5" />
                                    Register vendor
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[600px]">
                                <DialogHeader>
                                    <DialogTitle>{editingVendor ? "Edit Vendor Details" : "Register New Vendor"}</DialogTitle>
                                </DialogHeader>
                                <VendorForm
                                    vendor={editingVendor}
                                    onSuccess={() => {
                                        setIsAddDialogOpen(false)
                                        setEditingVendor(null)
                                        fetchVendors()
                                    }}
                                    onCancel={() => {
                                        setIsAddDialogOpen(false)
                                        setEditingVendor(null)
                                    }}
                                />
                            </DialogContent>
                        </Dialog>
                    }
                />

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        placeholder="Search vendors by name or trade…"
                        className="pl-10 h-10 bg-card"
                        value={search}
                        onChange={(e) => handleSearchChange(e.target.value)}
                    />
                </div>

                <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-b border-border/60 hover:bg-transparent">
                                <TableHead className="h-10 text-xs font-medium text-muted-foreground">Vendor</TableHead>
                                <TableHead className="h-10 text-xs font-medium text-muted-foreground">Trade</TableHead>
                                <TableHead className="h-10 text-xs font-medium text-muted-foreground hidden md:table-cell">Avg resolution</TableHead>
                                <TableHead className="h-10 text-xs font-medium text-muted-foreground hidden lg:table-cell">Active jobs</TableHead>
                                <TableHead className="h-10 text-xs font-medium text-muted-foreground">Status</TableHead>
                                <TableHead className="h-10 w-[60px] text-right"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell colSpan={6} className="h-12 animate-pulse bg-muted/20" />
                                    </TableRow>
                                ))
                            ) : vendors.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center">
                                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                            <HardHat className="size-8 opacity-20" />
                                            <p className="text-sm">No vendors found matching your search.</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                vendors.map((vendor) => (
                                    <TableRow
                                        key={vendor.id}
                                        onClick={() => { setEditingVendor(vendor); setIsAddDialogOpen(true) }}
                                        className="group border-b border-border/40 last:border-b-0 hover:bg-accent/30 transition-colors cursor-pointer"
                                    >
                                        <TableCell className="py-3">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="font-medium text-foreground group-hover:text-primary transition-colors">{vendor.name}</div>
                                                {(vendor.email || vendor.phone) && (
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        {vendor.email && <span className="truncate">{vendor.email}</span>}
                                                        {vendor.email && vendor.phone && <span className="text-muted-foreground/40">·</span>}
                                                        {vendor.phone && <span>{vendor.phone}</span>}
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-3 text-sm text-muted-foreground">
                                            {vendor.trade}
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell py-3 text-sm tabular-nums">
                                            {vendor.metrics?.avgResolutionHours > 0
                                                ? <span className="text-foreground">{vendor.metrics.avgResolutionHours}h</span>
                                                : <span className="text-muted-foreground/60">—</span>}
                                        </TableCell>
                                        <TableCell className="hidden lg:table-cell py-3 text-sm tabular-nums">
                                            <span className="text-foreground">{vendor.metrics?.openJobs || 0}</span>
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <div className="flex items-center gap-1.5 text-sm">
                                                <div className={`size-1.5 rounded-full ${vendor.status === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                                                <span className="capitalize text-muted-foreground">{vendor.status}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right py-3">
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="size-8 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setEditingVendor(vendor)
                                                    setIsAddDialogOpen(true)
                                                }}
                                            >
                                                <Edit2 className="size-3.5" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    <TablePagination
                        page={page}
                        pageCount={pageCount}
                        onPageChange={setPage}
                        totalItems={totalCount}
                        pageSize={PAGE_SIZE}
                    />
                </div>
            </PageShell>
        </DashboardLayout>
    )
}
