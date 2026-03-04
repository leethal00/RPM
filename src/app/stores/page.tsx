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
    User
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

export default function StoresListPage() {
    const [stores, setStores] = useState<any[]>([])
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState(true)
    const [addDialogOpen, setAddDialogOpen] = useState(false)
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [currentSite, setCurrentSite] = useState<any>(null)
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' })
    const supabase = createClient()

    const fetchStores = async () => {
        setLoading(true)
        const { data } = await supabase
            .from('stores')
            .select('*')
            .order('name')
        setStores(data || [])
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

    const filteredStores = sortedStores.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.address?.toLowerCase().includes(search.toLowerCase()) ||
        s.manager_name?.toLowerCase().includes(search.toLowerCase())
    )

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
                                            <div className="grid gap-0.5">
                                                <Link href={`/stores/${store.id}`} className="hover:text-primary transition-colors">
                                                    {store.name}
                                                </Link>
                                                <div className="flex items-center gap-1.5">
                                                    {store.has_drive_thru && (
                                                        <Badge variant="outline" className="h-4 text-[8px] bg-amber-50 text-amber-700 border-amber-200">DRIVE THRU</Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm hidden md:table-cell">
                                            <div className="flex items-center gap-1">
                                                <MapPin className="size-3 shrink-0" />
                                                <span className="truncate max-w-[200px]">{store.address || "—"}</span>
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
        </DashboardLayout>
    )
}
