"use client"

import { useMemo } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Calendar,
    AlertCircle,
    ArrowRight,
    Building2,
    Hammer,
    RefreshCw
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import type { Asset, Store, AssetType } from "@/types/database"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { Wrench } from "lucide-react"
import { useCustomerFilter } from "@/lib/customer-filter"

interface DueScheduleItem {
    id: string
    asset_id: string
    task_name: string
    next_due_at: string
    frequency_days: number
    assets: {
        name: string
        id: string
        stores: Pick<Store, 'name' | 'id'>
    }
    isAssetLevel?: boolean
}

export default function MaintenanceDashboard() {
    const supabase = useMemo(() => createClient(), [])
    const { clientId } = useCustomerFilter()

    const { data: dueSchedules = [], isLoading: loading, mutate } = useSupabaseQuery<DueScheduleItem[]>(
        `maintenance-due-${clientId ?? 'all'}`,
        async () => {
            const now = new Date()

            // Inner-join assets.stores so we can filter by client_id when the
            // customer filter is active. Both inner joins required for the
            // PostgREST embedded filter to apply.
            let schedulesQ = supabase
                .from('maintenance_schedules')
                .select(`
                    id, next_due_at, task_name, frequency_days, asset_id,
                    assets!inner (
                        name, id,
                        stores!inner ( name, id, client_id )
                    )
                `)
                .lte('next_due_at', now.toISOString())
                .order('next_due_at', { ascending: true })
            if (clientId) schedulesQ = schedulesQ.eq('assets.stores.client_id', clientId)
            const { data: schedulesData, error: e1 } = await schedulesQ

            let assetsQ = supabase
                .from('assets')
                .select(`
                    id, next_service_date,
                    stores!inner ( name, id, client_id ),
                    asset_types ( label )
                `)
                .lte('next_service_date', now.toISOString())
            if (clientId) assetsQ = assetsQ.eq('stores.client_id', clientId)
            const { data: assetsData, error: e2 } = await assetsQ

            if (e1 || e2) return { data: null, error: e1 || e2 }

            const overdueAssets = (assetsData || []).map((asset: Asset & { stores: Pick<Store, 'name' | 'id'>, asset_types: Pick<AssetType, 'label'> | null }) => ({
                id: `asset-pm-${asset.id}`,
                asset_id: asset.id,
                task_name: `Preventative Maintenance: ${asset.asset_types?.label || 'Asset'}`,
                next_due_at: asset.next_service_date as string,
                assets: {
                    name: asset.asset_types?.label || 'Asset',
                    id: asset.id,
                    stores: asset.stores,
                },
                isAssetLevel: true,
                frequency_days: 547,
            } satisfies DueScheduleItem))

            const combined = [...((schedulesData ?? []) as unknown as DueScheduleItem[]), ...overdueAssets].sort((a, b) =>
                new Date(a.next_due_at).getTime() - new Date(b.next_due_at).getTime()
            )
            return { data: combined, error: null }
        }
    )

    const fetchDueSchedules = () => mutate()

    async function createJobFromMaintenance(item: DueScheduleItem) {
        const { error: jobError } = await supabase
            .from('jobs')
            .insert({
                store_id: item.assets.stores.id,
                asset_id: item.asset_id,
                title: `Maintenance: ${item.task_name}`,
                description: `Recurring maintenance task: ${item.task_name}\nPorted from Maintenance Dashboard.`,
                job_type: 'maintenance',
                severity: 'medium',
                status: 'open',
                reported_by: (await supabase.auth.getUser()).data.user?.id
            })

        if (jobError) {
            toast.error("Failed to generate job")
            return
        }

        if (item.isAssetLevel) {
            // Update Asset last_service_date
            const { error } = await supabase
                .from('assets')
                .update({ last_service_date: new Date().toISOString() })
                .eq('id', item.asset_id)

            if (error) toast.error("Job created but failed to update asset date")
        } else {
            // Update the schedule's next_due_at and last_completed_at
            const nextDue = new Date()
            nextDue.setDate(nextDue.getDate() + item.frequency_days)

            const { error } = await supabase
                .from('maintenance_schedules')
                .update({
                    last_completed_at: new Date().toISOString(),
                    next_due_at: nextDue.toISOString()
                })
                .eq('id', item.id)

            if (error) toast.error("Job created but failed to update schedule")
        }

        toast.success("Maintenance Job Created!")
        fetchDueSchedules()
    }


    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader
                    icon={Wrench}
                    title="Maintenance"
                    description="Manage recurring tasks and generate service tickets."
                    actions={
                        <Button onClick={fetchDueSchedules} variant="outline" size="sm" className="gap-1.5">
                            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    }
                />

                <Card>
                    <CardHeader className="border-b border-border/60 pb-4">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <AlertCircle className="size-4 text-amber-500" />
                            Overdue & upcoming maintenance
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-border/40">
                            {dueSchedules.map((item) => {
                                const overdue = new Date(item.next_due_at) < new Date()
                                return (
                                    <div key={item.id} className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-accent/30 transition-colors">
                                        <div className="flex items-start gap-3 min-w-0">
                                            <div className={`size-8 rounded-md flex items-center justify-center shrink-0 ${overdue ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                                                <Hammer className="size-4" />
                                            </div>
                                            <div className="space-y-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-foreground truncate">{item.task_name}</span>
                                                    {overdue && (
                                                        <Badge variant="outline" className="h-5 text-[10px] border-destructive/40 text-destructive">Overdue</Badge>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <Building2 className="size-3" />
                                                        {item.assets.stores.name}
                                                    </span>
                                                    <span className="text-muted-foreground/40">·</span>
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="size-3" />
                                                        Due {new Date(item.next_due_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground gap-1">
                                                <Link href={`/stores/${item.assets.stores.id}/assets/${item.asset_id}`}>
                                                    View asset
                                                    <ArrowRight className="size-3" />
                                                </Link>
                                            </Button>
                                            <Button size="sm" onClick={() => createJobFromMaintenance(item)}>
                                                Generate job
                                            </Button>
                                        </div>
                                    </div>
                                )
                            })}
                            {dueSchedules.length === 0 && !loading && (
                                <div className="py-16 text-center">
                                    <div className="size-12 bg-muted/40 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <Calendar className="size-5 text-muted-foreground" />
                                    </div>
                                    <p className="font-medium text-foreground">All caught up</p>
                                    <p className="text-sm text-muted-foreground">No maintenance tasks are currently due or overdue.</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </PageShell>
        </DashboardLayout>
    )
}
