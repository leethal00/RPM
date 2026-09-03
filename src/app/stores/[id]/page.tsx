"use client"

import { useState, useMemo, use } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import dynamic from "next/dynamic"
import { StoreHeader } from "@/components/store-header"
import { AssetTable } from "@/components/asset-table"
import { JobTimeline } from "@/components/job-timeline"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProjectCard } from "@/components/project-card"
import { SitePhotoGallery } from "@/components/site-photo-gallery"
import { SiteConstructionSet } from "@/components/site-construction-set"

// Forms only load when the user actually opens their dialog. Saves ~80KB
// on the initial page bundle (Supabase client + brand picker + geocode UI).
const AssetForm = dynamic(() => import("@/components/asset-form").then(m => m.AssetForm), { ssr: false })
const SiteForm = dynamic(() => import("@/components/site-form").then(m => m.SiteForm), { ssr: false })
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
import type { Store, Asset, AssetType, Job, Project, AssetPhoto } from "@/types/database"

type AssetRow = Asset & {
    asset_types: Pick<AssetType, 'label'> | null
    jobs: Pick<Job, 'status'>[]
    asset_photos: Pick<AssetPhoto, 'id'>[]
}
type ProjectRow = Project & { jobs: Pick<Job, 'id' | 'status' | 'budget_impact'>[] }

export default function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const supabase = useMemo(() => createClient(), [])
    const [assetDialogOpen, setAssetDialogOpen] = useState(false)
    const [editSiteDialogOpen, setEditSiteDialogOpen] = useState(false)

    const { data: storeData, isLoading: storeLoading, mutate: mutateStore } = useSupabaseQuery(
        `store-${id}`,
        () => supabase
            .from('stores')
            .select('*, store_brands(brand_id, client_brands(*))')
            .eq('id', id)
            .single()
    )

    const { data: assets, mutate: mutateAssets } = useSupabaseQuery<AssetRow[]>(
        `store-${id}-assets`,
        () => supabase.from('assets').select(`
            *,
            asset_types ( label ),
            jobs ( status ),
            asset_photos ( id )
        `).eq('store_id', id)
    )

    const { data: jobs, mutate: mutateJobs } = useSupabaseQuery<Job[]>(
        `store-${id}-jobs`,
        () => supabase.from('jobs').select('*').eq('store_id', id).order('created_at', { ascending: false })
    )

    const { data: projects, mutate: mutateProjects } = useSupabaseQuery<ProjectRow[]>(
        `store-${id}-projects`,
        () => supabase.from('projects').select(`
            *,
            jobs ( id, status, budget_impact )
        `).eq('store_id', id).neq('status', 'archived').order('created_at', { ascending: false })
    )

    const store = (storeData as Store | null) ?? null
    const loading = storeLoading

    const fetchData = () => {
        mutateStore()
        mutateAssets()
        mutateJobs()
        mutateProjects()
    }

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

                <StoreHeader store={store} assets={assets ?? null} jobs={jobs ?? null} />

                <Tabs defaultValue="assets" className="w-full">
                    <div className="flex items-center justify-between border-b border-border/60 pb-0">
                        <TabsList className="bg-transparent h-11 w-auto justify-start gap-1 rounded-none border-b border-transparent p-0">
                            <TabsTrigger
                                value="assets"
                                className="relative h-11 rounded-none border-b-2 border-transparent bg-transparent px-3 pb-2.5 pt-2 text-sm font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none after:hidden"
                            >
                                Assets
                            </TabsTrigger>
                            <TabsTrigger
                                value="jobs"
                                className="relative h-11 rounded-none border-b-2 border-transparent bg-transparent px-3 pb-2.5 pt-2 text-sm font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none after:hidden"
                            >
                                History
                            </TabsTrigger>
                            <TabsTrigger
                                value="projects"
                                className="relative h-11 rounded-none border-b-2 border-transparent bg-transparent px-3 pb-2.5 pt-2 text-sm font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none after:hidden gap-1.5"
                            >
                                Strategy
                                {(projects || []).length > 0 && (
                                    <span className="size-1.5 rounded-full bg-primary" />
                                )}
                            </TabsTrigger>
                            <TabsTrigger
                                value="construction"
                                className="relative h-11 rounded-none border-b-2 border-transparent bg-transparent px-3 pb-2.5 pt-2 text-sm font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none after:hidden"
                            >
                                Construction Drawings
                            </TabsTrigger>
                        </TabsList>

                        <div className="flex items-center gap-2 pb-2">
                            <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="gap-1.5">
                                        <PackagePlus className="size-3.5" />
                                        Add asset
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

                            <Dialog open={editSiteDialogOpen} onOpenChange={setEditSiteDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="gap-1.5">
                                        <Plus className="size-3.5" />
                                        Edit site
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[600px]">
                                    <DialogHeader>
                                        <DialogTitle>Edit Site Details</DialogTitle>
                                    </DialogHeader>
                                    <SiteForm
                                        key={store.id}
                                        site={store}
                                        onSuccess={() => {
                                            setEditSiteDialogOpen(false)
                                            fetchData()
                                        }}
                                        onCancel={() => setEditSiteDialogOpen(false)}
                                    />
                                </DialogContent>
                            </Dialog>

                            <Button size="sm" className="gap-1.5" asChild>
                                <Link href={`/stores/${id}/jobs/new`}>
                                    <Plus className="size-3.5" />
                                    New job
                                </Link>
                            </Button>
                        </div>
                    </div>

                    <TabsContent value="assets" className="pt-6">
                        <AssetTable assets={assets || []} storeId={id} />
                    </TabsContent>

                    <TabsContent value="jobs" className="pt-6">
                        <JobTimeline jobs={jobs || []} />
                    </TabsContent>

                    <TabsContent value="projects" className="pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {(projects || []).map((project) => (
                                <ProjectCard
                                    key={project.id}
                                    project={project}
                                    viewMode="grid"
                                />
                            ))}
                            {(projects || []).length === 0 && (
                                <div className="col-span-full py-12 text-center border border-dashed rounded-md border-border/60">
                                    <p className="text-sm text-muted-foreground">No strategic HQ projects linked to this site.</p>
                                </div>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent value="construction" className="pt-6">
                    <SiteConstructionSet storeId={id} />
                    </TabsContent>
                </Tabs>

                <SitePhotoGallery storeId={id} />
            </div>
        </DashboardLayout>
    )
}
