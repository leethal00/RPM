"use client"

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Calendar, DollarSign, ClipboardList, TrendingUp } from "lucide-react"
import Link from "next/link"

interface ProjectCardProps {
    project: any
    viewMode: 'grid' | 'list'
}

export function ProjectCard({ project, viewMode }: ProjectCardProps) {
    const jobs = project.jobs || []
    const completedJobs = jobs.filter((j: any) => j.status === 'resolved' || j.status === 'closed').length
    const progress = jobs.length > 0 ? (completedJobs / jobs.length) * 100 : 0

    const statusColors: any = {
        planning: "bg-blue-500",
        in_progress: "bg-amber-500",
        completed: "bg-green-500",
        cancelled: "bg-red-500",
    }

    if (viewMode === 'list') {
        return (
            <Link href={`/projects/${project.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer overflow-hidden group">
                    <CardContent className="p-4 flex items-center justify-between gap-6">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                                <h3 className="font-bold text-lg truncate group-hover:text-primary transition-colors">
                                    {project.name}
                                </h3>
                                <Badge className={`${statusColors[project.status]} text-white text-[10px] uppercase font-black tracking-widest`}>
                                    {project.status.replace('_', ' ')}
                                </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground italic line-clamp-1">{project.description}</p>
                        </div>

                        <div className="hidden md:flex flex-col items-end gap-1 w-48">
                            <div className="flex justify-between w-full text-[10px] font-bold uppercase text-muted-foreground italic">
                                <span>Progress</span>
                                <span>{Math.round(progress)}%</span>
                            </div>
                            <Progress value={progress} className="h-1.5" />
                        </div>

                        <div className="flex items-center gap-6 text-sm">
                            <div className="flex flex-col items-center">
                                <span className="text-[10px] font-black text-muted-foreground uppercase opacity-60">Jobs</span>
                                <span className="font-bold">{jobs.length}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] font-black text-muted-foreground uppercase opacity-60 text-right w-full">Budget</span>
                                <span className="font-bold text-primary">${project.budget?.toLocaleString() || "0"}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </Link>
        )
    }

    return (
        <Link href={`/projects/${project.id}`}>
            <Card className="h-full flex flex-col hover:shadow-lg transition-all border-sidebar-border hover:border-primary/30 group">
                <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-4">
                        <Badge className={`${statusColors[project.status]} text-white text-[10px] uppercase font-black tracking-widest shadow-sm`}>
                            {project.status.replace('_', ' ')}
                        </Badge>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground italic">
                            <Calendar className="size-3" />
                            {project.end_date ? new Date(project.end_date).toLocaleDateString() : 'TBD'}
                        </div>
                    </div>
                    <h3 className="text-xl font-bold mt-3 group-hover:text-primary transition-colors leading-tight">
                        {project.name}
                    </h3>
                </CardHeader>
                <CardContent className="flex-1 space-y-6">
                    <p className="text-xs text-muted-foreground leading-relaxed italic line-clamp-2">
                        {project.description || "No project overview provided."}
                    </p>

                    <div className="space-y-2">
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                            <span className="text-muted-foreground italic">Completion Progress</span>
                            <span className="text-foreground">{Math.round(progress)}%</span>
                        </div>
                        <Progress value={progress} className="h-2 rounded-full shadow-inner" />
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="space-y-1">
                            <p className="text-[9px] font-black text-muted-foreground uppercase opacity-60 flex items-center gap-1">
                                <ClipboardList className="size-2.5" />
                                Assigned Work
                            </p>
                            <p className="text-sm font-bold">{jobs.length} Active Jobs</p>
                        </div>
                        <div className="space-y-1 text-right">
                            <p className="text-[9px] font-black text-muted-foreground uppercase opacity-60 flex items-center gap-1 justify-end">
                                <DollarSign className="size-2.5" />
                                Capex Budget
                            </p>
                            <p className="text-sm font-bold text-primary">${project.budget?.toLocaleString() || "0"}</p>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="pt-4 border-t bg-muted/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="size-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-tighter">Live Strategic View</span>
                    </div>
                    <TrendingUp className="size-4 text-muted-foreground opacity-30" />
                </CardFooter>
            </Card>
        </Link>
    )
}
