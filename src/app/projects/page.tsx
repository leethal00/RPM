"use client"

import { useState, useMemo } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { Button } from "@/components/ui/button"
import { Plus, LayoutGrid, List as ListIcon, BarChart3, Calendar } from "lucide-react"
import { ProjectCard } from "@/components/project-card"
import type { Project, Job, Store } from "@/types/database"

type ProjectRow = Project & { stores?: Store | null; jobs?: Pick<Job, 'status' | 'budget_impact'>[] }
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { ProjectForm } from "@/components/project-form"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { TablePagination } from "@/components/table-pagination"
import { useCustomerFilter } from "@/lib/customer-filter"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

const PAGE_SIZE = 12

export default function ProjectsPage() {
    const supabase = useMemo(() => createClient(), [])
    const [page, setPage] = useState(1)
    const [statusFilter, setStatusFilter] = useState<string>("all")
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const { clientId } = useCustomerFilter()

    const projectsKey = `projects-${page}-${statusFilter}-${clientId ?? 'all'}`

    const { data: projectsResult, isLoading: loading, mutate: mutateProjects } = useSupabaseQuery<{ items: ProjectRow[], count: number }>(
        projectsKey,
        async () => {
            let query = supabase
                .from('projects')
                .select(`
                    *,
                    jobs (
                        id,
                        status,
                        budget_impact
                    ),
                    stores!inner ( client_id )
                `, { count: "exact" })
                .neq('status', 'archived')

            if (statusFilter !== "all") {
                query = query.eq('status', statusFilter)
            }

            if (clientId) {
                query = query.eq('stores.client_id', clientId)
            }

            query = query.order('created_at', { ascending: false })

            const from = (page - 1) * PAGE_SIZE
            const to = from + PAGE_SIZE - 1
            query = query.range(from, to)

            const { data, error, count } = await query

            if (error) throw error

            return { data: { items: data || [], count: count ?? 0 }, error: null }
        }
    )

    const projects = projectsResult?.items || []
    const totalCount = projectsResult?.count ?? 0

    const fetchProjects = () => mutateProjects()

    const handleStatusChange = (value: string) => {
        setStatusFilter(value)
        setPage(1)
    }

    const pageCount = Math.ceil(totalCount / PAGE_SIZE)

    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader
                    icon={BarChart3}
                    title="HQ Projects"
                    description="Major site improvements and multi-job strategic initiatives."
                    actions={
                        <div className="flex items-center gap-2">
                            <Select value={statusFilter} onValueChange={handleStatusChange}>
                                <SelectTrigger className="h-9 min-w-[140px] text-sm font-normal">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All statuses</SelectItem>
                                    <SelectItem value="planning">Planning</SelectItem>
                                    <SelectItem value="in_progress">In progress</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                </SelectContent>
                            </Select>

                            <div className="flex items-center border border-border/60 rounded-md p-0.5">
                                <Button
                                    variant={viewMode === 'grid' ? "secondary" : "ghost"}
                                    size="icon"
                                    className="size-8"
                                    onClick={() => setViewMode('grid')}
                                >
                                    <LayoutGrid className="size-3.5" />
                                </Button>
                                <Button
                                    variant={viewMode === 'list' ? "secondary" : "ghost"}
                                    size="icon"
                                    className="size-8"
                                    onClick={() => setViewMode('list')}
                                >
                                    <ListIcon className="size-3.5" />
                                </Button>
                            </div>

                            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" className="gap-1.5 h-9">
                                        <Plus className="size-3.5" />
                                        New project
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
                    }
                />

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-[200px] rounded-lg bg-muted/40 animate-pulse" />
                        ))}
                    </div>
                ) : projects.length > 0 ? (
                    <>
                        <div className={viewMode === 'grid'
                            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                            : "flex flex-col gap-3"
                        }>
                            {projects.map((project) => (
                                <ProjectCard
                                    key={project.id}
                                    project={project}
                                    viewMode={viewMode}
                                />
                            ))}
                        </div>
                        <TablePagination
                            page={page}
                            pageCount={pageCount}
                            onPageChange={setPage}
                            totalItems={totalCount}
                            pageSize={PAGE_SIZE}
                        />
                    </>
                ) : (
                    <div className="py-16 text-center border border-dashed border-border/60 rounded-lg">
                        <div className="size-12 bg-muted/40 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Calendar className="size-5 text-muted-foreground" />
                        </div>
                        <h3 className="text-base font-medium text-foreground">No HQ projects yet</h3>
                        <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                            You haven&apos;t initiated any capital projects or major site refurbs.
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-4"
                            onClick={() => setIsDialogOpen(true)}
                        >
                            Initiate first project
                        </Button>
                    </div>
                )}
            </PageShell>
        </DashboardLayout>
    )
}
