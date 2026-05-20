"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    Calendar,
    AlertCircle,
    ArrowRight,
    Building2,
    Hammer,
    RefreshCw,
    CheckCircle2,
    Clock
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import type { Asset, Store, AssetType, Job, ClientBrand } from "@/types/database"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

type PMAsset = Asset & {
    stores: Pick<Store, 'id' | 'name'> & {
        store_brands?: { brand_id: string; client_brands?: ClientBrand }[]
    }
    asset_types: Pick<AssetType, 'label'> | null
    jobs: Pick<Job, 'status'>[]
}

export default function PMSchedulerPage() {
    const [pmAssets, setPmAssets] = useState<PMAsset[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    async function fetchPMData() {
        setLoading(true)

        // Fetch assets with next service dates
        const { data: assetsData, error } = await supabase
            .from('assets')
            .select(`
                *,
                stores (
                    name,
                    id,
                    store_brands (
                        brand_id,
                        client_brands ( * )
                    )
                ),
                asset_types (
                    label
                ),
                jobs (
                    status
                )
            `)
            .not('next_service_date', 'is', null)
            .order('next_service_date', { ascending: true })

        if (error) {
            toast.error("Failed to fetch PM data")
        } else {
            setPmAssets(assetsData || [])
        }
        setLoading(false)
    }

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchPMData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const getStatusColor = (asset: PMAsset) => {
        const activeFaults = asset.jobs?.filter((j: Pick<Job, 'status'>) => j.status === 'open' || j.status === 'in_progress')
        if (activeFaults && activeFaults.length > 0) return "bg-destructive/10 text-destructive"
        if (!asset.next_service_date) return "bg-muted/40 text-muted-foreground"
        if (new Date(asset.next_service_date) < new Date()) return "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    }

    // Show the first brand at this site (sites typically have one primary brand)
    const getStoreBrand = (store: { store_brands?: { client_brands?: ClientBrand }[] }) => {
        const brands = store.store_brands
            ?.map((sb) => sb.client_brands)
            .filter((b): b is ClientBrand => b != null)
            .sort((a, b) => a.display_order - b.display_order)
        return brands?.[0]?.label ?? ""
    }

    // Helper for 18-month quarter rounding
    const calculateNextService = (fromDate: Date) => {
        const date = new Date(fromDate)
        date.setMonth(date.getMonth() + 18)

        const month = date.getMonth()
        const year = date.getFullYear()

        let targetMonth = 0
        if (month >= 3 && month <= 5) targetMonth = 3
        if (month >= 6 && month <= 8) targetMonth = 6
        if (month >= 9 && month <= 11) targetMonth = 9

        return new Date(year, targetMonth, 1).toISOString().split('T')[0]
    }

    const getQuarterLabel = (dateString: string | null) => {
        if (!dateString) return "TBD"
        const date = new Date(dateString)
        const month = date.getMonth()
        const year = date.getFullYear()
        const quarter = Math.floor(month / 3) + 1
        return `Q${quarter} ${year}`
    }

    const generatePMJob = async (asset: PMAsset) => {
        const { data: userData } = await supabase.auth.getUser()

        const { error: jobError } = await supabase
            .from('jobs')
            .insert({
                store_id: asset.stores.id,
                asset_id: asset.id,
                title: `Preventative Maintenance: ${asset.asset_types?.label}`,
                description: `Routine 18-month maintenance service for ${asset.asset_types?.label}. \nGroup: ${asset.asset_group}\nDetails: ${asset.asset_details || 'N/A'}`,
                job_type: 'maintenance',
                severity: 'low',
                status: 'open',
                reported_by: userData.user?.id
            })

        if (jobError) {
            toast.error("Failed to generate PM job")
            return
        }

        // Update asset with new schedule (18 months from today, rounded to quarter)
        const nextDate = calculateNextService(new Date())

        await supabase
            .from('assets')
            .update({
                last_service_date: new Date().toISOString().split('T')[0],
                next_service_date: nextDate
            })
            .eq('id', asset.id)

        toast.success("PM Job generated and schedule updated (Q-Rounded)")
        fetchPMData()
    }

    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader
                    icon={Hammer}
                    title="PM Scheduler"
                    description={`Proactive maintenance monitoring across ${pmAssets.length} tracked assets.`}
                    actions={
                        <Button onClick={fetchPMData} variant="outline" size="sm" className="gap-1.5">
                            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    }
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                            <CardTitle className="text-xs font-medium text-muted-foreground">Overdue</CardTitle>
                            <AlertCircle className="size-4 text-destructive" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold tabular-nums text-foreground">
                                {pmAssets.filter(a => a.next_service_date && new Date(a.next_service_date) < new Date()).length}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Requiring immediate action</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                            <CardTitle className="text-xs font-medium text-muted-foreground">Due (30 days)</CardTitle>
                            <Clock className="size-4 text-amber-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold tabular-nums text-foreground">
                                {pmAssets.filter(a => {
                                    if (!a.next_service_date) return false;
                                    const next = new Date(a.next_service_date);
                                    const now = new Date();
                                    const thirtyDays = new Date();
                                    thirtyDays.setDate(now.getDate() + 30);
                                    return next >= now && next <= thirtyDays;
                                }).length}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Upcoming maintenance</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                            <CardTitle className="text-xs font-medium text-muted-foreground">Compliant</CardTitle>
                            <CheckCircle2 className="size-4 text-emerald-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold tabular-nums text-foreground">
                                {pmAssets.filter(a => {
                                    if (!a.next_service_date) return true;
                                    const next = new Date(a.next_service_date);
                                    const thirtyDays = new Date();
                                    thirtyDays.setDate(new Date().getDate() + 30);
                                    return next > thirtyDays;
                                }).length}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Scheduled for later</p>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="border-b border-border/60 pb-4">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Calendar className="size-4 text-muted-foreground" />
                            Maintenance pipeline
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-border/40">
                            {pmAssets.map((asset) => (
                                <div key={asset.id} className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-accent/30 transition-colors">
                                    <div className="flex items-start gap-3 min-w-0">
                                        <div className={`size-8 rounded-md flex items-center justify-center shrink-0 ${getStatusColor(asset)}`}>
                                            <Hammer className="size-4" />
                                        </div>
                                        <div className="space-y-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-medium text-foreground">{asset.asset_types?.label}</span>
                                                {asset.asset_group && (
                                                    <span className="text-xs text-muted-foreground">{asset.asset_group}</span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <Building2 className="size-3" />
                                                    {getStoreBrand(asset.stores)}{getStoreBrand(asset.stores) && " · "}{asset.stores.name}
                                                </span>
                                                <span className="text-muted-foreground/40">·</span>
                                                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                                    <Calendar className="size-3" />
                                                    Due {getQuarterLabel(asset.next_service_date)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground gap-1">
                                            <Link href={`/stores/${asset.stores.id}/assets/${asset.id}`}>
                                                Config
                                                <ArrowRight className="size-3" />
                                            </Link>
                                        </Button>
                                        <Button size="sm" onClick={() => generatePMJob(asset)}>
                                            Generate PM ticket
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            {pmAssets.length === 0 && !loading && (
                                <div className="py-16 text-center">
                                    <div className="size-12 bg-muted/40 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <Calendar className="size-5 text-muted-foreground" />
                                    </div>
                                    <p className="font-medium text-foreground">No active PMs</p>
                                    <p className="text-sm text-muted-foreground">Configure assets with PM intervals to track maintenance here.</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </PageShell>
        </DashboardLayout>
    )
}
