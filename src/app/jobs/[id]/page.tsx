"use client"

import { useEffect, useState, use } from "react"
import Image from "next/image"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import type { Job, JobStatus, UserProfile } from "@/types/database"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    ChevronLeft,
    User,
    Hammer,
    BarChart3,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { PageShell } from "@/components/page-shell"

const STATUS_DOT: Record<JobStatus, string> = {
    open: "bg-amber-500",
    in_progress: "bg-primary",
    resolved: "bg-emerald-500",
    closed: "bg-muted-foreground/50",
}

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const [job, setJob] = useState<Job | null>(null)
    const [technicians, setTechnicians] = useState<UserProfile[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        async function fetchData() {
            const { data: jobData } = await supabase
                .from('jobs')
                .select(`
                    *,
                    stores ( name, address ),
                    assets ( name ),
                    projects ( name, id ),
                    reporter:reported_by ( name ),
                    assignee:assigned_to ( name )
                `)
                .eq('id', id)
                .single()

            const { data: userData } = await supabase
                .from('users')
                .select('id, name, role')
                .in('role', ['technician', 'rodier_admin', 'super_admin'])

            setJob(jobData)
            setTechnicians(userData || [])
            setLoading(false)
        }

        fetchData()
    }, [id, supabase])

    const updateJobStatus = async (newStatus: JobStatus) => {
        if (!job) return
        const updateData: Record<string, string | null> = { status: newStatus }
        if (newStatus === 'in_progress' && !job.responded_at) {
            updateData.responded_at = new Date().toISOString()
        }
        if (newStatus === 'resolved') {
            updateData.resolved_at = new Date().toISOString()
        } else {
            updateData.resolved_at = null
        }

        const { error } = await supabase.from('jobs').update(updateData).eq('id', id)
        if (error) {
            toast.error("Failed to update status")
        } else {
            toast.success(`Job marked as ${newStatus.replace('_', ' ')}`)
            setJob({ ...job, status: newStatus })
        }
    }

    const assignTechnician = async (userId: string) => {
        if (!job) return
        const { error } = await supabase.from('jobs').update({ assigned_to: userId }).eq('id', id)
        if (error) {
            toast.error("Failed to assign technician")
        } else {
            const tech = technicians.find(t => t.id === userId)
            toast.success(`Assigned to ${tech?.name}`)
            setJob({ ...job, assigned_to: userId })
        }
    }

    if (loading) {
        return (
            <DashboardLayout>
                <PageShell>
                    <div className="animate-pulse space-y-4">
                        <div className="h-8 w-64 bg-muted/40 rounded" />
                        <div className="h-64 bg-muted/40 rounded-lg" />
                    </div>
                </PageShell>
            </DashboardLayout>
        )
    }
    if (!job) {
        return (
            <DashboardLayout>
                <PageShell>
                    <div className="p-8 text-center mt-12">
                        <h2 className="text-xl font-semibold">Job not found</h2>
                    </div>
                </PageShell>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <PageShell>
                <div className="flex flex-col gap-6">
                    <div>
                        <Button variant="ghost" size="sm" asChild className="-ml-2 h-8 text-muted-foreground hover:text-foreground">
                            <Link href={`/stores/${job.store_id}`} className="flex items-center gap-1">
                                <ChevronLeft className="size-4" />
                                Back to store
                            </Link>
                        </Button>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-border/60">
                        <div className="space-y-1">
                            <div className="flex items-center gap-3">
                                <h1 className="text-3xl font-semibold tracking-tight">{job.title}</h1>
                                <span className="text-sm text-muted-foreground capitalize">{job.job_type}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {job.stores?.name} · Ticket #{job.id.slice(0, 8).toUpperCase()}
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            {job.status === 'open' && (
                                <Button size="sm" onClick={() => updateJobStatus('in_progress')}>
                                    Start progress
                                </Button>
                            )}
                            {job.status === 'in_progress' && (
                                <Button size="sm" onClick={() => updateJobStatus('resolved')}>
                                    Mark resolved
                                </Button>
                            )}
                            {job.status === 'resolved' && (
                                <Button size="sm" variant="outline" onClick={() => updateJobStatus('closed')}>
                                    Close ticket
                                </Button>
                            )}
                            {job.status === 'closed' && (
                                <Button size="sm" variant="outline" onClick={() => updateJobStatus('open')}>
                                    Re-open ticket
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-2 space-y-4">
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm font-medium text-muted-foreground">Issue description</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <p className="text-sm leading-relaxed text-foreground">
                                        {job.description || <span className="text-muted-foreground">No description provided.</span>}
                                    </p>

                                    {job.media_urls && job.media_urls.length > 0 && (
                                        <div className="pt-4 border-t border-border/60">
                                            <h3 className="text-xs font-medium text-muted-foreground mb-3">Fault photos</h3>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                {job.media_urls.map((url: string, idx: number) => (
                                                    <a
                                                        key={idx}
                                                        href={url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="relative aspect-square rounded-md overflow-hidden border border-border/60 bg-muted/40 hover:opacity-80 transition-opacity"
                                                    >
                                                        <Image
                                                            src={url}
                                                            alt={`Fault ${idx + 1}`}
                                                            fill
                                                            className="object-cover"
                                                            sizes="(max-width: 640px) 50vw, 33vw"
                                                            loading="lazy"
                                                        />
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm font-medium text-muted-foreground">Associated asset</CardTitle>
                                </CardHeader>
                                <CardContent className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="size-8 bg-muted/40 rounded-md flex items-center justify-center">
                                            <Hammer className="size-4 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-foreground">{job.assets?.name || "Multiple / Site-wide"}</p>
                                            <p className="text-xs text-muted-foreground">Asset attached to this ticket</p>
                                        </div>
                                    </div>
                                    {job.asset_id && (
                                        <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
                                            <Link href={`/stores/${job.store_id}/assets/${job.asset_id}`}>View asset</Link>
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>

                            {job.projects && (
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">HQ strategic project</CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="size-8 bg-muted/40 rounded-md flex items-center justify-center">
                                                <BarChart3 className="size-4 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-foreground">{job.projects.name}</p>
                                                <p className="text-xs text-muted-foreground">Linked to capital project</p>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
                                            <Link href={`/projects/${job.projects.id}`}>View project</Link>
                                        </Button>
                                    </CardContent>
                                </Card>
                            )}
                        </div>

                        <div className="space-y-4">
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm font-medium text-muted-foreground">Ticket status</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 text-sm">
                                            <span className={`size-1.5 rounded-full ${STATUS_DOT[job.status]}`} />
                                            <span className="capitalize">{job.status.replace('_', ' ')}</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground capitalize">{job.severity}</span>
                                    </div>

                                    <div className="space-y-1.5 pt-2 border-t border-border/60">
                                        <p className="text-xs text-muted-foreground">Reported by</p>
                                        <div className="flex items-center gap-1.5 text-sm">
                                            <User className="size-3.5 text-muted-foreground" />
                                            <span>{job.reporter?.name || "System user"}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <p className="text-xs text-muted-foreground">Assignee</p>
                                        <Select value={job.assigned_to || ""} onValueChange={assignTechnician}>
                                            <SelectTrigger className="h-9 text-sm font-normal">
                                                <SelectValue placeholder="Unassigned" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {technicians.map((tech) => (
                                                    <SelectItem key={tech.id} value={tech.id}>
                                                        {tech.name} <span className="text-muted-foreground">({tech.role.replace('_', ' ')})</span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="pt-6 space-y-2 text-xs">
                                    <div className="flex items-center justify-between text-muted-foreground">
                                        <span>Logged</span>
                                        <span className="text-foreground">{new Date(job.created_at).toLocaleString()}</span>
                                    </div>
                                    {job.responded_at && (
                                        <div className="flex items-center justify-between text-muted-foreground">
                                            <span>First response</span>
                                            <span className="text-amber-600 dark:text-amber-400">{new Date(job.responded_at).toLocaleString()}</span>
                                        </div>
                                    )}
                                    {job.resolved_at && (
                                        <div className="flex items-center justify-between text-muted-foreground">
                                            <span>Resolved</span>
                                            <span className="text-emerald-600 dark:text-emerald-400">{new Date(job.resolved_at).toLocaleString()}</span>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </PageShell>
        </DashboardLayout>
    )
}
