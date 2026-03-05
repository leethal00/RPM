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
    RefreshCw,
    CheckCircle2,
    Clock,
    User
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

export default function PMSchedulerPage() {
    const [pmAssets, setPmAssets] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        fetchPMData()
    }, [])

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
                    brand_st_pierres,
                    brand_bento_bowl,
                    brand_k10
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

    const getStatusColor = (asset: any) => {
        // Red if active fault
        const activeFaults = asset.jobs?.filter((j: any) => j.status === 'open' || j.status === 'in_progress')
        if (activeFaults && activeFaults.length > 0) return "bg-red-50 text-red-600"

        if (!asset.next_service_date) return "bg-slate-100 text-slate-600"
        const nextDue = new Date(asset.next_service_date)
        const now = new Date()

        if (nextDue < now) return "bg-orange-50 text-orange-600 border-orange-200"

        return "bg-emerald-50 text-emerald-600"
    }

    const getStoreBrand = (store: any) => {
        if (store.brand_bento_bowl) return "Bento Bowl"
        if (store.brand_k10) return "K10"
        return "St Pierre's"
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

    const getQuarterLabel = (dateString: string) => {
        if (!dateString) return "TBD"
        const date = new Date(dateString)
        const month = date.getMonth()
        const year = date.getFullYear()
        const quarter = Math.floor(month / 3) + 1
        return `Q${quarter} ${year}`
    }

    const generatePMJob = async (asset: any) => {
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
            <div className="flex flex-col gap-8 py-6 max-w-7xl mx-auto font-primary px-4 md:px-0">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[10px] font-bold tracking-widest uppercase bg-primary/5 text-primary border-primary/20">Fleet Strategy</Badge>
                        </div>
                        <h1 className="text-3xl font-black tracking-tight text-slate-900 italic uppercase">PM Scheduler</h1>
                        <p className="text-muted-foreground mt-1 text-sm font-medium">
                            Proactive maintenance monitoring for {pmAssets.length} tracked assets.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button onClick={fetchPMData} variant="outline" size="sm" className="gap-2 font-bold uppercase tracking-wider text-[10px] border-2">
                            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
                            Refresh Schedule
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="border-2 shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-red-50/50">
                            <CardTitle className="text-xs font-black uppercase tracking-widest">Overdue</CardTitle>
                            <AlertCircle className="h-4 w-4 text-red-500" />
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="text-2xl font-black text-red-600">
                                {pmAssets.filter(a => a.next_service_date && new Date(a.next_service_date) < new Date()).length}
                            </div>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Requiring Immediate Action</p>
                        </CardContent>
                    </Card>

                    <Card className="border-2 shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-amber-50/50">
                            <CardTitle className="text-xs font-black uppercase tracking-widest">Due (30 Days)</CardTitle>
                            <Clock className="h-4 w-4 text-amber-500" />
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="text-2xl font-black text-amber-600">
                                {pmAssets.filter(a => {
                                    if (!a.next_service_date) return false;
                                    const next = new Date(a.next_service_date);
                                    const now = new Date();
                                    const thirtyDays = new Date();
                                    thirtyDays.setDate(now.getDate() + 30);
                                    return next >= now && next <= thirtyDays;
                                }).length}
                            </div>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Upcoming Maintenance</p>
                        </CardContent>
                    </Card>

                    <Card className="border-2 shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-emerald-50/50">
                            <CardTitle className="text-xs font-black uppercase tracking-widest">Compliant</CardTitle>
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="text-2xl font-black text-emerald-600">
                                {pmAssets.filter(a => {
                                    if (!a.next_service_date) return true;
                                    const next = new Date(a.next_service_date);
                                    const thirtyDays = new Date();
                                    thirtyDays.setDate(new Date().getDate() + 30);
                                    return next > thirtyDays;
                                }).length}
                            </div>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Scheduled for later</p>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    <Card className="border-2 shadow-sm overflow-hidden">
                        <CardHeader className="border-b bg-slate-50/80">
                            <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                <Calendar className="size-4 text-primary" />
                                Maintenance Pipeline
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y-2 border-slate-100">
                                {pmAssets.map((asset) => (
                                    <div key={asset.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-slate-50/50 transition-colors">
                                        <div className="flex items-start gap-4">
                                            <div className={`p-3 rounded-xl ${getStatusColor(asset)}`}>
                                                <Hammer className="size-6" />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-3">
                                                    <span className="font-black text-slate-800 uppercase tracking-tight">{asset.asset_types?.label}</span>
                                                    <Badge variant="outline" className="h-5 text-[9px] font-black tracking-tighter uppercase px-1.5 bg-primary/5 text-primary border-primary/20">
                                                        {asset.asset_group}
                                                    </Badge>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                                    <span className="flex items-center gap-1.5">
                                                        <Building2 className="size-3.5 text-primary/60" />
                                                        {getStoreBrand(asset.stores)} - {asset.stores.name}
                                                    </span>
                                                    <span className="flex items-center gap-1.5 bg-amber-50 px-2 py-0.5 rounded text-amber-700">
                                                        <Calendar className="size-3.5" />
                                                        Due: {getQuarterLabel(asset.next_service_date)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 self-end md:self-center">
                                            <Button variant="ghost" size="sm" asChild className="text-slate-400 hover:text-primary font-bold uppercase text-[10px] tracking-widest">
                                                <Link href={`/stores/${asset.stores.id}/assets/${asset.id}`}>
                                                    Config
                                                    <ArrowRight className="size-3 ml-2" />
                                                </Link>
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => generatePMJob(asset)}
                                                className="bg-slate-900 hover:bg-black text-white px-6 font-black uppercase text-[10px] tracking-[0.15em] h-9 shadow-lg shadow-slate-200"
                                            >
                                                Generate PM Ticket
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                {pmAssets.length === 0 && !loading && (
                                    <div className="py-24 text-center">
                                        <div className="size-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-200">
                                            <Calendar className="size-10 text-slate-300" />
                                        </div>
                                        <div className="max-w-xs mx-auto">
                                            <p className="font-black text-xl text-slate-900 uppercase italic">No Active PMs</p>
                                            <p className="text-xs text-slate-500 font-bold uppercase mt-2">Configure assets with PM intervals to track maintenance here.</p>
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
