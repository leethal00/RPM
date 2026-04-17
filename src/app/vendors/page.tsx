"use client"

import { useState, useMemo } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import type { Vendor, Job } from "@/types/database"

interface VendorWithMetrics extends Vendor {
    metrics: {
        openJobs: number
        avgResolutionHours: number
    }
}
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    Search,
    Plus,
    Edit2,
    HardHat,
    Briefcase,
    Clock,
    BarChart3
} from "lucide-react"
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
    const [currentPage, setCurrentPage] = useState(1)
    const [search, setSearch] = useState("")
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
    const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)

    const from = (currentPage - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data: vendorData, count: totalCount, isLoading: vendorsLoading, mutate: mutateVendors } = useSupabaseQuery<Vendor[]>(
        ['vendors', 'list', currentPage, search],
        (supabase) => {
            let query = supabase
                .from('vendors')
                .select('*', { count: 'exact' })

            if (search.trim()) {
                query = query.or(`name.ilike.%${search.trim()}%,trade.ilike.%${search.trim()}%`)
            }

            query = query.order('name').range(from, to)

            return query
        }
    )

    const vendorIds = useMemo(() => (vendorData || []).map((v) => v.id), [vendorData])

    const { data: jobData } = useSupabaseQuery<Job[]>(
        vendorIds.length > 0 ? ['vendor-jobs', vendorIds] : null,
        (supabase) =>
            supabase
                .from('jobs')
                .select('vendor_id, status, created_at, resolved_at')
                .in('vendor_id', vendorIds)
    )

    const vendors: VendorWithMetrics[] = useMemo(() => {
        const jobs = jobData || []
        return (vendorData || []).map((vendor) => {
            const vendorJobs = jobs.filter((j: Job) => j.vendor_id === vendor.id)
            const openJobs = vendorJobs.filter((j: Job) => j.status !== 'resolved' && j.status !== 'closed').length

            const resolvedJobs = vendorJobs.filter((j: Job) => j.status === 'resolved' && j.resolved_at && j.created_at)
            let avgResolutionHours = 0

            if (resolvedJobs.length > 0) {
                const totalHours = resolvedJobs.reduce((acc: number, j: Job) => {
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
    }, [vendorData, jobData])

    const loading = vendorsLoading

    const handleSearchChange = (value: string) => {
        setSearch(value)
        setCurrentPage(1)
    }

    const tradeColors: Record<string, string> = {
        HVAC: "bg-blue-100 text-blue-700 border-blue-200",
        Plumbing: "bg-cyan-100 text-cyan-700 border-cyan-200",
        Electrical: "bg-amber-100 text-amber-700 border-amber-200",
        Cleaning: "bg-purple-100 text-purple-700 border-purple-200",
        Refrigeration: "bg-indigo-100 text-indigo-700 border-indigo-200",
        Signage: "bg-rose-100 text-rose-700 border-rose-200",
        "General Maintenance": "bg-slate-100 text-slate-700 border-slate-200",
        "CCTV & Security": "bg-emerald-100 text-emerald-700 border-emerald-200",
        "Fire Safety": "bg-red-100 text-red-700 border-red-200"
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8 py-6 max-w-7xl mx-auto font-primary">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-primary mb-1">
                            <Briefcase className="size-5" />
                            <span className="text-xs font-bold uppercase tracking-widest text-primary">Supply Chain</span>
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight">Vendor Directory</h1>
                        <p className="text-muted-foreground mt-1 text-sm italic">
                            Manage specialized contractors and specialized trade partners.
                        </p>
                    </div>

                    <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
                        setIsAddDialogOpen(open)
                        if (!open) setEditingVendor(null)
                    }}>
                        <DialogTrigger asChild>
                            <Button className="gap-2 shadow-sm">
                                <Plus className="size-4" />
                                Register Vendor
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
                                    mutateVendors()
                                }}
                                onCancel={() => {
                                    setIsAddDialogOpen(false)
                                    setEditingVendor(null)
                                }}
                            />
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        placeholder="Search vendors by name or trade..."
                        className="pl-10 h-12 bg-muted/30 border-none shadow-inner"
                        value={search}
                        onChange={(e) => handleSearchChange(e.target.value)}
                    />
                </div>

                <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                                <TableHead className="font-bold">Vendor / Contractor</TableHead>
                                <TableHead className="font-bold">Primary Trade</TableHead>
                                <TableHead className="font-bold hidden md:table-cell">Performance</TableHead>
                                <TableHead className="font-bold hidden lg:table-cell">Workload</TableHead>
                                <TableHead className="font-bold">Status</TableHead>
                                <TableHead className="w-[100px] text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell colSpan={6} className="h-16 animate-pulse bg-muted/10" />
                                    </TableRow>
                                ))
                            ) : vendors.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-48 text-center">
                                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                            <HardHat className="size-10 opacity-20" />
                                            <p className="italic">No vendors found matching your search.</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                vendors.map((vendor) => (
                                    <TableRow key={vendor.id} className="group hover:bg-muted/5 transition-colors">
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <div className="font-bold text-sm tracking-tight">{vendor.name}</div>
                                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-tighter mt-0.5">
                                                    {vendor.email && <span>{vendor.email}</span>}
                                                    {vendor.email && vendor.phone && <span>&bull;</span>}
                                                    {vendor.phone && <span>{vendor.phone}</span>}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={`text-[10px] font-black tracking-widest uppercase ${tradeColors[vendor.trade] || ""}`}>
                                                {vendor.trade}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell">
                                            <div className="flex items-center gap-2">
                                                <Clock className="size-3.5 text-muted-foreground" />
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold leading-none">
                                                        {vendor.metrics?.avgResolutionHours > 0 ? `${vendor.metrics.avgResolutionHours}h` : "---"}
                                                    </span>
                                                    <span className="text-[9px] uppercase font-medium text-muted-foreground tracking-tighter">Avg Response</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden lg:table-cell">
                                            <div className="flex items-center gap-2">
                                                <BarChart3 className="size-3.5 text-muted-foreground" />
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold leading-none">
                                                        {vendor.metrics?.openJobs || 0}
                                                    </span>
                                                    <span className="text-[9px] uppercase font-medium text-muted-foreground tracking-tighter">Active Jobs</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className={`size-1.5 rounded-full ${vendor.status === 'active' ? 'bg-green-500' : 'bg-slate-300'}`} />
                                                <span className="text-[10px] font-bold uppercase tracking-wider">
                                                    {vendor.status}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="size-8 text-muted-foreground hover:text-primary"
                                                onClick={() => {
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
                </div>

                <TablePagination
                    currentPage={currentPage}
                    totalCount={totalCount || 0}
                    pageSize={PAGE_SIZE}
                    onPageChange={setCurrentPage}
                />
            </div>
        </DashboardLayout>
    )
}
