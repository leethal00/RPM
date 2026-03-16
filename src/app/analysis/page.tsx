"use client"

import { useEffect, useMemo, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    AreaChart,
    Area,
    Legend
} from "recharts"
import {
    Activity,
    CheckCircle2,
    AlertTriangle,
    Clock,
    BarChart3,
    Wrench,
    MapPin,
    Layers
} from "lucide-react"

const STATUS_COLORS = {
    healthy: '#10b981',
    due: '#f59e0b',
    overdue: '#ef4444',
    faulted: '#8b5cf6'
}

const TYPE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b']

interface AssetWithRelations {
    id: string
    name: string
    status: string
    next_service_date: string | null
    last_service_date: string | null
    install_date: string | null
    asset_type_id: string | null
    store_id: string
    asset_types: { label: string } | null
    stores: { name: string; region: string | null } | null
    jobs: { status: string }[]
}

interface MaintenanceSchedule {
    id: string
    next_due_at: string
    task_name: string
    assets: {
        name: string
        stores: { name: string } | null
    } | null
}

interface AnalyticsData {
    totalAssets: number
    healthyCount: number
    dueCount: number
    overdueCount: number
    faultedCount: number
    healthPieData: { name: string; value: number; color: string }[]
    assetsByType: { name: string; count: number }[]
    assetsByRegion: { name: string; count: number }[]
    maintenanceTimeline: { month: string; completed: number; scheduled: number }[]
    upcomingMaintenance: { name: string; store: string; due: string; daysUntil: number }[]
}

