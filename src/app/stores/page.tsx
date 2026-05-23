"use client"

import { useState, useMemo } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { Input } from "@/components/ui/input"
import {
    Search,
    MapPin,
    ChevronRight,
    Plus,
    Edit2,
    ArrowUpDown,
    SlidersHorizontal,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { Store, Asset, Job, Vendor, ClientBrand } from "@/types/database"
import { BrandChips, brandsFromStore } from "@/components/brand-chip"
import { useCustomerFilter } from "@/lib/customer-filter"
import { CustomerFilterDropdown } from "@/components/customer-filter-dropdown"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { Building2 } from "lucide-react"
import { computeHealthScore } from "@/lib/health-score"
import { formatHoursShort } from "@/lib/hours"

type StoreRow = Store & {
    assets?: Pick<Asset, 'id' | 'next_service_date'>[]
    jobs?: Pick<Job, 'id' | 'vendor_id' | 'status' | 'job_type' | 'severity'>[]
    store_brands?: { brand_id: string; client_brands?: ClientBrand }[]
}
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { SiteForm } from "@/components/site-form"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { TablePagination } from "@/components/table-pagination"

const PAGE_SIZE = 20

export default function StoresListPage() {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState("")
    const [addDialogOpen, setAddDialogOpen] = useState(false)
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [currentSite, setCurrentSite] = useState<Store | null>(null)
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' })
    const [filterOverdue, setFilterOverdue] = useState(false)
    const [filterVendor, setFilterVendor] = useState<string>("all")
    const [filterRegion, setFilterRegion] = useState<string>("all")
    const [filterUnverified, setFilterUnverified] = useState(false)
    const [filterApproximate, setFilterApproximate] = useState(false)

    const { clientId } = useCustomerFilter()

    const storesKey = `stores-${page}-${search}-${filterRegion}-${filterUnverified}-${filterApproximate}-${sortConfig.key}-${sortConfig.direction}-${clientId ?? 'all'}`

    const { data: storesResult, isLoading: loading, mutate: mutateStores } = useSupabaseQuery<{ items: StoreRow[], count: number }>(
        storesKey,
        async () => {
            let query = supabase
                .from('stores')
                .select(`
                    *,
                    assets (
                        id,
                        next_service_date
                    ),
                    jobs (
                        id,
                        vendor_id,
                        status,
                        job_type,
                        severity
                    ),
                    store_brands (
                        brand_id,
                        client_brands ( * )
                    )
                `, { count: "exact" })

            if (search.trim()) {
                const term = `%${search.trim()}%`
                query = query.or(`name.ilike.${term},address.ilike.${term},manager_name.ilike.${term}`)
            }

            if (filterRegion !== "all") {
                query = query.eq("region", filterRegion)
            }

            if (clientId) {
                query = query.eq("client_id", clientId)
            }

            if (filterUnverified) {
                query = query.is("lat", null)
            }

            if (filterApproximate) {
                query = query.eq("location_approximate", true)
            }

            query = query.order(sortConfig.key, { ascending: sortConfig.direction === 'asc' })

            const from = (page - 1) * PAGE_SIZE
            const to = from + PAGE_SIZE - 1
            query = query.range(from, to)

            const { data: storesData, error: storesError, count } = await query

            if (storesError) {
                const fallback = supabase
                    .from('stores')
                    .select('*', { count: "exact" })
                    .order(sortConfig.key, { ascending: sortConfig.direction === 'asc' })
                    .range(from, to)

                const { data: simpleData, count: simpleCount } = await fallback
                return { data: { items: simpleData || [], count: simpleCount ?? 0 }, error: null }
            }

            return { data: { items: storesData || [], count: count ?? 0 }, error: null }
        }
    )

    const stores = storesResult?.items || []
    const totalCount = storesResult?.count ?? 0

    const { data: vendors } = useSupabaseQuery<Pick<Vendor, 'id' | 'name'>[]>(
        'vendors-active',
        () => supabase.from('vendors').select('id, name').eq('status', 'active').order('name')
    )

    const fetchStores = () => mutateStores()

    // Client-side filters that require nested data (overdue, vendor)
    const filteredStores = stores.filter(s => {
        if (filterOverdue) {
            const hasOverdue = s.assets?.some((asset) => {
                if (!asset.next_service_date) return false
                return new Date(asset.next_service_date) < new Date()
            })
            if (!hasOverdue) return false
        }

        if (filterVendor !== "all") {
            const hasVendor = s.jobs?.some((job) =>
                job.vendor_id === filterVendor &&
                job.status !== 'resolved' &&
                job.status !== 'closed'
            )
            if (!hasVendor) return false
        }

        return true
    })

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc'
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc'
        }
        setSortConfig({ key, direction })
        setPage(1)
    }

    // Reset to page 1 when filters change
    const handleSearchChange = (value: string) => {
        setSearch(value)
        setPage(1)
    }

    const handleRegionChange = (value: string) => {
        setFilterRegion(value)
        setPage(1)
    }

    const handleVendorChange = (value: string) => {
        setFilterVendor(value)
        setPage(1)
    }

    const handleOverdueToggle = () => {
        setFilterOverdue(prev => !prev)
        setPage(1)
    }

    const handleUnverifiedToggle = () => {
        setFilterUnverified(prev => !prev)
        setPage(1)
    }

    const handleApproximateToggle = () => {
        setFilterApproximate(prev => !prev)
        setPage(1)
    }

    const handleResetFilters = () => {
        setSearch("")
        setFilterOverdue(false)
        setFilterVendor("all")
        setFilterRegion("all")
        setFilterUnverified(false)
        setFilterApproximate(false)
        setPage(1)
    }

    const pageCount = Math.ceil(totalCount / PAGE_SIZE)

    const openEditDialog = (e: React.MouseEvent, site: Store) => {
        e.preventDefault()
        e.stopPropagation()
        setCurrentSite(site)
        setEditDialogOpen(true)
    }

    const activeFilterCount = (search !== "" ? 1 : 0) + (filterOverdue ? 1 : 0) + (filterVendor !== "all" ? 1 : 0) + (filterRegion !== "all" ? 1 : 0) + (filterUnverified ? 1 : 0) + (filterApproximate ? 1 : 0)

    return (
        <DashboardLayout>
            <PageShell width="full">
                <PageHeader
                    icon={Building2}
                    title="Sites Portfolio"
                    description="Manage all properties, site managers, and operation hours."
                    actions={
                        <>
                            <span className="text-sm text-muted-foreground">
                                <span className="text-foreground font-medium">{totalCount}</span> sites
                            </span>
                            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" className="gap-1.5 h-9">
                                        <Plus className="size-3.5" />
                                        Add site
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[500px]">
                                    <DialogHeader>
                                        <DialogTitle>Add New Site</DialogTitle>
                                    </DialogHeader>
                                    <SiteForm
                                        onSuccess={() => {
                                            setAddDialogOpen(false)
                                            fetchStores()
                                        }}
                                        onCancel={() => setAddDialogOpen(false)}
                                    />
                                </DialogContent>
                            </Dialog>
                        </>
                    }
                />

                <div className="flex flex-col gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Search sites, addresses, managers…"
                            className="pl-10 h-10 bg-card border-border/80 focus-visible:border-ring/50 shadow-none"
                            value={search}
                            onChange={(e) => handleSearchChange(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <CustomerFilterDropdown variant="inline" className="h-9 min-w-[160px]" />
                        <Select value={filterVendor} onValueChange={handleVendorChange}>
                            <SelectTrigger className="h-9 min-w-[160px] gap-2 text-sm font-normal">
                                <SlidersHorizontal className="size-3.5 text-muted-foreground" />
                                <SelectValue placeholder="All contractors" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All contractors</SelectItem>
                                {(vendors || []).map((vendor) => (
                                    <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={filterRegion} onValueChange={handleRegionChange}>
                            <SelectTrigger className="h-9 min-w-[160px] gap-2 text-sm font-normal">
                                <MapPin className="size-3.5 text-muted-foreground" />
                                <SelectValue placeholder="All regions" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All regions</SelectItem>
                                <SelectItem value="Auckland">Auckland</SelectItem>
                                <SelectItem value="Wellington">Wellington</SelectItem>
                                <SelectItem value="Christchurch">Christchurch</SelectItem>
                                <SelectItem value="North Island Regional">North Island Regional</SelectItem>
                                <SelectItem value="South Island Regional">South Island Regional</SelectItem>
                            </SelectContent>
                        </Select>
                        <button
                            type="button"
                            onClick={handleOverdueToggle}
                            className={`h-9 px-3 rounded-md border text-sm transition-colors flex items-center gap-1.5 ${filterOverdue ? 'border-destructive/50 bg-destructive/10 text-destructive' : 'border-border/80 bg-card text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                        >
                            <span className={`size-1.5 rounded-full ${filterOverdue ? 'bg-destructive' : 'bg-muted-foreground/40'}`} />
                            Overdue
                        </button>
                        <button
                            type="button"
                            onClick={handleUnverifiedToggle}
                            className={`h-9 px-3 rounded-md border text-sm transition-colors flex items-center gap-1.5 ${filterUnverified ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border/80 bg-card text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                        >
                            <span className={`size-1.5 rounded-full ${filterUnverified ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                            Unverified
                        </button>
                        <button
                            type="button"
                            onClick={handleApproximateToggle}
                            className={`h-9 px-3 rounded-md border text-sm transition-colors flex items-center gap-1.5 ${filterApproximate ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-border/80 bg-card text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                        >
                            <span className={`size-1.5 rounded-full ${filterApproximate ? 'bg-amber-500' : 'bg-muted-foreground/40'}`} />
                            Approximate
                        </button>
                        {activeFilterCount > 0 && (
                            <button
                                type="button"
                                onClick={handleResetFilters}
                                className="h-9 px-2 text-sm text-muted-foreground hover:text-foreground ml-auto"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-b border-border/60 hover:bg-transparent">
                                <TableHead onClick={() => handleSort('name')} className="cursor-pointer group h-10 text-xs font-medium text-muted-foreground">
                                    <div className="flex items-center gap-1.5">
                                        Site
                                        <ArrowUpDown className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </TableHead>
                                <TableHead className="w-[140px] h-10 text-xs font-medium text-muted-foreground">Brands</TableHead>
                                <TableHead onClick={() => handleSort('address')} className="cursor-pointer group hidden md:table-cell h-10 text-xs font-medium text-muted-foreground">
                                    <div className="flex items-center gap-1.5">
                                        Address
                                        <ArrowUpDown className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </TableHead>
                                <TableHead onClick={() => handleSort('maintenance_score')} className="cursor-pointer group hidden md:table-cell w-[80px] h-10 text-xs font-medium text-muted-foreground">
                                    <div className="flex items-center gap-1.5">
                                        Health
                                        <ArrowUpDown className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </TableHead>
                                <TableHead className="hidden lg:table-cell h-10 text-xs font-medium text-muted-foreground">Type</TableHead>
                                <TableHead className="hidden md:table-cell h-10 text-xs font-medium text-muted-foreground">Region</TableHead>
                                <TableHead className="hidden lg:table-cell h-10 text-xs font-medium text-muted-foreground">Manager</TableHead>
                                <TableHead className="hidden xl:table-cell h-10 text-xs font-medium text-muted-foreground">Hours</TableHead>
                                <TableHead className="w-[80px] text-right h-10"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell colSpan={9} className="h-12 animate-pulse bg-muted/20" />
                                    </TableRow>
                                ))
                            ) : filteredStores.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground italic">
                                        No sites found matching your search.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredStores.map((store) => (
                                    <TableRow
                                        key={store.id}
                                        onClick={() => router.push(`/stores/${store.id}`)}
                                        className="group border-b border-border/40 hover:bg-accent/30 transition-colors last:border-b-0 cursor-pointer"
                                    >
                                        <TableCell className="py-3">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                                                    {store.name}
                                                </span>
                                                {store.has_drive_thru && (
                                                    <span className="text-[11px] text-muted-foreground">Drive-thru</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="w-[140px] py-3">
                                            <BrandChips brands={brandsFromStore(store)} size="md" />
                                        </TableCell>
                                        <TableCell className="text-sm hidden md:table-cell py-3">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="truncate max-w-[240px] text-muted-foreground">{store.address || "\u2014"}</span>
                                                {store.lat && store.lng && (
                                                    store.location_approximate ? (
                                                        <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                                                            <div className="size-1.5 rounded-full bg-amber-500" />
                                                            Approximate
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                                            <div className="size-1.5 rounded-full bg-emerald-500" />
                                                            Verified
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell py-3">
                                            {(() => {
                                                const health = computeHealthScore({ assets: store.assets, jobs: store.jobs })
                                                if (health.label === "unknown") {
                                                    return <span className="text-muted-foreground/60 text-sm">—</span>
                                                }
                                                const dotColor =
                                                    health.label === "healthy" ? "bg-emerald-500" :
                                                        health.label === "attention" ? "bg-amber-500" :
                                                            "bg-destructive"
                                                return (
                                                    <div className="flex items-center gap-1.5 text-sm" title={`Score: ${health.score} — ${health.label}`}>
                                                        <div className={`size-1.5 rounded-full ${dotColor}`} />
                                                        <span className="tabular-nums text-foreground">{health.score}</span>
                                                    </div>
                                                )
                                            })()}
                                        </TableCell>
                                        <TableCell className="hidden lg:table-cell py-3">
                                            <span className="text-sm text-muted-foreground">{store.site_category || store.site_type || "\u2014"}</span>
                                        </TableCell>
                                        <TableCell className="text-sm hidden md:table-cell text-muted-foreground py-3">
                                            {store.region || "\u2014"}
                                        </TableCell>
                                        <TableCell className="text-sm hidden lg:table-cell text-muted-foreground py-3">
                                            {store.manager_name || "\u2014"}
                                        </TableCell>
                                        <TableCell className="text-sm hidden xl:table-cell text-muted-foreground py-3">
                                            <span className="truncate max-w-[200px] inline-block align-middle">
                                                {formatHoursShort(store.hours_of_operation)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right py-3">
                                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-foreground" onClick={(e) => openEditDialog(e, store)}>
                                                    <Edit2 className="size-3.5" />
                                                </Button>
                                                <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-foreground" asChild>
                                                    <Link href={`/stores/${store.id}`}>
                                                        <ChevronRight className="size-4" />
                                                    </Link>
                                                </Button>
                                            </div>
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

                <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle>Edit Site Details</DialogTitle>
                        </DialogHeader>
                        {currentSite && (
                            <SiteForm
                                key={currentSite.id}
                                site={currentSite}
                                onSuccess={() => {
                                    setEditDialogOpen(false)
                                    fetchStores()
                                }}
                                onCancel={() => setEditDialogOpen(false)}
                            />
                        )}
                    </DialogContent>
                </Dialog>
            </PageShell>
        </DashboardLayout>
    )
}
