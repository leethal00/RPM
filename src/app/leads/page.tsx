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

type WorkItem = {
    id: string
    title: string
    description: string | null
    client_id: string | null
    store_id: string | null
    assigned_to: string | null
    priority: string
    status: string
    due_date: string | null
    created_at: string
}

export default function LeadsPage() {
    const supabase = useMemo(() => createClient(), [])

    const [open, setOpen] = useState(false)
    const [editingItem, setEditingItem] =
        useState<WorkItem | null>(null)

    const [customers, setCustomers] =
        useState<CustomerOption[]>([])
    const [sites, setSites] = useState<SiteOption[]>([])
    const [users, setUsers] = useState<UserOption[]>([])
    const [items, setItems] = useState<WorkItem[]>([])

    const [loadingOptions, setLoadingOptions] =
        useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState("")

    const [title, setTitle] = useState("")
    const [customerId, setCustomerId] = useState("")
    const [newCustomerName, setNewCustomerName] =
        useState("")
    const [siteId, setSiteId] = useState("")
    const [assignedTo, setAssignedTo] = useState("")
    const [dueDate, setDueDate] = useState("")
    const [priority, setPriority] = useState("normal")
    const [status, setStatus] = useState("new")
    const [notes, setNotes] = useState("")

    async function loadData() {
        setLoadingOptions(true)

        const [
            customersResult,
            sitesResult,
            usersResult,
            itemsResult,
        ] = await Promise.all([
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

            supabase
                .from("internal_work_items")
                .select(
                    "id, title, description, client_id, store_id, assigned_to, priority, status, due_date, created_at"
                )
                .order("created_at", {
                    ascending: false,
                }),
        ])

        if (!customersResult.error) {
            setCustomers(
                (customersResult.data ??
                    []) as CustomerOption[]
            )
        }

        if (!sitesResult.error) {
            setSites(
                (sitesResult.data ?? []) as SiteOption[]
            )
        }

        if (!usersResult.error) {
            const internalUsers = (
                (usersResult.data ??
                    []) as UserOption[]
            ).filter(
                (user) =>
                    ![
                        "client_hq",
                        "client_store",
                    ].includes(user.role ?? "")
            )

            setUsers(internalUsers)
        }

        if (!itemsResult.error) {
            setItems(
                (itemsResult.data ?? []) as WorkItem[]
            )
        }

        setLoadingOptions(false)
    }

    useEffect(() => {
        loadData()
    }, [])

    const filteredSites =
        customerId && customerId !== "__new__"
            ? sites.filter(
                  (site) =>
                      site.client_id === customerId
              )
            : []

    function handleCustomerChange(value: string) {
        setCustomerId(value)
        setSiteId("")

        if (value !== "__new__") {
            setNewCustomerName("")
        }
    }

    function resetForm() {
        setEditingItem(null)
        setTitle("")
        setCustomerId("")
        setNewCustomerName("")
        setSiteId("")
        setAssignedTo("")
        setDueDate("")
        setPriority("normal")
        setStatus("new")
        setNotes("")
        setError("")
    }

    function handleEdit(item: WorkItem) {
        setEditingItem(item)
        setTitle(item.title)
        setCustomerId(item.client_id ?? "")
        setNewCustomerName("")
        setSiteId(item.store_id ?? "")
        setAssignedTo(item.assigned_to ?? "")
        setDueDate(item.due_date ?? "")
        setPriority(item.priority)
        setStatus(item.status)
        setNotes(item.description ?? "")
        setError("")
        setOpen(true)
    }

    function customerName(id: string | null) {
        if (!id) return "No customer"

        return (
            customers.find(
                (customer) => customer.id === id
            )?.name ?? "Customer"
        )
    }

    function siteName(id: string | null) {
        if (!id) return null

        return (
            sites.find((site) => site.id === id)
                ?.name ?? "Site"
        )
    }

    function assignedName(id: string | null) {
        if (!id) return "Unassigned"

        const user = users.find(
            (person) => person.id === id
        )

        return (
            user?.name ||
            user?.email ||
            "Assigned"
        )
    }

    function statusLabel(value: string) {
        const labels: Record<string, string> = {
            new: "New",
            todo: "To Do",
            in_progress: "In Progress",
            waiting: "Waiting",
            done: "Done",
            converted: "Converted",
        }

        return labels[value] ?? value
    }

    async function handleSave() {
        setError("")

        const cleanTitle = title.trim()
        const cleanCustomerName =
            newCustomerName.trim()

        if (!cleanTitle) {
            setError("Please enter a title.")
            return
        }

        if (
            customerId === "__new__" &&
            !cleanCustomerName
        ) {
            setError(
                "Please enter the new customer name."
            )
            return
        }

        setSaving(true)

        try {
            let finalCustomerId =
                customerId &&
                customerId !== "__new__"
                    ? customerId
                    : null

            if (customerId === "__new__") {
                const existingCustomer =
                    customers.find(
                        (customer) =>
                            customer.name
                                .trim()
                                .toLowerCase() ===
                            cleanCustomerName.toLowerCase()
                    )

                if (existingCustomer) {
                    finalCustomerId =
                        existingCustomer.id
                } else {
                    const {
                        data: newCustomer,
                        error: customerError,
                    } = await supabase
                        .from("clients")
                        .insert({
                            name: cleanCustomerName,
                            active: true,
                        })
                        .select("id, name")
                        .single()

                    if (customerError) {
                        throw new Error(
                            `Could not create customer: ${customerError.message}`
                        )
                    }

                    finalCustomerId =
                        newCustomer.id

                    setCustomers((current) =>
                        [
                            ...current,
                            newCustomer,
                        ].sort((a, b) =>
                            a.name.localeCompare(
                                b.name
                            )
                        )
                    )
                }
            }

            const {
                data: { user },
                error: authError,
            } = await supabase.auth.getUser()

            if (authError || !user) {
                throw new Error(
                    "Could not identify the logged-in RPM user."
                )
            }

            const itemValues = {
                title: cleanTitle,
                description:
                    notes.trim() || null,
                client_id: finalCustomerId,
                store_id: siteId || null,
                assigned_to:
                    assignedTo || null,
                priority,
                status,
                due_date: dueDate || null,
                source: "manual",
                original_note:
                    notes.trim() || null,
                updated_at:
                    new Date().toISOString(),
            }

            const query = editingItem
                ? supabase
                      .from(
                          "internal_work_items"
                      )
                      .update(itemValues)
                      .eq(
                          "id",
                          editingItem.id
                      )
                : supabase
                      .from(
                          "internal_work_items"
                      )
                      .insert({
                          ...itemValues,
                          created_by: user.id,
                      })

            const {
                data: savedItem,
                error: itemError,
            } = await query
                .select(
                    "id, title, description, client_id, store_id, assigned_to, priority, status, due_date, created_at"
                )
                .single()

            if (itemError) {
                throw new Error(
                    `Could not save lead: ${itemError.message}`
                )
            }

            if (editingItem) {
                setItems((current) =>
                    current.map((item) =>
                        item.id ===
                        editingItem.id
                            ? (savedItem as WorkItem)
                            : item
                    )
                )
            } else {
                setItems((current) => [
                    savedItem as WorkItem,
                    ...current,
                ])
            }

            resetForm()
            setOpen(false)
        } catch (saveError) {
            setError(
                saveError instanceof Error
                    ? saveError.message
                    : "Something went wrong while saving."
            )
        } finally {
            setSaving(false)
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
                            Capture incoming work,
                            follow-ups and tasks before
                            they become quotes or jobs.
                        </p>
                    </div>

                    <Dialog
                        open={open}
                        onOpenChange={(value) => {
                            setOpen(value)

                            if (
                                !value &&
                                !saving
                            ) {
                                resetForm()
                            }
                        }}
                    >
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="mr-2 size-4" />
                                Add item
                            </Button>
                        </DialogTrigger>

                        <DialogContent className="sm:max-w-[620px]">
                            <DialogHeader>
                                <DialogTitle>
                                    {editingItem
                                        ? "Edit lead or to-do"
                                        : "Add lead or to-do"}
                                </DialogTitle>

                                <DialogDescription>
                                    {editingItem
                                        ? "Update the existing lead or to-do item."
                                        : "Capture incoming work quickly. Existing RPM customers, sites and staff are available below."}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="grid gap-4 py-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="lead-title">
                                        Title
                                    </Label>

                                    <Input
                                        id="lead-title"
                                        value={title}
                                        onChange={(e) =>
                                            setTitle(
                                                e.target
                                                    .value
                                            )
                                        }
                                        placeholder="e.g. Price replacement pylon face"
                                    />
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label>
                                            Customer
                                        </Label>

                                        <Select
                                            value={
                                                customerId
                                            }
                                            onValueChange={
                                                handleCustomerChange
                                            }
                                            disabled={
                                                loadingOptions
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue
                                                    placeholder={
                                                        loadingOptions
                                                            ? "Loading customers..."
                                                            : "Optional customer"
                                                    }
                                                />
                                            </SelectTrigger>

                                            <SelectContent>
                                                <SelectItem value="__new__">
                                                    + Add
                                                    new
                                                    customer
                                                </SelectItem>

                                                {customers.map(
                                                    (
                                                        customer
                                                    ) => (
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

                                        {customerId ===
                                            "__new__" && (
                                            <Input
                                                value={
                                                    newCustomerName
                                                }
                                                onChange={(
                                                    e
                                                ) =>
                                                    setNewCustomerName(
                                                        e
                                                            .target
                                                            .value
                                                    )
                                                }
                                                placeholder="New customer name"
                                                autoFocus
                                            />
                                        )}
                                    </div>

                                    <div className="grid gap-2">
                                        <Label>
                                            Site
                                        </Label>

                                        <Select
                                            value={
                                                siteId
                                            }
                                            onValueChange={
                                                setSiteId
                                            }
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
                                                    (
                                                        site
                                                    ) => (
                                                        <SelectItem
                                                            key={
                                                                site.id
                                                            }
                                                            value={
                                                                site.id
                                                            }
                                                        >
                                                            {
                                                                site.name
                                                            }
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
                                            value={
                                                assignedTo
                                            }
                                            onValueChange={
                                                setAssignedTo
                                            }
                                            disabled={
                                                loadingOptions
                                            }
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
                                                {users.map(
                                                    (
                                                        user
                                                    ) => (
                                                        <SelectItem
                                                            key={
                                                                user.id
                                                            }
                                                            value={
                                                                user.id
                                                            }
                                                        >
                                                            {user.name ||
                                                                user.email ||
                                                                "Unnamed user"}
                                                        </SelectItem>
                                                    )
                                                )}
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
                                            value={
                                                dueDate
                                            }
                                            onChange={(
                                                e
                                            ) =>
                                                setDueDate(
                                                    e
                                                        .target
                                                        .value
                                                )
                                            }
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label>
                                            Priority
                                        </Label>

                                        <Select
                                            value={
                                                priority
                                            }
                                            onValueChange={
                                                setPriority
                                            }
                                        >
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
                                        <Label>
                                            Status
                                        </Label>

                                        <Select
                                            value={
                                                status
                                            }
                                            onValueChange={
                                                setStatus
                                            }
                                        >
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
                                                    In
                                                    Progress
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
                                        value={notes}
                                        onChange={(e) =>
                                            setNotes(
                                                e.target
                                                    .value
                                            )
                                        }
                                        placeholder="Add details, contact names, follow-up notes or the original voice note transcript..."
                                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                                    />
                                </div>

                                {error && (
                                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                        {error}
                                    </div>
                                )}
                            </div>

                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    disabled={
                                        saving
                                    }
                                    onClick={() =>
                                        setOpen(
                                            false
                                        )
                                    }
                                >
                                    Cancel
                                </Button>

                                <Button
                                    onClick={
                                        handleSave
                                    }
                                    disabled={
                                        saving
                                    }
                                >
                                    {saving
                                        ? "Saving..."
                                        : editingItem
                                        ? "Save changes"
                                        : "Save item"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                {items.length === 0 ? (
                    <div className="rounded-lg border bg-card p-10 text-center">
                        <ClipboardList className="mx-auto mb-4 size-10 text-muted-foreground" />

                        <h2 className="text-lg font-semibold">
                            No leads or tasks yet
                        </h2>

                        <p className="mt-2 text-sm text-muted-foreground">
                            Your incoming leads
                            and to-do items will
                            appear here.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-lg border bg-card">
                        <div className="min-w-[1050px]">
                            <div className="grid grid-cols-[minmax(280px,2fr)_minmax(160px,1fr)_120px_90px_140px_80px] gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
                                <div>
                                    Lead / To Do
                                </div>
                                <div>
                                    Customer / Site
                                </div>
                                <div>
                                    Assigned To
                                </div>
                                <div>
                                    Priority
                                </div>
                                <div>
                                    Status / Due
                                </div>
                                <div>
                                    Actions
                                </div>
                            </div>

                            {items.map(
                                (item) => (
                                    <div
                                        key={
                                            item.id
                                        }
                                        className="grid grid-cols-[minmax(280px,2fr)_minmax(160px,1fr)_120px_90px_140px_80px] gap-4 border-b px-4 py-4 text-sm last:border-b-0"
                                    >
                                        <div>
                                            <div className="font-medium">
                                                {
                                                    item.title
                                                }
                                            </div>

                                            {item.description && (
                                                <div className="mt-1 line-clamp-2 text-muted-foreground">
                                                    {
                                                        item.description
                                                    }
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <div>
                                                {customerName(
                                                    item.client_id
                                                )}
                                            </div>

                                            {siteName(
                                                item.store_id
                                            ) && (
                                                <div className="text-muted-foreground">
                                                    {siteName(
                                                        item.store_id
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            {assignedName(
                                                item.assigned_to
                                            )}
                                        </div>

                                        <div className="capitalize">
                                            {
                                                item.priority
                                            }
                                        </div>

                                        <div>
                                            <div>
                                                {statusLabel(
                                                    item.status
                                                )}
                                            </div>

                                            {item.due_date && (
                                                <div className="mt-1 text-muted-foreground">
                                                    Due{" "}
                                                    {new Date(
                                                        `${item.due_date}T00:00:00`
                                                    ).toLocaleDateString(
                                                        "en-NZ"
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    handleEdit(
                                                        item
                                                    )
                                                }
                                            >
                                                Edit
                                            </Button>
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    )
}
