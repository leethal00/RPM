"use client"

import { useEffect, useState, use } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    ChevronLeft,
    Clock,
    User,
    AlertTriangle,
    CheckCircle2,
    Hammer,
    PlayCircle
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

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const [job, setJob] = useState<any>(null)
    const [technicians, setTechnicians] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        async function fetchData() {
            // Fetch Job with Store and Asset info
            const { data: jobData } = await supabase
                .from('jobs')
                .select(`
          *,
          stores ( name, address ),
          assets ( name ),
          reporter:reported_by ( name ),
          assignee:assigned_to ( name )
        `)
                .eq('id', id)
                .single()

            // Fetch potential technicians/admins for assignment
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

    const updateJobStatus = async (newStatus: string) => {
        const { error } = await supabase
            .from('jobs')
            .update({
                status: newStatus,
                resolved_at: newStatus === 'resolved' ? new Date().toISOString() : null
            })
            .eq('id', id)

        if (error) {
            toast.error("Failed to update status")
        } else {
            toast.success(`Job marked as ${newStatus}`)
            setJob({ ...job, status: newStatus })
        }
    }

    const assignTechnician = async (userId: string) => {
        const { error } = await supabase
            .from('jobs')
            .update({ assigned_to: userId })
            .eq('id', id)

        if (error) {
            toast.error("Failed to assign technician")
        } else {
            const tech = technicians.find(t => t.id === userId)
            toast.success(`Assigned to ${tech?.name}`)
            setJob({ ...job, assigned_to: userId, assignee: { name: tech?.name } })
        }
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'open': return <AlertTriangle className="size-5 text-red-500" />
            case 'in_progress': return <PlayCircle className="size-5 text-blue-500" />
            case 'resolved': return <CheckCircle2 className="size-5 text-green-500" />
            case 'closed': return <Clock className="size-5 text-muted-foreground" />
            default: return null
        }
    }

    if (loading) return <DashboardLayout><div className="p-8 animate-pulse space-y-4"><div className="h-8 w-64 bg-muted rounded" /><div className="h-64 bg-muted rounded" /></div></DashboardLayout>
    if (!job) return <DashboardLayout><div className="p-8 text-center mt-20"><h2 className="text-xl font-bold">Job not found</h2></div></DashboardLayout>

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 py-6 font-primary max-w-5xl mx-auto">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" asChild className="-ml-2 h-8">
                        <Link href={`/stores/${job.store_id}`} className="flex items-center gap-1 text-muted-foreground">
                            <ChevronLeft className="size-4" />
                            Back to Store
                        </Link>
                    </Button>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold tracking-tight">{job.title}</h1>
                            <Badge variant="outline" className="uppercase">{job.job_type}</Badge>
                        </div>
                        <p className="text-muted-foreground">{job.stores?.name} • Ticket #{job.id.slice(0, 8).toUpperCase()}</p>
                    </div>

                    <div className="flex items-center gap-2">
                        {job.status === 'open' && (
                            <Button onClick={() => updateJobStatus('in_progress')} className="bg-blue-600 hover:bg-blue-700">
                                Start Progress
                            </Button>
                        )}
                        {job.status === 'in_progress' && (
                            <Button onClick={() => updateJobStatus('resolved')} className="bg-green-600 hover:bg-green-700">
                                Mark Resolved
                            </Button>
                        )}
                        {job.status === 'resolved' && (
                            <Button onClick={() => updateJobStatus('closed')} variant="outline">
                                Close Ticket
                            </Button>
                        )}
                        {job.status === 'closed' && (
                            <Button onClick={() => updateJobStatus('open')} variant="ghost">
                                Re-open Ticket
                            </Button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm font-medium italic">Issue Description</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-base leading-relaxed text-foreground min-h-[100px]">
                                    {job.description || "No description provided."}
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm font-medium italic">Associated Asset</CardTitle>
                            </CardHeader>
                            <CardContent className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-primary/10 rounded-lg">
                                        <Hammer className="size-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-semibold">{job.assets?.name || "Multiple / Site-wide"}</p>
                                        <p className="text-xs text-muted-foreground">Asset attached to this ticket</p>
                                    </div>
                                </div>
                                {job.asset_id && (
                                    <Button variant="link" asChild>
                                        <Link href={`/stores/${job.store_id}/assets/${job.asset_id}`}>View Asset Details</Link>
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm font-medium italic">Ticket Status</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        {getStatusIcon(job.status)}
                                        <span className="font-bold uppercase tracking-tight text-sm">{job.status}</span>
                                    </div>
                                    <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/20">
                                        {job.severity}
                                    </Badge>
                                </div>

                                <div className="space-y-1 pt-2">
                                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Reported By</p>
                                    <div className="flex items-center gap-2">
                                        <User className="size-4 text-muted-foreground" />
                                        <span className="text-sm">{job.reporter?.name || "System User"}</span>
                                    </div>
                                </div>

                                <div className="space-y-2 pt-2">
                                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Assignee</p>
                                    <Select
                                        value={job.assigned_to || ""}
                                        onValueChange={assignTechnician}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Unassigned" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {technicians.map((tech) => (
                                                <SelectItem key={tech.id} value={tech.id}>
                                                    {tech.name} ({tech.role.replace('_', ' ')})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-primary/5 border-primary/20">
                            <CardContent className="pt-6">
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Logged:</span>
                                        <span>{new Date(job.created_at).toLocaleString()}</span>
                                    </div>
                                    {job.resolved_at && (
                                        <div className="flex items-center justify-between text-xs font-bold text-green-700">
                                            <span>Resolved:</span>
                                            <span>{new Date(job.resolved_at).toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
