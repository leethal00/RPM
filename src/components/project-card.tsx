"use client"

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Calendar, ClipboardList } from "lucide-react"
import Link from "next/link"
import type { Job, Project, Store } from "@/types/database"

interface ProjectCardProps {
    project: Project & { stores?: Store | null; jobs?: Pick<Job, 'status'>[] }
    viewMode: 'grid' | 'list'
}

export function ProjectCard({ project, viewMode }: ProjectCardProps) {
    const jobs = project.jobs || []
    const completedJobs = jobs.filter((j: Pick<Job, 'status'>) => j.status === 'resolved' || j.status === 'closed').length
    const progress = jobs.length > 0 ? (completedJobs / jobs.length) * 100 : 0

    const statusDot: Record<string, string> = {
        planning: "bg-primary",
        in_progress: "bg-amber-500",
        completed: "bg-emerald-500",
        cancelled: "bg-destructive",
    }

    const statusLabel = project.status.replace('_', ' ')

    if (viewMode === 'list') {
        return (
            <Link href={`/projects/${project.id}`}>
                <Card className="hover:bg-accent/30 transition-colors cursor-pointer group">
                    <CardContent className="px-5 py-4 flex items-center justify-between gap-6">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                                    {project.name}
                                </h3>
                                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground capitalize">
                                    <span className={`size-1.5 rounded-full ${statusDot[project.status]}`} />
                                    {statusLabel}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-1">{project.description}</p>
                        </div>

                        <div className="hidden md:flex flex-col items-end gap-1 w-40">
                            <div className="flex justify-between w-full text-xs text-muted-foreground">
                                <span>Progress</span>
                                <span className="tabular-nums">{Math.round(progress)}%</span>
                            </div>
                            <Progress value={progress} className="h-1.5" />
                        </div>

                        <div className="flex items-center gap-6 text-sm">
                            <div className="flex flex-col items-center gap-0.5">
                                <span className="text-xs text-muted-foreground">Jobs</span>
                                <span className="font-medium tabular-nums">{jobs.length}</span>
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                                <span className="text-xs text-muted-foreground">Budget</span>
                                <span className="font-medium tabular-nums">${project.budget?.toLocaleString() || "0"}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </Link>
        )
    }

    return (
        <Link href={`/projects/${project.id}`}>
            <Card className="h-full flex flex-col hover:bg-accent/20 transition-colors group">
                <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-3">
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground capitalize">
                            <span className={`size-1.5 rounded-full ${statusDot[project.status]}`} />
                            {statusLabel}
                        </span>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="size-3" />
                            {project.end_date ? new Date(project.end_date).toLocaleDateString() : '—'}
                        </div>
                    </div>
                    <h3 className="text-lg font-semibold mt-2 group-hover:text-primary transition-colors leading-snug">
                        {project.name}
                    </h3>
                </CardHeader>
                <CardContent className="flex-1 space-y-5">
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                        {project.description || "No project overview."}
                    </p>

                    <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Completion</span>
                            <span className="tabular-nums text-foreground">{Math.round(progress)}%</span>
                        </div>
                        <Progress value={progress} className="h-1.5" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-0.5">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <ClipboardList className="size-3" />
                                Jobs
                            </p>
                            <p className="text-sm font-medium tabular-nums">{jobs.length}</p>
                        </div>
                        <div className="space-y-0.5 text-right">
                            <p className="text-xs text-muted-foreground">Budget</p>
                            <p className="text-sm font-medium tabular-nums">${project.budget?.toLocaleString() || "0"}</p>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="pt-3 border-t border-border/40 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">View strategy</span>
                </CardFooter>
            </Card>
        </Link>
    )
}
