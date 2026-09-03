"use client"

import { useMemo, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageHeader } from "@/components/page-header"
import { PageShell } from "@/components/page-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    ClipboardList,
    Search,
    PlusCircle,
    AlertTriangle,
    Clock3,
    CheckCircle2,
    CircleDot,
    Hourglass,
} from "lucide-react"

type TaskStatus =
    | "new"
    | "in_progress"
    | "waiting_client"
    | "waiting_rodier"
    | "completed"
    | "cancelled"

type TaskPriority = "low" | "normal" | "high" | "urgent"

interface DemoTask {
    id: string
    title: string
    description: string
    status: TaskStatus
    priority: TaskPriority
    location: string
    asset?: string
    dueDate?: string
    owner: string
}

const DEMO_TASKS: DemoTask[] = [
    {
        id: "1",
        title: "Review drive-thru menu board upgrade options",
        description:
            "Review current menu board formats and provide recommended upgrade options for future refurbishments.",
        status: "in_progress",
        priority: "high",
        location: "Multiple Sites",
        owner: "Rodier",
        dueDate: "12 Sep 2026",
    },
    {
        id: "2",
        title: "Develop new external signage specification",
        description:
            "Prepare a standard signage specification covering materials, illumination and maintenance requirements.",
        status: "waiting_client",
        priority: "normal",
        location: "National",
        owner: "McDonald's",
        dueDate: "18 Sep 2026",
    },
    {
        id: "3",
        title: "Auckland store pylon sign replacement proposal",
        description:
            "Prepare replacement concept and budget guidance for the existing pylon sign.",
        status: "new",
        priority: "high",
        location: "Auckland Store",
        asset: "Pylon Sign",
        owner: "Rodier",
    },
    {
        id: "4",
        title: "Review LED illumination options for future signage",
        description:
            "Compare current LED modules with newer alternatives for efficiency, brightness and serviceability.",
        status: "in_progress",
        priority: "normal",
        location: "National",
        owner: "Rodier",
        dueDate: "25 Sep 2026",
    },
    {
        id: "5",
        title: "Confirm dimensions for replacement directional sign",
        description:
            "Confirm final dimensions and mounting details before fabrication drawings are completed.",
        status: "waiting_rodier",
        priority: "normal",
        location: "Example Site",
        asset: "Directional Sign",
        owner: "Rodier",
        dueDate: "8 Sep 2026",
    },
    {
        id: "6",
        title: "2027 signage refresh planning",
        description:
            "Initial planning register for likely signage refresh work across the 2027 programme.",
        status: "new",
        priority: "low",
        location: "National",
        owner: "Rodier",
    },
]

const statusLabel: Record<TaskStatus, string> = {
    new: "New",
    in_progress: "In Progress",
    waiting_client: "Waiting on McDonald's",
    waiting_rodier: "Waiting on Rodier",
    completed: "Completed",
    cancelled: "Cancelled",
}

const priorityLabel: Record<TaskPriority, string> = {
    low: "Low",
    normal: "Normal",
    high: "High",
    urgent: "Urgent",
}

function statusVariant(status: TaskStatus) {
    switch (status) {
        case "completed":
            return "default"
        case "in_progress":
            return "secondary"
        case "waiting_client":
        case "waiting_rodier":
            return "outline"
        default:
            return "secondary"
    }
}

