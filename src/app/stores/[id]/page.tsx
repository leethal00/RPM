"use client"

import { useEffect, useState, use } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { StoreHeader } from "@/components/store-header"
import { AssetTable } from "@/components/asset-table"
import { JobTimeline } from "@/components/job-timeline"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AssetForm } from "@/components/asset-form"
import { SiteForm } from "@/components/site-form"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Plus, PackagePlus } from "lucide-react"
import Link from "next/link"

export default function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const [store, setStore] = useState<any>(null)
    const [assets, setAssets] = useState<any[]>([])
    const [jobs, setJobs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [assetDialogOpen, setAssetDialogOpen] = useState(false)
    const supabase = createClient()

    const fetchData = async () => {
        // Fetch Store
        const { data: storeData } = await supabase
            .from('stores')
            .select('*')
            .eq('id', id)
            .single()

        // Fetch Assets
        const { data: assetData } = await supabase
            .from('assets')
            .select(`
      *,
      asset_types (
        label
      )
    `)
            .eq('store_id', id)

        // Fetch Jobs
        const { data: jobData } = await supabase
            .from('jobs')
            .select('*')
            .eq('store_id', id)
            .order('created_at', { ascending: false })

        setStore(storeData)
        setAssets(assetData || [])
        setJobs(jobData || [])
        setLoading(false)
    }

    useEffect(() => {
        fetchData()
    }, [id, supabase])

    if (loading) {
        return (
            <DashboardLayout>
                <div className="p-8 animate-pulse space-y-8">
                    <div className="h-8 w-64 bg-muted rounded" />
                    <div className="h-32 w-full bg-muted rounded" />
                    <div className="h-64 w-full bg-muted rounded" />
                </div>
            </DashboardLayout>
        )
    }

    if (!store) {
        return (
            <DashboardLayout>
                <div className="p-8 text-center mt-20">
                    <h2 className="text-xl font-bold mb-2">Store not found</h2>
                    <Button asChild variant="link">
                        <Link href="/">Return to Map</Link>
                    </Button>
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 py-6">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" asChild className="-ml-2 h-8">
                        <Link href="/" className="flex items-center gap-1 text-muted-foreground">
                            <ChevronLeft className="size-4" />
                            Back to Fleet
                        </Link>
                    </Button>
                </div>

                <StoreHeader store={store} />

                <Tabs defaultValue="assets" className="w-full">
                    <div className="flex items-center justify-between border-b pb-0">
                        <TabsList className="bg-transparent h-12 w-auto justify-start gap-4 rounded-none border-b border-transparent p-0">
                            <TabsTrigger
                                value="assets"
                                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none"
                            >
                                Assets
                            </TabsTrigger>
                            <TabsTrigger
                                value="jobs"
                                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none"
                            >
                                History
                            </TabsTrigger>
                        </TabsList>

                        <div className="flex items-center gap-2 pb-2">
                            <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8 gap-1">
                                        <PackagePlus className="size-3.5" />
                                        Add Asset
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[500px]">
                                    <DialogHeader>
                                        <DialogTitle>Add New Asset</DialogTitle>
                                    </DialogHeader>
                                    <AssetForm
                                        storeId={id}
                                        onSuccess={() => {
                                            setAssetDialogOpen(false)
                                            fetchData()
                                        }}
                                        onCancel={() => setAssetDialogOpen(false)}
                                    />
                                </DialogContent>
                            </Dialog>

                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8 gap-1">
                                        <Plus className="size-3.5" />
                                        Edit Site
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[600px]">
                                    <DialogHeader>
                                        <DialogTitle>Edit Site Details</DialogTitle>
                                    </DialogHeader>
                                    <SiteForm
                                        site={store}
                                        onSuccess={() => {
                                            fetchData()
                                        }}
                                        onCancel={() => { }}
                                    />
                                </DialogContent>
                            </Dialog>

                            <Button size="sm" className="h-8 gap-1" asChild>
                                <Link href={`/stores/${id}/jobs/new`}>
                                    <Plus className="size-3.5" />
                                    New Job
                                </Link>
                            </Button>
                        </div>
                    </div>

                    <TabsContent value="assets" className="pt-6">
                        <AssetTable assets={assets} storeId={id} />
                    </TabsContent>

                    <TabsContent value="jobs" className="pt-6">
                        <JobTimeline jobs={jobs} />
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    )
}
