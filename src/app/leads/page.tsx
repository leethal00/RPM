"use client"

import { useState } from "react"
import { ClipboardList, Plus } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

export default function LeadsPage() {
    const [open, setOpen] = useState(false)

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 p-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-sm text-muted-foreground">
                            Job & Project Management
                        </p>

                        <h1 className="text-3xl font-bold tracking-tight">
                            Leads & To Do
                        </h1>

                        <p className="mt-2 text-muted-foreground">
                            Capture incoming work, follow-ups and tasks before
                            they become quotes or jobs.
                        </p>
                    </div>

                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="mr-2 size-4" />
                                Add item
                            </Button>
                        </DialogTrigger>

                        <DialogContent className="sm:max-w-[620px]">
                            <DialogHeader>
                                <DialogTitle>Add lead or to-do</DialogTitle>
                                <DialogDescription>
                                    Capture the work now. We will connect this
                                    form to RPM once the layout is confirmed.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="grid gap-4 py-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="lead-title">
                                        Title
                                    </Label>
                                    <Input
                                        id="lead-title"
                                        placeholder="e.g. Price replacement pylon face"
                                    />
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label htmlFor="lead-customer">
                                            Customer
                                        </Label>
                                        <Input
                                            id="lead-customer"
                                            placeholder="Select customer later"
                                        />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="lead-site">
                                            Site
                                        </Label>
                                        <Input
                                            id="lead-site"
                                            placeholder="Optional site"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label htmlFor="lead-assigned">
                                            Assigned to
                                        </Label>
                                        <Input
                                            id="lead-assigned"
                                            placeholder="Select person later"
                                        />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="lead-due">
                                            Due date
                                        </Label>
                                        <Input
                                            id="lead-due"
                                            type="date"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label>Priority</Label>
                                        <Select defaultValue="normal">
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="low">
                                                    Low
                                                </SelectItem>
                                                <SelectItem value="normal">
                                                    Normal
                                                </SelectItem>
                                                <SelectItem value="high">
                                                    High
                                                </SelectItem>
                                                <SelectItem value="urgent">
                                                    Urgent
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="grid gap-2">
                                        <Label>Status</Label>
                                        <Select defaultValue="new">
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="new">
                                                    New
                                                </SelectItem>
                                                <SelectItem value="todo">
                                                    To Do
                                                </SelectItem>
                                                <SelectItem value="in_progress">
                                                    In Progress
                                                </SelectItem>
                                                <SelectItem value="waiting">
                                                    Waiting
                                                </SelectItem>
                                                <SelectItem value="done">
                                                    Done
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="lead-notes">
                                        Notes
                                    </Label>
                                    <textarea
                                        id="lead-notes"
                                        rows={5}
                                        placeholder="Add details, contact names, follow-up notes or the original voice note transcript..."
                                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                                    />
                                </div>
                            </div>

                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    onClick={() => setOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button disabled>
                                    Save item
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="rounded-lg border bg-card p-10 text-center">
                    <ClipboardList className="mx-auto mb-4 size-10 text-muted-foreground" />

                    <h2 className="text-lg font-semibold">
                        No leads or tasks yet
                    </h2>

                    <p className="mt-2 text-sm text-muted-foreground">
                        Your incoming leads and to-do items will appear here.
                    </p>
                </div>
            </div>
        </DashboardLayout>
    )
}
