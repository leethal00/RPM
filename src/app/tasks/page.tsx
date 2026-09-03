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
    actionWith: string
}

const DEMO_TASKS: DemoTask[] = [
    {
        id: "1",
        title: "Pylon head design & costing",
        description:
            "Develop pylon head design and costing for New Zealand manufacture, including PS1 compliance requirements.",
        status: "in_progress",
        priority: "high",
        location: "Nationwide",
        actionWith: "Rodier",
        dueDate: "18 Sep 2026",
    },
    {
        id: "2",
        title: "Height restrictor hanging bar replacement programme",
        description:
            "Develop a nationwide replacement programme for height restrictor hanging bars.",
        status: "in_progress",
        priority: "high",
        location: "Nationwide",
        actionWith: "Rodier",
        dueDate: "25 Sep 2026",
    },
    {
        id: "3",
        title: "Custom directional sign design & quote",
        description:
            "Prepare custom directional sign design and quotation for McDonald's Greenlane.",
        status: "new",
        priority: "normal",
        location: "McDonald's Greenlane",
        asset: "Directional Sign",
        actionWith: "Rodier",
    },
    {
        id: "4",
        title: "Schedule repairs around drive-thru shutdown",
        description:
            "Confirm repair dates to align with the scheduled drive-thru shutdown.",
        status: "waiting_client",
        priority: "high",
        location: "McDonald's Papakura",
        actionWith: "McDonald's",
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
                task.actionWith,
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
                                    Current project leads, actions and follow-up items.
                                </p>
                            </div>

                            <Button
                                type="button"
                                disabled
                                title="Task creation will be enabled once the live task register is connected."
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
                                            Action With
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
                                                {task.actionWith}
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
            </PageShell>
        </DashboardLayout>
    )
}