export default function AnalyticsPage() {
    const [data, setData] = useState<AnalyticsData | null>(null)
    const [loading, setLoading] = useState(true)
    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
        async function fetchAnalytics() {
            setLoading(true)
            const now = new Date()

            // Fetch all assets with types, stores, and active jobs
            const { data: assets, error: assetsError } = await supabase
                .from('assets')
                .select(`
                    *,
                    asset_types (label),
                    stores (name, region),
                    jobs (status)
                `)

            if (assetsError) console.error('Error fetching assets:', assetsError)

            // Fetch upcoming maintenance schedules (next 90 days)
            const in90Days = new Date(now)
            in90Days.setDate(in90Days.getDate() + 90)

            const { data: schedules, error: schedulesError } = await supabase
                .from('maintenance_schedules')
                .select(`
                    *,
                    assets (
                        name,
                        stores (name)
                    )
                `)
                .gte('next_due_at', now.toISOString())
                .lte('next_due_at', in90Days.toISOString())
                .order('next_due_at', { ascending: true })

            if (schedulesError) console.error('Error fetching schedules:', schedulesError)

            // Fetch jobs for maintenance activity over time (last 6 months)
            const sixMonthsAgo = new Date(now)
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

            const { data: recentJobs, error: jobsError } = await supabase
                .from('jobs')
                .select('status, created_at, resolved_at, job_type')
                .gte('created_at', sixMonthsAgo.toISOString())

            if (jobsError) console.error('Error fetching jobs:', jobsError)

            if (!assets) {
                setLoading(false)
                return
            }

            const typedAssets = assets as AssetWithRelations[]
            const typedSchedules = (schedules || []) as MaintenanceSchedule[]

            // --- Compute asset health status ---
            let healthyCount = 0
            let dueCount = 0
            let overdueCount = 0
            let faultedCount = 0

            typedAssets.forEach(asset => {
                const hasActiveFault = asset.jobs?.some(
                    (j) => j.status === 'open' || j.status === 'in_progress'
                )

                if (hasActiveFault) {
                    faultedCount++
                } else if (asset.next_service_date) {
                    const nextService = new Date(asset.next_service_date)
                    const daysUntil = Math.ceil((nextService.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                    if (daysUntil < 0) {
                        overdueCount++
                    } else if (daysUntil <= 30) {
                        dueCount++
                    } else {
                        healthyCount++
                    }
                } else {
                    healthyCount++
                }
            })

            const healthPieData = [
                { name: 'Healthy', value: healthyCount, color: STATUS_COLORS.healthy },
                { name: 'Due Soon', value: dueCount, color: STATUS_COLORS.due },
                { name: 'Overdue', value: overdueCount, color: STATUS_COLORS.overdue },
                { name: 'Faulted', value: faultedCount, color: STATUS_COLORS.faulted },
            ].filter(d => d.value > 0)

            // --- Assets by type ---
            const typeMap: Record<string, number> = {}
            typedAssets.forEach(asset => {
                const label = asset.asset_types?.label || 'Untyped'
                typeMap[label] = (typeMap[label] || 0) + 1
            })
            const assetsByType = Object.entries(typeMap)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)

            // --- Assets by region ---
            const regionMap: Record<string, number> = {}
            typedAssets.forEach(asset => {
                const region = asset.stores?.region || 'Unassigned'
                regionMap[region] = (regionMap[region] || 0) + 1
            })
            const assetsByRegion = Object.entries(regionMap)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)

            // --- Maintenance activity over time (last 6 months) ---
            const monthBuckets: Record<string, { completed: number; scheduled: number }> = {}
            for (let i = 5; i >= 0; i--) {
                const d = new Date(now)
                d.setMonth(d.getMonth() - i)
                const key = d.toLocaleDateString('en-NZ', { month: 'short', year: '2-digit' })
                monthBuckets[key] = { completed: 0, scheduled: 0 }
            }

            const monthKeys = Object.keys(monthBuckets)

            ;(recentJobs || []).forEach((job: any) => {
                const created = new Date(job.created_at)
                const key = created.toLocaleDateString('en-NZ', { month: 'short', year: '2-digit' })
                if (monthBuckets[key]) {
                    if (job.job_type === 'maintenance') {
                        if (job.status === 'resolved' || job.status === 'closed') {
                            monthBuckets[key].completed++
                        } else {
                            monthBuckets[key].scheduled++
                        }
                    } else {
                        // faults and project jobs count as scheduled work
                        monthBuckets[key].scheduled++
                    }
                }
            })

            const maintenanceTimeline = monthKeys.map(month => ({
                month,
                completed: monthBuckets[month].completed,
                scheduled: monthBuckets[month].scheduled
            }))

            // --- Upcoming maintenance (next 90 days, top 10) ---
            const upcomingMaintenance = typedSchedules.slice(0, 10).map(s => {
                const dueDate = new Date(s.next_due_at)
                const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                return {
                    name: s.assets?.name || s.task_name,
                    store: s.assets?.stores?.name || 'Unknown',
                    due: dueDate.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }),
                    daysUntil
                }
            })

            setData({
                totalAssets: typedAssets.length,
                healthyCount,
                dueCount,
                overdueCount,
                faultedCount,
                healthPieData,
                assetsByType,
                assetsByRegion,
                maintenanceTimeline,
                upcomingMaintenance
            })
            setLoading(false)
        }

        fetchAnalytics()
    }, [supabase])

    if (loading) {
        return (
            <DashboardLayout>
                <div className="p-8 animate-pulse space-y-8">
                    <div className="h-8 w-64 bg-muted rounded" />
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="h-28 bg-muted rounded-lg" />
                        <div className="h-28 bg-muted rounded-lg" />
                        <div className="h-28 bg-muted rounded-lg" />
                        <div className="h-28 bg-muted rounded-lg" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="h-80 bg-muted rounded-lg" />
                        <div className="h-80 bg-muted rounded-lg" />
                    </div>
                </div>
            </DashboardLayout>
        )
    }

    if (!data) {
        return (
            <DashboardLayout>
                <div className="p-8 text-center text-muted-foreground">
                    Unable to load analytics data.
                </div>
            </DashboardLayout>
        )
    }

    const healthPercent = data.totalAssets > 0
        ? Math.round((data.healthyCount / data.totalAssets) * 100)
        : 0

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8 py-6 max-w-7xl mx-auto font-primary">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Portfolio Analytics</h1>
                    <p className="text-muted-foreground mt-1 text-sm italic">
                        Asset health, maintenance operations, and portfolio distribution.
                    </p>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <Layers className="size-3.5" />
                                Total Assets
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black">{data.totalAssets}</div>
                            <p className="text-[10px] text-muted-foreground mt-1 font-medium">
                                {healthPercent}% HEALTHY
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-green-200 bg-green-50/30 dark:bg-green-950/20 dark:border-green-900">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider text-green-600 dark:text-green-400 flex items-center gap-1.5">
                                <CheckCircle2 className="size-3.5" />
                                Healthy
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black text-green-600 dark:text-green-400">{data.healthyCount}</div>
                            <p className="text-[10px] text-muted-foreground mt-1 font-medium">NO ACTION NEEDED</p>
                        </CardContent>
                    </Card>

                    <Card className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/20 dark:border-amber-900">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                <Clock className="size-3.5" />
                                Due Soon
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black text-amber-600 dark:text-amber-400">{data.dueCount}</div>
                            <p className="text-[10px] text-muted-foreground mt-1 font-medium">WITHIN 30 DAYS</p>
                        </CardContent>
                    </Card>

                    <Card className="border-red-200 bg-red-50/30 dark:bg-red-950/20 dark:border-red-900">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1.5">
                                <AlertTriangle className="size-3.5" />
                                Attention
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black text-red-600 dark:text-red-400">{data.overdueCount + data.faultedCount}</div>
                            <p className="text-[10px] text-muted-foreground mt-1 font-medium">
                                {data.overdueCount} OVERDUE + {data.faultedCount} FAULTED
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Charts Row 1: Health Donut + Asset Distribution by Type */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card className="shadow-sm border-sidebar-border">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold flex items-center gap-2 italic">
                                <Activity className="size-4 text-primary" />
                                Asset Health Overview
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="h-[320px] flex flex-col items-center justify-center">
                            <ResponsiveContainer width="100%" height="75%">
                                <PieChart>
                                    <Pie
                                        data={data.healthPieData}
                                        innerRadius={65}
                                        outerRadius={90}
                                        paddingAngle={3}
                                        dataKey="value"
                                        strokeWidth={2}
                                        stroke="var(--background, #fff)"
                                    >
                                        {data.healthPieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{
                                            borderRadius: '8px',
                                            border: 'none',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                            fontSize: '12px'
                                        }}
                                        formatter={(value) => [`${value} assets`]}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="flex flex-wrap justify-center gap-4 mt-2">
                                {data.healthPieData.map((s) => (
                                    <div key={s.name} className="flex items-center gap-1.5">
                                        <div className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                                        <span className="text-[11px] font-semibold text-muted-foreground">
                                            {s.name} ({s.value})
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-sidebar-border">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold flex items-center gap-2 italic">
                                <BarChart3 className="size-4 text-primary" />
                                Assets by Type
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="h-[320px] pt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.assetsByType} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb" />
                                    <XAxis type="number" fontSize={10} stroke="#94a3b8" allowDecimals={false} />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        width={130}
                                        fontSize={11}
                                        fontWeight={600}
                                        stroke="#64748b"
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            borderRadius: '8px',
                                            border: 'none',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                            fontSize: '12px'
                                        }}
                                        cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                                        formatter={(value) => [`${value} assets`, 'Count']}
                                    />
                                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={22}>
                                        {data.assetsByType.map((_, index) => (
                                            <Cell key={`type-${index}`} fill={TYPE_COLORS[index % TYPE_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>

                {/* Charts Row 2: Maintenance Activity + Assets by Region */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card className="shadow-sm border-sidebar-border">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold flex items-center gap-2 italic">
                                <Wrench className="size-4 text-primary" />
                                Maintenance Activity (6 Months)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="h-[320px] pt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.maintenanceTimeline}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis
                                        dataKey="month"
                                        fontSize={11}
                                        fontWeight={600}
                                        stroke="#64748b"
                                        tickMargin={8}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        fontSize={10}
                                        stroke="#94a3b8"
                                        allowDecimals={false}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            borderRadius: '8px',
                                            border: 'none',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                            fontSize: '12px'
                                        }}
                                    />
                                    <Legend
                                        verticalAlign="top"
                                        height={36}
                                        iconType="circle"
                                        iconSize={8}
                                        formatter={(value) => (
                                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>{value}</span>
                                        )}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="completed"
                                        name="Completed"
                                        stackId="1"
                                        stroke="#10b981"
                                        fill="#10b981"
                                        fillOpacity={0.3}
                                        strokeWidth={2}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="scheduled"
                                        name="Open / In Progress"
                                        stackId="1"
                                        stroke="#3b82f6"
                                        fill="#3b82f6"
                                        fillOpacity={0.2}
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-sidebar-border">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold flex items-center gap-2 italic">
                                <MapPin className="size-4 text-primary" />
                                Assets by Region
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="h-[320px] pt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.assetsByRegion}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis
                                        dataKey="name"
                                        fontSize={11}
                                        fontWeight={600}
                                        stroke="#64748b"
                                        tickMargin={8}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        fontSize={10}
                                        stroke="#94a3b8"
                                        allowDecimals={false}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            borderRadius: '8px',
                                            border: 'none',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                            fontSize: '12px'
                                        }}
                                        cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                                        formatter={(value) => [`${value} assets`, 'Count']}
                                    />
                                    <Bar dataKey="count" fill="#1e293b" radius={[4, 4, 0, 0]} barSize={32} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>

                {/* Upcoming Maintenance Table */}
                {data.upcomingMaintenance.length > 0 && (
                    <Card className="shadow-sm border-sidebar-border">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold flex items-center gap-2 italic">
                                <Clock className="size-4 text-primary" />
                                Upcoming Scheduled Maintenance (Next 90 Days)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="divide-y">
                                {data.upcomingMaintenance.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-semibold text-sm">{item.name}</span>
                                            <span className="text-xs text-muted-foreground">{item.store}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs text-muted-foreground">{item.due}</span>
                                            <Badge
                                                variant={item.daysUntil <= 7 ? "destructive" : item.daysUntil <= 30 ? "secondary" : "outline"}
                                                className="text-[10px] font-bold tabular-nums"
                                            >
                                                {item.daysUntil}d
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </DashboardLayout>
    )
}
