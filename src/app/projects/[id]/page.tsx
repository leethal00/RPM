"use client"

import { useEffect, useState, use } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import {
    ChevronLeft,
    Calendar,
    DollarSign,
    ClipboardList,
    CheckCircle2,
    Clock,
    AlertTriangle,
    BarChart3,
    ArrowUpRight
} from "lucide-react"
import Link from "next/link"
import { JobTimeline } from "@/components/job-timeline"

export default function ProjectDetailPage({
    params
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = use(params)
    const [project, setProject] = useState<any>(null)
    const [jobs, setJobs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            // Fetch Project
            const { data: projectData } = await supabase
                .from('projects')
                .select('*')
                .eq('id', id)
                .single()

            // Fetch Linked Jobs
            const { data: jobData } = await supabase
                .from('jobs')
                .select(`
                    *,
                    stores (
                        name
                    )
                `)
                .eq('project_id', id)
                .order('created_at', { ascending: false })

            setProject(projectData)
            setJobs(jobData || [])
            setLoading(false)
        }

        fetchData()
    }, [id, supabase])

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

    if (!project) {
        return (
            <DashboardLayout>
                <div className="p-8 text-center mt-20">
                    <h2 className="text-xl font-bold mb-2">Project not found</h2>
                    <Button asChild variant="link">
                        <Link href="/projects">Return to Projects Portfolio</Link>
                    </Button>
                </div>
            </DashboardLayout>
        )
    }

    const completedJobs = jobs.filter(j => j.status === 'resolved' || j.status === 'closed').length
    const progress = jobs.length > 0 ? (completedJobs / jobs.length) * 100 : 0

    // Simple budget utilization for now (sum of jobs if we had a cost field, for now we'll just show the budget)
    const budgetUsed = 0 // Placeholder for future cost tracking per job

    const statusColors: any = {
        planning: "bg-blue-500",
        in_progress: "bg-amber-500",
        completed: "bg-green-500",
        cancelled: "bg-red-500",
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 py-6 font-primary max-w-7xl mx-auto">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" asChild className="-ml-2 h-8 text-muted-foreground">
                        <Link href="/projects" className="flex items-center gap-1">
                            <ChevronLeft className="size-4" />
                            Back to Portfolio
                        </Link>
                    </Button>
                </div>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
                            <Badge className={`${statusColors[project.status]} text-white text-[10px] black tracking-widest`}>
                                {project.status.replace('_', ' ')}
                            </Badge>
                        </div>
                        <p className="text-muted-foreground italic max-w-2xl">{project.description || "Strategic capital expenditure initiative."}</p>
                    </div>

                    <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-xl border border-sidebar-border">
                        <div className="text-right">
                            <p className="text-[10px] font-black uppercase text-muted-foreground opacity-60 tracking-widest">Target Completion</p>
                            <p className="font-bold flex items-center justify-end gap-1.5 mt-0.5">
                                <Calendar className="size-4 text-primary" />
                                {project.end_date ? new Date(project.end_date).toLocaleDateString() : 'TBD'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="md:col-span-2">
                        <CardHeader className="pb-2 border-b bg-muted/10">
                            <CardTitle className="text-sm font-bold flex items-center gap-2 italic">
                                <BarChart3 className="size-4 text-primary" />
                                Project Velocity & Execution
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-8">
                            <div className="space-y-4">
                                <div className="flex justify-between items-end">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground">Implementation Status</p>
                                        <p className="text-2xl font-black">{Math.round(progress)}% Complete</p>
                                    </div>
                                    <div className="text-right space-y-1">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground">Completed Tasks</p>
                                        <p className="text-xl font-black">{completedJobs} / {jobs.length}</p>
                                    </div>
                                </div>
                                <Progress value={progress} className="h-4 rounded-full shadow-inner bg-secondary" />
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-4 border-t border-dashed">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5 italic">
                                        <Clock className="size-3" /> Start
                                    </p>
                                    <p className="font-bold text-sm">{project.start_date ? new Date(project.start_date).toLocaleDateString() : 'N/A'}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5 italic">
                                        <CheckCircle2 className="size-3" /> Resolved
                                    </p>
                                    <p className="font-bold text-sm">{completedJobs} Jobs</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5 italic">
                                        <AlertTriangle className="size-3" /> Active
                                    </p>
                                    <p className="font-bold text-sm text-amber-600">{jobs.length - completedJobs} Pending</p>
                                </div>
                                <div className="space-y-1 text-right">
                                    <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5 justify-end italic">
                                        <DollarSign className="size-3" /> Budget
                                    </p>
                                    <p className="font-bold text-sm text-primary">${project.budget?.toLocaleString() || "0"}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold italic">Strategy & Scope</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-2">
                            <div className="p-4 bg-muted/50 rounded-lg border border-sidebar-border italic text-xs leading-relaxed text-muted-foreground shadow-inner">
                                {project.description || "No detailed strategic scope defined for this project."}
                            </div>
                            <div className="space-y-3 pt-2">
                                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Linked Sites</p>
                                <div className="flex flex-wrap gap-2">
                                    {Array.from(new Set(jobs.map(j => j.stores?.name))).map(storeName => (
                                        <Badge key={storeName} variant="secondary" className="px-3 py-1 text-[10px] font-bold">
                                            {storeName}
                                        </Badge>
                                    ))}
                                    {jobs.length === 0 && <p className="text-xs text-muted-foreground italic">No sites linked yet.</p>}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="mt-8">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold tracking-tight italic">Project Workstream Timeline</h2>
                        <Button variant="outline" size="sm" asChild className="gap-2 italic shadow-sm">
                            <Link href="/">
                                <ArrowUpRight className="size-4" />
                                Analysis View
                            </Link>
                        </Button>
                    </div>

                    <div className="bg-card border rounded-xl p-6 shadow-sm overflow-hidden">
                        {jobs.length > 0 ? (
                            <JobTimeline jobs={jobs} />
                        ) : (
                            <div className="py-20 text-center border-2 border-dashed rounded-lg">
                                <ClipboardList className="size-12 text-muted-foreground/30 mx-auto mb-4" />
                                <p className="text-muted-foreground italic">No jobs have been associated with this project stream yet.</p>
                                <Button asChild variant="link" className="mt-2">
                                    <Link href="/stores">Link your first job</Link>
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
