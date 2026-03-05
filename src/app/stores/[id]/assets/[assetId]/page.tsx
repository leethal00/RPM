"use client"

import { useEffect, useState, use } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Calendar, Settings, FileText, Activity, Trash2, Edit } from "lucide-react"
import Link from "next/link"
import { JobTimeline } from "@/components/job-timeline"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MaintenanceScheduleList } from "@/components/maintenance-schedule-list"
import { AssetForm } from "@/components/asset-form"
import { AssetPhotoGallery } from "@/components/asset-photo-gallery"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

export default function AssetDetailPage({
    params
}: {
    params: Promise<{ id: string, assetId: string }>
}) {
    const { id, assetId } = use(params)
    const router = useRouter()
    const [asset, setAsset] = useState<any>(null)
    const [jobs, setJobs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const supabase = createClient()

    const fetchData = async () => {
        setLoading(true)
        // Fetch Asset
        const { data: assetData } = await supabase
            .from('assets')
            .select(`
          *,
          stores (
            name
          ),
          asset_types (
            label
          )
        `)
            .eq('id', assetId)
            .single()

        // Fetch Jobs for THIS asset
        const { data: jobData } = await supabase
            .from('jobs')
            .select('*')
            .eq('asset_id', assetId)
            .order('created_at', { ascending: false })

        setAsset(assetData)
        setJobs(jobData || [])
        setLoading(false)
    }

    useEffect(() => {
        fetchData()
    }, [assetId, supabase])

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this asset? This will also affect any linked maintenance schedules.")) return

        const { error } = await supabase
            .from('assets')
            .delete()
            .eq('id', assetId)

        if (error) {
            toast.error(error.message)
        } else {
            toast.success("Asset deleted successfully")
            router.push(`/stores/${id}`)
        }
    }

    if (loading) {
        return (
            <DashboardLayout>
                <div className="p-8 animate-pulse space-y-8">
                    <div className="h-8 w-64 bg-muted rounded" />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="h-40 bg-muted rounded col-span-2" />
                        <div className="h-40 bg-muted rounded" />
                    </div>
                </div>
            </DashboardLayout>
        )
    }

    if (!asset) {
        return (
            <DashboardLayout>
                <div className="p-8 text-center mt-20">
                    <h2 className="text-xl font-bold mb-2">Asset not found</h2>
                    <Button asChild variant="link">
                        <Link href={`/stores/${id}`}>Return to Store</Link>
                    </Button>
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 py-6 font-primary">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" asChild className="-ml-2 h-8">
                        <Link href={`/stores/${id}`} className="flex items-center gap-1 text-muted-foreground">
                            <ChevronLeft className="size-4" />
                            Back to {asset.stores?.name}
                        </Link>
                    </Button>
                </div>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div className="flex flex-col gap-2 font-primary">
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold tracking-tight">{asset.name}</h1>
                            <Badge variant="outline" className="uppercase">{asset.asset_types?.label}</Badge>
                        </div>
                        <p className="text-muted-foreground">{asset.stores?.name} • Site Asset</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 gap-1 font-primary">
                                    <Edit className="size-3.5" />
                                    Edit Asset
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Edit Asset Details</DialogTitle>
                                </DialogHeader>
                                <AssetForm
                                    storeId={id}
                                    asset={asset}
                                    onSuccess={() => {
                                        setEditDialogOpen(false)
                                        fetchData()
                                    }}
                                    onCancel={() => setEditDialogOpen(false)}
                                />
                            </DialogContent>
                        </Dialog>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-red-500 hover:text-red-600 hover:bg-red-50 font-primary"
                            onClick={handleDelete}
                        >
                            <Trash2 className="size-3.5" />
                            Delete Asset
                        </Button>
                    </div>
                </div>

                <Tabs defaultValue="specs" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 md:w-[400px]">
                        <TabsTrigger value="specs">Specifications</TabsTrigger>
                        <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
                        <TabsTrigger value="history">History</TabsTrigger>
                    </TabsList>

                    <TabsContent value="specs" className="mt-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Card className="col-span-2">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium italic">Technical Specifications</CardTitle>
                                    <Settings className="size-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 gap-y-4 py-4">
                                        <div className="space-y-1">
                                            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Install Date</p>
                                            <div className="flex items-center gap-2">
                                                <Calendar className="size-4 text-primary" />
                                                <p className="text-sm">{asset.install_date ? new Date(asset.install_date).toLocaleDateString() : "Unknown"}</p>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Service Interval</p>
                                            <div className="flex items-center gap-2">
                                                <Activity className="size-4 text-primary" />
                                                <p className="text-sm">{asset.service_interval_days || 365} Days</p>
                                            </div>
                                        </div>
                                        <div className="space-y-1 col-span-2">
                                            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Technical Notes</p>
                                            <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                                                <FileText className="size-4 text-primary mt-0.5" />
                                                <p className="text-sm italic text-muted-foreground leading-relaxed">
                                                    {asset.notes || "No technical notes available for this asset."}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-sm font-medium italic">Current Status</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col items-center justify-center py-6 gap-4">
                                    <div className={`size-16 rounded-full flex items-center justify-center border-4 ${asset.status === 'active' || !asset.status ? 'border-green-500 bg-green-50' : 'border-amber-500 bg-amber-50'
                                        }`}>
                                        <div className={`size-8 rounded-full ${asset.status === 'active' || !asset.status ? 'bg-green-500' : 'bg-amber-500'
                                            } animate-pulse`} />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-lg font-bold uppercase tracking-tight">
                                            {asset.status || "Operational"}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Last Serviced: {asset.last_service_date ? new Date(asset.last_service_date).toLocaleDateString() : "Never"}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm font-medium italic">Asset Media</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <AssetPhotoGallery assetId={assetId} />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="maintenance" className="mt-6">
                        <MaintenanceScheduleList assetId={assetId} />
                    </TabsContent>

                    <TabsContent value="history" className="mt-6">
                        <div className="mt-4">
                            <h3 className="text-lg font-bold mb-6 italic">Service Log & Asset History</h3>
                            <JobTimeline jobs={jobs} />
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    )
}
