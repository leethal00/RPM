"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
    LineChart,
    Line
} from "recharts"
import {
    LayoutDashboard,
    TrendingUp,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Filter,
    BarChart3,
    Building2
} from "lucide-react"

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981']

export default function AnalyticsPage() {
    const [stats, setStats] = useState<any>({
        totalJobs: 0,
        openJobs: 0,
        resolvedJobs: 0,
        jobsByStore: [],
        jobsByStatus: [],
        jobsOverTime: [],
        jobsByBrand: [],
        projectBudgetStats: [],
        totalBudget: 0
    })
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        async function fetchStats() {
            setLoading(true)

            // 1. Fetch all jobs with store brand info
            const { data: allJobs } = await supabase
                .from('jobs')
                .select(`
                    status, 
                    created_at, 
                    store_id, 
                    project_id,
                    stores(name, brand_st_pierres, brand_bento_bowl, brand_k10)
                `)

            // 2. Fetch all projects
            const { data: allProjects } = await supabase
                .from('projects')
                .select('*')
                .neq('status', 'archived')

            if (!allJobs || !allProjects) return

            // 3. Process Brand Distribution
            const brandStats: any = { 'St Pierre\'s': 0, 'Bento Bowl': 0, 'K10': 0 }
            allJobs.forEach((job: any) => {
                if (job.stores?.brand_st_pierres !== false) brandStats['St Pierre\'s']++
                if (job.stores?.brand_bento_bowl) brandStats['Bento Bowl']++
                if (job.stores?.brand_k10) brandStats['K10']++
            })
            const jobsByBrand = Object.entries(brandStats).map(([name, count]) => ({ name, count }))

            // 4. Process Project Budget Stats
            const projectBudgetStats = allProjects.map((p: any) => {
                const linkedJobs = allJobs.filter((j: any) => j.project_id === p.id)
                const completedJobs = linkedJobs.filter((j: any) => j.status === 'resolved' || j.status === 'closed').length
                const progress = linkedJobs.length > 0 ? (completedJobs / linkedJobs.length) * 100 : 0
                return {
                    name: p.name,
                    budget: p.budget,
                    progress: Math.round(progress),
                    jobCount: linkedJobs.length
                }
            })

            // 5. Process Jobs by Store
            const storeMap: any = {}
            allJobs.forEach((job: any) => {
                const storeName = job.stores?.name || 'Unknown'
                storeMap[storeName] = (storeMap[storeName] || 0) + 1
            })
            const jobsByStore = Object.entries(storeMap).map(([name, count]) => ({ name, count }))

            // 3. Process Jobs by Status
            const statusMap: any = { open: 0, in_progress: 0, resolved: 0, closed: 0 }
            allJobs.forEach((job: any) => {
                statusMap[job.status] = (statusMap[job.status] || 0) + 1
            })
            const jobsByStatus = [
                { name: 'Open', value: statusMap.open, color: '#ef4444' },
                { name: 'In Progress', value: statusMap.in_progress, color: '#3b82f6' },
                { name: 'Resolved', value: statusMap.resolved, color: '#10b981' },
                { name: 'Closed', value: statusMap.closed, color: '#64748b' }
            ].filter(d => d.value > 0)

            // 4. Process Jobs Over Time (Last 7 days)
            const timeMap: any = {}
            const last7Days = [...Array(7)].map((_, i) => {
                const d = new Date()
                d.setDate(d.getDate() - i)
                return d.toISOString().split('T')[0]
            }).reverse()

            last7Days.forEach(date => timeMap[date] = 0)
            allJobs.forEach((job: any) => {
                const date = job.created_at.split('T')[0]
                if (timeMap[date] !== undefined) {
                    timeMap[date]++
                }
            })
            const jobsOverTime = Object.entries(timeMap).map(([date, count]) => ({
                date: new Date(date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }),
                count
            }))

            setStats({
                totalJobs: allJobs.length,
                openJobs: statusMap.open + statusMap.in_progress,
                resolvedJobs: statusMap.resolved + statusMap.closed,
                jobsByStore,
                jobsByStatus,
                jobsOverTime,
                jobsByBrand,
                projectBudgetStats,
                totalBudget: allProjects.reduce((acc: number, p: any) => acc + (p.budget || 0), 0)
            })
            setLoading(false)
        }

        fetchStats()
    }, [supabase])

    if (loading) return <DashboardLayout><div className="p-8 animate-pulse space-y-8"><div className="h-8 w-64 bg-muted rounded" /><div className="grid grid-cols-1 md:grid-cols-4 gap-6"><div className="h-24 bg-muted rounded" /><div className="h-24 bg-muted rounded" /><div className="h-24 bg-muted rounded" /><div className="h-24 bg-muted rounded" /></div><div className="h-96 bg-muted rounded" /></div></DashboardLayout>

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8 py-6 max-w-7xl mx-auto font-primary">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Analytics & Trends</h1>
                        <p className="text-muted-foreground mt-1 text-sm italic">
                            Portfolio performance metrics and fault distribution.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <Card className="bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Tickets</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black">{stats.totalJobs}</div>
                            <p className="text-[10px] text-muted-foreground mt-1 font-medium">LIFETIME LOGS</p>
                        </CardContent>
                    </Card>
                    <Card className="border-red-100 bg-red-50/30">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider text-red-600">Active Issues</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black text-red-600">{stats.openJobs}</div>
                            <p className="text-[10px] text-muted-foreground mt-1 font-medium">OPEN OR IN PROGRESS</p>
                        </CardContent>
                    </Card>
                    <Card className="border-blue-100 bg-blue-50/30">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-600">Strategic Capex</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black text-blue-600">${stats.totalBudget?.toLocaleString()}</div>
                            <p className="text-[10px] text-muted-foreground mt-1 font-medium">PORTFOLIO PIPELINE</p>
                        </CardContent>
                    </Card>
                    <Card className="border-green-100 bg-green-50/30">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider text-green-600">Resolved</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black text-green-600">{stats.resolvedJobs}</div>
                            <p className="text-[10px] text-muted-foreground mt-1 font-medium">COMPLETED TASKS</p>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card className="md:col-span-1 shadow-sm border-sidebar-border">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold flex items-center gap-2 italic">
                                <BarChart3 className="size-4 text-primary" />
                                Budget Allocation by Project
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="h-[300px] pt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.projectBudgetStats} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={120} fontSize={10} fontWeight="bold" stroke="#64748b" />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                                        cursor={{ fill: '#f8fafc' }}
                                    />
                                    <Bar dataKey="budget" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card className="md:col-span-1 shadow-sm border-sidebar-border">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold flex items-center gap-2 italic">
                                <Building2 className="size-4 text-primary" />
                                Fault attribution by Brand
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="h-[300px] flex flex-col items-center justify-center pt-4">
                            <ResponsiveContainer width="100%" height="80%">
                                <PieChart>
                                    <Pie
                                        data={stats.jobsByBrand}
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="count"
                                    >
                                        {stats.jobsByBrand.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="flex gap-4 mt-6">
                                {stats.jobsByBrand.map((s: any, index: number) => (
                                    <div key={s.name} className="flex items-center gap-1.5">
                                        <div className="size-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                        <span className="text-[10px] font-bold uppercase text-muted-foreground">{s.name}</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="md:col-span-1 shadow-sm border-sidebar-border">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold flex items-center gap-2 italic">
                                <AlertTriangle className="size-4 text-primary" />
                                Faults by Site
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="h-[300px] pt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.jobsByStore} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={100} fontSize={10} fontWeight="bold" stroke="#64748b" />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                                        cursor={{ fill: '#f8fafc' }}
                                    />
                                    <Bar dataKey="count" fill="#1e293b" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card className="md:col-span-1 shadow-sm border-sidebar-border">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold flex items-center gap-2 italic">
                                <CheckCircle2 className="size-4 text-primary" />
                                Status Distribution
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="h-[300px] flex flex-col items-center justify-center pt-4">
                            <ResponsiveContainer width="100%" height="80%">
                                <PieChart>
                                    <Pie
                                        data={stats.jobsByStatus}
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {stats.jobsByStatus.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="flex gap-4 mt-6">
                                {stats.jobsByStatus.map((s: any) => (
                                    <div key={s.name} className="flex items-center gap-1.5">
                                        <div className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                                        <span className="text-[10px] font-bold uppercase text-muted-foreground">{s.name}</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="md:col-span-2 shadow-sm border-sidebar-border">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold flex items-center gap-2 italic">
                                <TrendingUp className="size-4 text-primary" />
                                Reporting Trend (Last 7 Days)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="h-[350px] pt-8">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={stats.jobsOverTime}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis dataKey="date" fontSize={10} fontWeight="bold" stroke="#64748b" tickMargin={10} />
                                    <YAxis fontSize={10} fontWeight="bold" stroke="#64748b" />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="count"
                                        stroke="#1e293b"
                                        strokeWidth={3}
                                        dot={{ r: 4, fill: "#1e293b", strokeWidth: 2, stroke: "#fff" }}
                                        activeDot={{ r: 6, strokeWidth: 0 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DashboardLayout>
    )
}