export default function TasksPage() {
    const [search, setSearch] = useState("")

    const filteredTasks = useMemo(() => {
        const q = search.trim().toLowerCase()

        if (!q) return DEMO_TASKS

        return DEMO_TASKS.filter((task) =>
            [
                task.title,
                task.description,
                task.location,
                task.asset || "",
                task.owner,
                statusLabel[task.status],
                priorityLabel[task.priority],
            ]
                .join(" ")
                .toLowerCase()
                .includes(q)
        )
    }, [search])

    const openCount = DEMO_TASKS.filter(
        (task) =>
            task.status !== "completed" &&
            task.status !== "cancelled"
    ).length

    const inProgressCount = DEMO_TASKS.filter(
        (task) => task.status === "in_progress"
    ).length

    const waitingCount = DEMO_TASKS.filter(
        (task) =>
            task.status === "waiting_client" ||
            task.status === "waiting_rodier"
    ).length

    const completedCount = DEMO_TASKS.filter(
        (task) => task.status === "completed"
    ).length

    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader
                    icon={ClipboardList}
                    title="Projects & Tasks"
                    description="Shared project leads, actions and follow-up items between McDonald's and Rodier."
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Card>
                        <CardHeader className="pb-1">
                            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                <CircleDot className="size-3.5" />
                                Open
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold tabular-nums">
                                {openCount}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Current actions
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-1">
                            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                <Clock3 className="size-3.5" />
                                In Progress
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold tabular-nums">
                                {inProgressCount}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Actively being worked on
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-1">
                            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                <Hourglass className="size-3.5" />
                                Waiting
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold tabular-nums">
                                {waitingCount}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Awaiting next action
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-1">
                            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                <CheckCircle2 className="size-3.5" />
                                Completed
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-semibold tabular-nums">
                                {completedCount}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Closed items
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="gap-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <CardTitle>Task Register</CardTitle>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Temporary demonstration data while the live task register is being connected.
                                </p>
                            </div>

                            <Button
                                type="button"
                                disabled
                                title="Task creation will be enabled once the database migration is active."
                            >
                                <PlusCircle className="size-4 mr-2" />
                                Add Task
                            </Button>
                        </div>

                        <div className="relative max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search projects and tasks..."
                                className="pl-9"
                            />
                        </div>
                    </CardHeader>

                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-muted-foreground">
                                        <th className="py-3 pr-4 font-medium">
                                            Project / Task
                                        </th>
                                        <th className="py-3 pr-4 font-medium">
                                            Status
                                        </th>
                                        <th className="py-3 pr-4 font-medium">
                                            Priority
                                        </th>
                                        <th className="py-3 pr-4 font-medium">
                                            Site / Asset
                                        </th>
                                        <th className="py-3 pr-4 font-medium">
                                            Owner
                                        </th>
                                        <th className="py-3 font-medium">
                                            Due
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {filteredTasks.map((task) => (
                                        <tr
                                            key={task.id}
                                            className="border-b last:border-0 align-top"
                                        >
                                            <td className="py-4 pr-4 min-w-[320px]">
                                                <div className="font-medium">
                                                    {task.title}
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-1 max-w-xl">
                                                    {task.description}
                                                </div>
                                            </td>

                                            <td className="py-4 pr-4 whitespace-nowrap">
                                                <Badge variant={statusVariant(task.status)}>
                                                    {statusLabel[task.status]}
                                                </Badge>
                                            </td>

                                            <td className="py-4 pr-4 whitespace-nowrap">
                                                <Badge
                                                    variant={
                                                        task.priority === "urgent" ||
                                                        task.priority === "high"
                                                            ? "destructive"
                                                            : "outline"
                                                    }
                                                >
                                                    {priorityLabel[task.priority]}
                                                </Badge>
                                            </td>

                                            <td className="py-4 pr-4 min-w-[180px]">
                                                <div>{task.location}</div>
                                                {task.asset && (
                                                    <div className="text-xs text-muted-foreground mt-1">
                                                        {task.asset}
                                                    </div>
                                                )}
                                            </td>

                                            <td className="py-4 pr-4 whitespace-nowrap">
                                                {task.owner}
                                            </td>

                                            <td className="py-4 whitespace-nowrap">
                                                {task.dueDate || "—"}
                                            </td>
                                        </tr>
                                    ))}

                                    {filteredTasks.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={6}
                                                className="py-12 text-center text-muted-foreground"
                                            >
                                                No tasks match your search.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                    <span>
                        Demo mode: these example tasks are not stored in the database yet.
                        Live create, edit, status updates, comments and site/asset linking will
                        be enabled once the Supabase migration is applied.
                    </span>
                </div>
            </PageShell>
        </DashboardLayout>
    )
}
