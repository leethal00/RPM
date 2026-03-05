"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
    Search,
    Building2,
    MapPin,
    ChevronRight,
    Plus,
    Edit2,
    ArrowUpDown,
    Clock,
    User,
    Heart,
    SlidersHorizontal,
    AlertTriangle,
    Filter
} from "lucide-react"
import Link from "next/link"
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

export default function StoresListPage() {
    const [stores, setStores] = useState<any[]>([])
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState(true)
    const [addDialogOpen, setAddDialogOpen] = useState(false)
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [currentSite, setCurrentSite] = useState<any>(null)
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' })
    const [filterOverdue, setFilterOverdue] = useState(false)
    const [filterVendor, setFilterVendor] = useState<string>("all")
    const [vendors, setVendors] = useState<any[]>([])
    const supabase = createClient()

    const fetchStores = async () => {
        setLoading(true)

        // 1. Fetch Stores with nested Assets and Jobs for filtering
        const { data: storesData } = await supabase
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
                    status
                )
            `)
            .order('name')

        // 2. Fetch Vendors for filter dropdown
        const { data: vendorsData } = await supabase
            .from('vendors')
            .select('id, name')
            .eq('status', 'active')
            .order('name')

        setStores(storesData || [])
        setVendors(vendorsData || [])
        setLoading(false)
    }

    useEffect(() => {
        fetchStores()
    }, [supabase])

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc'
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc'
        }
        setSortConfig({ key, direction })
    }

    const sortedStores = [...stores].sort((a, b) => {
        const aValue = a[sortConfig.key] || ""
        const bValue = b[sortConfig.key] || ""
        if (sortConfig.direction === 'asc') {
            return aValue > bValue ? 1 : -1
        } else {
            return aValue < bValue ? 1 : -1
        }
    })

    const filteredStores = sortedStores.filter(s => {
        // 1. Text Search
        const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
            s.address?.toLowerCase().includes(search.toLowerCase()) ||
            s.manager_name?.toLowerCase().includes(search.toLowerCase())

        if (!matchesSearch) return false

        // 2. Overdue PM Filter
        if (filterOverdue) {
            const hasOverdue = s.assets?.some((asset: any) => {
                if (!asset.next_service_date) return false
                return new Date(asset.next_service_date) < new Date()
            })
            if (!hasOverdue) return false
        }

        // 3. Vendor Assignment Filter
        if (filterVendor !== "all") {
            const hasVendor = s.jobs?.some((job: any) =>
                job.vendor_id === filterVendor &&
                job.status !== 'resolved' &&
                job.status !== 'cancelled'
            )
            if (!hasVendor) return false
        }

        return true
    })

    const openEditDialog = (e: React.MouseEvent, site: any) => {
        e.preventDefault()
        e.stopPropagation()
        setCurrentSite(site)
        setEditDialogOpen(true)
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8 py-6 max-w-6xl mx-auto font-primary">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Sites Portfolio</h1>
                        <p className="text-muted-foreground mt-1 text-sm italic">
                            Manage all properties, site managers, and operation hours.
                        </p>
                    </div>

                    <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2 shadow-sm">
                                <Plus className="size-4" />
                                Add New Site
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
                </div>
            </div>

            <div className="flex flex-col md:flex-row items-end gap-4 p-4 bg-slate-50 border rounded-xl animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="flex-1 space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5 ml-1">
                        <Filter className="size-3" />
                        Supply Chain Filters
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Select value={filterVendor} onValueChange={setFilterVendor}>
                                <SelectTrigger className="bg-white border-2 h-10 font-bold text-xs">
                                    <div className="flex items-center gap-2">
                                        <SlidersHorizontal className="size-3.5 text-primary" />
                                        <SelectValue placeholder="Filter by Contractor" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="font-bold">All Contractors</SelectItem>
                                    {vendors.map((vendor) => (
                                        <SelectItem key={vendor.id} value={vendor.id}>
                                            {vendor.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Button
                            variant={filterOverdue ? "destructive" : "outline"}
                            className={`h-10 border-2 font-black uppercase text-[10px] tracking-widest gap-2 ${!filterOverdue && 'bg-white hover:bg-slate-50'}`}
                            onClick={() => setFilterOverdue(!filterOverdue)}
                        >
                            <AlertTriangle className={`size-3.5 ${filterOverdue ? 'animate-pulse' : ''}`} />
                            Overdue maintenance
                            {filterOverdue && <Badge variant="secondary" className="bg-white/20 text-white border-none h-4 px-1 ml-0.5">ON</Badge>}
                        </Button>

                        {(search !== "" || filterOverdue || filterVendor !== "all") && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setSearch("")
                                    setFilterOverdue(false)
                                    setFilterVendor("all")
                                }}
                                className="h-10 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary gap-2"
                            >
                                Reset {(search !== "" ? 1 : 0) + (filterOverdue ? 1 : 0) + (filterVendor !== "all" ? 1 : 0)} Filters
                            </Button>
                        )}
                    </div>
                </div>
                <div className="hidden lg:flex flex-col items-end gap-1 px-4 border-l border-slate-200">
                    <span className="text-[24px] font-black text-slate-900 leading-none">{filteredStores.length}</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Site Matches</span>
                </div>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                    placeholder="Search by name, address, or manager..."
                    className="pl-10 h-12 bg-muted/30 border-none shadow-inner"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead onClick={() => handleSort('name')} className="cursor-pointer group">
                                <div className="flex items-center gap-2">
                                    Site Name
                                    <ArrowUpDown className="size-3 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                            </TableHead>
                            <TableHead onClick={() => handleSort('address')} className="cursor-pointer group hidden md:table-cell">
                                <div className="flex items-center gap-2">
                                    Address
                                    <ArrowUpDown className="size-3 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                            </TableHead>
                            <TableHead onClick={() => handleSort('maintenance_score')} className="cursor-pointer group hidden md:table-cell">
                                <div className="flex items-center gap-2">
                                    Health
                                    <ArrowUpDown className="size-3 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                            </TableHead>
                            <TableHead className="hidden lg:table-cell">Classification</TableHead>
                            <TableHead className="hidden lg:table-cell">Site Manager</TableHead>
                            <TableHead className="hidden xl:table-cell">Hours</TableHead>
                            <TableHead className="w-[100px] text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            [...Array(5)].map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell colSpan={6} className="h-12 animate-pulse bg-muted/20" />
                                </TableRow>
                            ))
                        ) : filteredStores.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic">
                                    No sites found matching your search.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredStores.map((store) => (
                                <TableRow key={store.id} className="group hover:bg-muted/5 transition-colors">
                                    <TableCell className="font-semibold">
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex items-center gap-2">
                                                <Link href={`/stores/${store.id}`} className="hover:text-primary transition-colors">
                                                    {store.name}
                                                </Link>
                                                <div className="flex items-center gap-1">
                                                    {store.brand_st_pierres !== false && (
                                                        <div className="h-5 w-5 rounded bg-white p-0.5 border shadow-sm">
                                                            <img src="/brands/st-pierres.png" alt="SP" className="h-full w-full object-contain" title="St Pierre's Sushi" />
                                                        </div>
                                                    )}
                                                    {store.brand_bento_bowl && (
                                                        <div className="h-5 w-5 rounded bg-white p-0.5 border shadow-sm">
                                                            <img src="/brands/bento-bowl.png" alt="BB" className="h-full w-full object-contain" title="Bento Bowl" />
                                                        </div>
                                                    )}
                                                    {store.brand_k10 && (
                                                        <div className="h-5 w-5 rounded bg-white p-0.5 border shadow-sm">
                                                            <img src="/brands/k10.png" alt="K10" className="h-full w-full object-contain" title="K10 Sushi Train" />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {store.has_drive_thru && (
                                                    <Badge variant="outline" className="h-4 text-[8px] bg-amber-50 text-amber-700 border-amber-200">DRIVE THRU</Badge>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm hidden md:table-cell">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1">
                                                <MapPin className="size-3 shrink-0" />
                                                <span className="truncate max-w-[200px]">{store.address || "—"}</span>
                                            </div>
                                            {store.lat && store.lng && (
                                                <div className="flex items-center gap-1 text-[9px] text-green-600 font-bold uppercase tracking-tight">
                                                    <div className="size-1.5 rounded-full bg-green-500" />
                                                    Verified Location
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell">
                                        <div className="flex flex-col gap-1">
                                            <Badge
                                                variant="outline"
                                                className={`
                                                        font-black text-[9px] tracking-widest uppercase gap-1 px-1.5 py-0.5 border-2 w-fit
                                                        ${store.maintenance_score && store.maintenance_score >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                        store.maintenance_score && store.maintenance_score >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                            'bg-red-50 text-red-700 border-red-200'}
                                                    `}
                                            >
                                                <Heart className="size-2.5 fill-current" />
                                                {store.maintenance_score ?? 100}
                                            </Badge>
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell">
                                        <div className="flex flex-wrap gap-1">
                                            {store.site_type && (
                                                <Badge variant="secondary" className="text-[10px] h-5 bg-primary/5 text-primary border-primary/10">
                                                    {store.site_type}
                                                </Badge>
                                            )}
                                            {store.site_category && (
                                                <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">
                                                    {store.site_category}
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-sm hidden lg:table-cell">
                                        {store.manager_name ? (
                                            <div className="flex items-center gap-2 text-muted-foreground">
                                                <User className="size-3" />
                                                {store.manager_name}
                                            </div>
                                        ) : "—"}
                                    </TableCell>
                                    <TableCell className="text-sm hidden xl:table-cell">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Clock className="size-3 shrink-0" />
                                            <span className="truncate max-w-[250px]">
                                                {(() => {
                                                    if (!store.hours_of_operation) return "—"
                                                    try {
                                                        const hours = JSON.parse(store.hours_of_operation)
                                                        if (hours.type === "daily") {
                                                            return `All Days: ${hours.hours.start}—${hours.hours.end}`
                                                        } else {
                                                            return "Custom Weekly Hours"
                                                        }
                                                    } catch {
                                                        return store.hours_of_operation
                                                    }
                                                })()}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-primary" onClick={(e) => openEditDialog(e, store)}>
                                                <Edit2 className="size-3.5" />
                                            </Button>
                                            <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-primary" asChild>
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
            </div>

            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Edit Site Details</DialogTitle>
                    </DialogHeader>
                    {currentSite && (
                        <SiteForm
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
        </div>
    </DashboardLayout >
    )
}
