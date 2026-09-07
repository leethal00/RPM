"use client"

import { useEffect, useMemo, useState } from "react"
import { ClipboardList, Plus } from "lucide-react"
import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
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

type CustomerOption = {
    id: string
    name: string
}

type SiteOption = {
    id: string
    name: string
    client_id: string | null
}

type UserOption = {
    id: string
    name: string | null
    email: string | null
    role: string | null
}

export default function LeadsPage() {
    const supabase = useMemo(() => createClient(), [])
    const [open, setOpen] = useState(false)

    const [customers, setCustomers] = useState<CustomerOption[]>([])
    const [sites, setSites] = useState<SiteOption[]>([])
    const [users, setUsers] = useState<UserOption[]>([])
    const [loadingOptions, setLoadingOptions] = useState(true)

    const [customerId, setCustomerId] = useState("")
    const [siteId, setSiteId] = useState("")
    const [assignedTo, setAssignedTo] = useState("")
    const [newCustomerName, setNewCustomerName] = useState("")

    useEffect(() => {
        async function loadOptions() {
            setLoadingOptions(true)

            const [customersResult, sitesResult, usersResult] =
                await Promise.all([
                    supabase
                        .from("clients")
                        .select("id, name")
                        .eq("active", true)
                        .order("name"),

                    supabase
                        .from("stores")
                        .select("id, name, client_id")
                        .order("name"),

                    supabase
                        .from("users")
                        .select("id, name, email, role")
                        .order("name"),
                ])

            if (!customersResult.error) {
                setCustomers(
                    (customersResult.data ?? []) as CustomerOption[]
                )
            }

            if (!sitesResult.error) {
                setSites((sitesResult.data ?? []) as SiteOption[])
            }

            if (!usersResult.error) {
                const internalUsers = (
                    (usersResult.data ?? []) as UserOption[]
                ).filter(
                    (user) =>
                        !["client_hq", "client_store"].includes(
                            user.role ?? ""
                        )
                )

                setUsers(internalUsers)
            }

            setLoadingOptions(false)
        }

        loadOptions()
    }, [supabase])

    const filteredSites =
        customerId && customerId !== "__new__"
            ? sites.filter(
                  (site) => site.client_id === customerId
              )
            : []

    function handleCustomerChange(value: string) {
        setCustomerId(value)
        setSiteId("")

        if (value !== "__new__") {
            setNewCustomerName("")
        }
    }

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
                            Capture incoming work, follow-ups and tasks
                            before they become quotes or jobs.
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
                                <DialogTitle>
                                    Add lead or to-do
                                </DialogTitle>

                                <DialogDescription>
                                    Capture incoming work quickly.
                                    Existing RPM customers, sites and
                                    staff are available below.
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
                                        <Label>Customer</Label>

                                        <Select
                                            value={customerId}
                                            onValueChange={
                                                handleCustomerChange
                                            }
                                            disabled={loadingOptions}
                                        >
                                            <SelectTrigger>
                                                <SelectValue
                                                    placeholder={
                                                        loadingOptions
                                                            ? "Loading customers..."
                                                            : "Select customer"
                                                    }
                                                />
                                            </SelectTrigger>

                                            <SelectContent>
                                                <SelectItem value="__new__">
                                                    + Add new customer
                                                </SelectItem>

                                                {customers.map(
                                                    (customer) => (
                                                        <SelectItem
                                                            key={
                                                                customer.id
                                                            }
                                                            value={
                                                                customer.id
                                                            }
                                                        >
                                                            {
                                                                customer.name
                                                            }
                                                        </SelectItem>
                                                    )
                                                )}
                                            </SelectContent>
                                        </Select>

                                        {customerId === "__new__" && (
                                            <Input
                                                value={newCustomerName}
                                                onChange={(e) =>
                                                    setNewCustomerName(
                                                        e.target.value
                                                    )
                                                }
                                                placeholder="New customer name"
                                                autoFocus
                                            />
                                        )}
                                    </div>

                                    <div className="grid gap-2">
                                        <Label>Site</Label>

                                        <Select
                                            value={siteId}
                                            onValueChange={setSiteId}
                                            disabled={
                                                loadingOptions ||
                                                !customerId ||
                                                customerId ===
                                                    "__new__"
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue
                                                    placeholder={
                                                        customerId ===
                                                        "__new__"
                                                            ? "Add site later"
                                                            : customerId
                                                            ? "Optional site"
                                                            : "Select customer first"
                                                    }
                                                />
                                            </SelectTrigger>

                                            <SelectContent>
                                                {filteredSites.map(
                                                    (site) => (
                                                        <SelectItem
                                                            key={
                                                                site.id
                                                            }
                                                            value={
                                                                site.id
                                                            }
                                                        >
                                                            {site.name}
                                                        </SelectItem>
                                                    )
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label>
                                            Assigned to
                                        </Label>

                                        <Select
                                            value={assignedTo}
                                            onValueChange={
                                                setAssignedTo
                                            }
                                            disabled={loadingOptions}
                                        >
                                            <SelectTrigger>
                                                <SelectValue
                                                    placeholder={
                                                        loadingOptions
                                                            ? "Loading staff..."
                                                            : "Optional assignee"
                                                    }
                                                />
                                            </SelectTrigger>

                                            <SelectContent>
                                                {users.map((user) => (
                                                    <SelectItem
                                                        key={user.id}
                                                        value={user.id}
                                                    >
                                                        {user.name ||
                                                            user.email ||
                                                            "Unnamed user"}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
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
