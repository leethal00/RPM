"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Plus, LayoutGrid, List as ListIcon, Loader2, BarChart3, Calendar } from "lucide-react"
import { ProjectCard } from "@/components/project-card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { ProjectForm } from "@/components/project-form"

export default function ProjectsPage() {
    const [projects, setProjects] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const supabase = createClient()

    const fetchProjects = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('projects')
            .select(`
                *,
                jobs (
                    id,
                    status,
                    budget_impact
                )
            `)
            .neq('status', 'archived')
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching projects:', error)
        } else {
            setProjects(data || [])
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchProjects()
    }, [])

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8 py-6 max-w-7xl mx-auto font-primary">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-primary mb-1">
                            <BarChart3 className="size-5" />
                            <span className="text-xs font-bold uppercase tracking-widest">Strategic HQ</span>
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight">HQ Projects & Capex</h1>
                        <p className="text-muted-foreground mt-1 text-sm italic">
                            Tracking major site improvements and multi-job strategic initiatives.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center border rounded-lg p-1 bg-muted/30">
                            <Button
                                variant={viewMode === 'grid' ? "secondary" : "ghost"}
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setViewMode('grid')}
                            >
                                <LayoutGrid className="size-4" />
                            </Button>
                            <Button
                                variant={viewMode === 'list' ? "secondary" : "ghost"}
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setViewMode('list')}
                            >
                                <ListIcon className="size-4" />
                            </Button>
                        </div>

                        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 shadow-sm">
                                    <Plus className="size-4" />
                                    New Project
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[600px]">
                                <DialogHeader>
                                    <DialogTitle>Initiate HQ Project</DialogTitle>
                                    <DialogDescription>
                                        Define high-level objectives, budget, and timeline.
                                    </DialogDescription>
                                </DialogHeader>
                                <ProjectForm
                                    onSuccess={() => {
                                        setIsDialogOpen(false)
                                        fetchProjects()
                                    }}
                                    onCancel={() => setIsDialogOpen(false)}
                                />
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-[250px] rounded-xl bg-muted animate-pulse border" />
                        ))}
                    </div>
                ) : projects.length > 0 ? (
                    <div className={viewMode === 'grid'
                        ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                        : "flex flex-col gap-4"
                    }>
                        {projects.map((project) => (
                            <ProjectCard
                                key={project.id}
                                project={project}
                                viewMode={viewMode}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="py-24 text-center border-2 border-dashed rounded-2xl bg-muted/10">
                        <div className="size-20 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Calendar className="size-10 text-muted-foreground" />
                        </div>
                        <h3 className="text-xl font-bold">No High-Level Projects</h3>
                        <p className="text-muted-foreground max-w-sm mx-auto mt-2 italic">
                            You haven't initiated any capital projects or major site refurbs yet.
                        </p>
                        <Button
                            variant="outline"
                            className="mt-6 border-primary text-primary hover:bg-primary/5"
                            onClick={() => setIsDialogOpen(true)}
                        >
                            Initiate First Project
                        </Button>
                    </div>
                )}
            </div>
        </DashboardLayout>
    )
}
