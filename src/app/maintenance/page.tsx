"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
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

export default function MaintenanceDashboard() {
    const [dueSchedules, setDueSchedules] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        fetchDueSchedules()
    }, [])

    async function fetchDueSchedules() {
        setLoading(true)
        // Fetch all schedules where next_due_at is today or in the past
        // Joined with stores and assets for context
        const { data } = await supabase
            .from('maintenance_schedules')
            .select(`
                *,
                assets (
                    name,
                    id,
                    stores (
                        name,
                        id
                    )
                )
            `)
            .lte('next_due_at', new Date().toISOString())
            .order('next_due_at', { ascending: true })

        setDueSchedules(data || [])
        setLoading(false)
    }

    async function createJobFromMaintenance(schedule: any) {
        const { error } = await supabase
            .from('jobs')
            .insert({
                store_id: schedule.assets.stores.id,
                asset_id: schedule.asset_id,
                title: `Maintenance: ${schedule.task_name}`,
                description: `Recurring maintenance task: ${schedule.task_name}\nPorted from Maintenance Schedule.`,
                job_type: 'maintenance',
                severity: 'medium',
                status: 'open',
                reported_by: (await supabase.auth.getUser()).data.user?.id
            })

        if (error) {
            toast.error("Failed to generate job")
        } else {
            // Update the schedule's next_due_at and last_completed_at
            const nextDue = new Date()
            nextDue.setDate(nextDue.getDate() + schedule.frequency_days)

            await supabase
                .from('maintenance_schedules')
                .update({
                    last_completed_at: new Date().toISOString(),
                    next_due_at: nextDue.toISOString()
                })
                .eq('id', schedule.id)

            toast.success("Maintenance Job Created!")
            fetchDueSchedules()
        }
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8 py-6 max-w-6xl mx-auto font-primary">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Maintenance Dashboard</h1>
                        <p className="text-muted-foreground mt-1 text-sm">
                            Manage recurring tasks and generate service tickets.
                        </p>
                    </div>
                    <Button onClick={fetchDueSchedules} variant="outline" size="sm" className="gap-2">
                        <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh Due Items
                    </Button>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    <Card>
                        <CardHeader className="border-b bg-muted/30">
                            <CardTitle className="text-base flex items-center gap-2">
                                <AlertCircle className="size-5 text-amber-500" />
                                Action Required: Overdue & Upcoming Maintenance
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y">
                                {dueSchedules.map((item) => (
                                    <div key={item.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/10 transition-colors">
                                        <div className="flex items-start gap-4">
                                            <div className={`p-2 rounded-lg mt-1 ${new Date(item.next_due_at) < new Date() ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                                                <Hammer className="size-5" />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold">{item.task_name}</span>
                                                    {new Date(item.next_due_at) < new Date() && (
                                                        <Badge variant="destructive" className="h-5 text-[10px]">OVERDUE</Badge>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground uppercase font-medium tracking-tight">
                                                    <span className="flex items-center gap-1">
                                                        <Building2 className="size-3" />
                                                        {item.assets.stores.name}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="size-3" />
                                                        Due: {new Date(item.next_due_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-primary">
                                                <Link href={`/stores/${item.assets.stores.id}/assets/${item.asset_id}`}>
                                                    View Asset
                                                    <ArrowRight className="size-3 ml-2" />
                                                </Link>
                                            </Button>
                                            <Button size="sm" onClick={() => createJobFromMaintenance(item)} className="bg-primary/95 hover:bg-primary shadow-sm">
                                                Generate Job
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                {dueSchedules.length === 0 && !loading && (
                                    <div className="py-20 text-center space-y-3">
                                        <div className="size-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto">
                                            <Calendar className="size-8 text-muted-foreground" />
                                        </div>
                                        <div className="max-w-xs mx-auto">
                                            <p className="font-bold text-lg">All caught up!</p>
                                            <p className="text-sm text-muted-foreground">No maintenance tasks are currently due or overdue for any asset.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DashboardLayout>
    )
}
