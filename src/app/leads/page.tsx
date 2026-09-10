"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ClipboardList, Loader2, Plus, X } from "lucide-react"
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
    converted_costing_job_id: string | null
    created_at: string
}

type SortMode = "newest" | "oldest" | "due" | "title"

const WORK_ITEM_SELECT =
    "id, title, description, client_id, store_id, assigned_to, priority, status, due_date, converted_costing_job_id, created_at"

export default function LeadsPage() {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()

    const [open, setOpen] = useState(false)
    const [editingItem, setEditingItem] = useState<WorkItem | null>(null)

    const [customers, setCustomers] = useState<CustomerOption[]>([])
    const [sites, setSites] = useState<SiteOption[]>([])
    const [users, setUsers] = useState<UserOption[]>([])
    const [items, setItems] = useState<WorkItem[]>([])
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)

    const [loadingOptions, setLoadingOptions] = useState(true)
    const [saving, setSaving] = useState(false)
    const [converting, setConverting] = useState(false)
    const [error, setError] = useState("")

    const [title, setTitle] = useState("")
    const [customerId, setCustomerId] = useState("")
    const [newCustomerName, setNewCustomerName] = useState("")
    const [siteId, setSiteId] = useState("")
    const [assignedTo, setAssignedTo] = useState("")
    const [dueDate, setDueDate] = useState("")
    const [priority, setPriority] = useState("normal")
    const [status, setStatus] = useState("new")
    const [notes, setNotes] = useState("")

    const [customerFilter, setCustomerFilter] = useState("all")
    const [assigneeFilter, setAssigneeFilter] = useState("all")
    const [priorityFilter, setPriorityFilter] = useState("all")
    const [statusFilter, setStatusFilter] = useState("all")
    const [sortMode, setSortMode] = useState<SortMode>("newest")

    async function loadData() {
        setLoadingOptions(true)

        const [customersResult, sitesResult, usersResult, itemsResult, authResult] =
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
                supabase
                    .from("internal_work_items")
                    .select(WORK_ITEM_SELECT)
                    .order("created_at", { ascending: false }),
                supabase.auth.getUser(),
            ])

        if (!customersResult.error) {
            setCustomers((customersResult.data ?? []) as CustomerOption[])
        }

        if (!sitesResult.error) {
            setSites((sitesResult.data ?? []) as SiteOption[])
        }

        if (!usersResult.error) {
            const internalUsers = ((usersResult.data ?? []) as UserOption[]).filter(
                (user) => !["client_hq", "client_store"].includes(user.role ?? "")
            )
            setUsers(internalUsers)
        }

        if (!itemsResult.error) {
            setItems((itemsResult.data ?? []) as WorkItem[])
        }

        if (!authResult.error && authResult.data.user) {
            setCurrentUserId(authResult.data.user.id)
        }

        setLoadingOptions(false)
    }

    useEffect(() => {
        loadData()
    }, [])

    const filteredSites =
        customerId && customerId !== "__new__"
            ? sites.filter((site) => site.client_id === customerId)
            : []

    const visibleItems = useMemo(() => {
        const filtered = items.filter((item) => {
            if (
                customerFilter !== "all" &&
                (customerFilter === "__none__"
                    ? item.client_id !== null
                    : item.client_id !== customerFilter)
            ) {
                return false
            }

            if (assigneeFilter !== "all") {
                if (assigneeFilter === "mine") {
                    if (!currentUserId || item.assigned_to !== currentUserId) return false
                } else if (assigneeFilter === "__unassigned__") {
                    if (item.assigned_to !== null) return false
                } else if (item.assigned_to !== assigneeFilter) {
                    return false
                }
            }

            if (priorityFilter !== "all" && item.priority !== priorityFilter) {
                return false
            }

            if (statusFilter !== "all" && item.status !== statusFilter) {
                return false
            }

            return true
        })

        return [...filtered].sort((a, b) => {
            if (sortMode === "oldest") {
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            }

            if (sortMode === "title") {
                return a.title.localeCompare(b.title)
            }

            if (sortMode === "due") {
                if (!a.due_date && !b.due_date) return 0
                if (!a.due_date) return 1
                if (!b.due_date) return -1
                return a.due_date.localeCompare(b.due_date)
            }

            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
    }, [
        items,
        customerFilter,
        assigneeFilter,
        priorityFilter,
        statusFilter,
        sortMode,
        currentUserId,
    ])

    const hasFilters =
        customerFilter !== "all" ||
        assigneeFilter !== "all" ||
        priorityFilter !== "all" ||
        statusFilter !== "all" ||
        sortMode !== "newest"

    function clearFilters() {
        setCustomerFilter("all")
        setAssigneeFilter("all")
        setPriorityFilter("all")
        setStatusFilter("all")
        setSortMode("newest")
    }

    function handleCustomerChange(value: string) {
        setCustomerId(value)
        setSiteId("")
        if (value !== "__new__") setNewCustomerName("")
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

    function handleOpen(item: WorkItem) {
        if (item.status === "converted" && item.converted_costing_job_id) {
            router.push(`/quoting/${item.converted_costing_job_id}`)
            return
        }

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
        return customers.find((customer) => customer.id === id)?.name ?? "Customer"
    }

    function siteName(id: string | null) {
        if (!id) return null
        return sites.find((site) => site.id === id)?.name ?? "Site"
    }

    function assignedName(id: string | null) {
        if (!id) return "Unassigned"
        const user = users.find((person) => person.id === id)
        return user?.name || user?.email || "Assigned"
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
        const cleanCustomerName = newCustomerName.trim()

        if (!cleanTitle) {
            setError("Please enter a title.")
            return
        }

        if (customerId === "__new__" && !cleanCustomerName) {
            setError("Please enter the new customer name.")
            return
        }

        setSaving(true)

        try {
            let finalCustomerId =
                customerId && customerId !== "__new__" ? customerId : null

            if (customerId === "__new__") {
                const existingCustomer = customers.find(
                    (customer) =>
                        customer.name.trim().toLowerCase() === cleanCustomerName.toLowerCase()
                )

                if (existingCustomer) {
                    finalCustomerId = existingCustomer.id
                } else {
                    const { data: newCustomer, error: customerError } = await supabase
                        .from("clients")
                        .insert({ name: cleanCustomerName, active: true })
                        .select("id, name")
                        .single()

                    if (customerError) {
                        throw new Error(`Could not create customer: ${customerError.message}`)
                    }

                    finalCustomerId = newCustomer.id
                    setCustomers((current) =>
                        [...current, newCustomer].sort((a, b) => a.name.localeCompare(b.name))
                    )
                }
            }

            const {
                data: { user },
                error: authError,
            } = await supabase.auth.getUser()

            if (authError || !user) {
                throw new Error("Could not identify the logged-in RPM user.")
            }

            const itemValues = {
                title: cleanTitle,
                description: notes.trim() || null,
                client_id: finalCustomerId,
                store_id: siteId || null,
                assigned_to: assignedTo || null,
                priority,
                status,
                due_date: dueDate || null,
                source: "manual",
                original_note: notes.trim() || null,
                updated_at: new Date().toISOString(),
            }

            const query = editingItem
                ? supabase
                      .from("internal_work_items")
                      .update(itemValues)
                      .eq("id", editingItem.id)
                : supabase
                      .from("internal_work_items")
                      .insert({ ...itemValues, created_by: user.id })

            const { data: savedItem, error: itemError } = await query
                .select(WORK_ITEM_SELECT)
                .single()

            if (itemError) {
                throw new Error(`Could not save lead: ${itemError.message}`)
            }

            if (editingItem) {
                setItems((current) =>
                    current.map((item) =>
                        item.id === editingItem.id ? (savedItem as WorkItem) : item
                    )
                )
            } else {
                setItems((current) => [savedItem as WorkItem, ...current])
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

    async function handleCreateQuote() {
        if (!editingItem) return

        setError("")
        const cleanTitle = title.trim()

        if (!cleanTitle) {
            setError("Please enter a title before creating the quote.")
            return
        }

        if (customerId === "__new__") {
            setError("Save the new customer first, then create the quote.")
            return
        }

        setConverting(true)

        try {
            const {
                data: { user },
                error: authError,
            } = await supabase.auth.getUser()

            if (authError || !user) {
                throw new Error("Could not identify the logged-in RPM user.")
            }

            const { data: quote, error: quoteError } = await supabase
                .from("costing_jobs")
                .insert({
                    title: cleanTitle,
                    reference: null,
                    qty: 1,
                    client_id: customerId || null,
                    store_id: siteId || null,
                    details: notes.trim() || null,
                    created_by: user.id,
                    quoted_by: user.id,
                })
                .select("id")
                .single()

            if (quoteError || !quote) {
                throw new Error(
                    `Could not create quote: ${quoteError?.message ?? "Unknown error"}`
                )
            }

            const { error: costingItemError } = await supabase
                .from("costing_items")
                .insert({
                    job_id: quote.id,
                    name: cleanTitle,
                    mode: "build",
                    qty: 1,
                    sort: 0,
                })

            if (costingItemError) {
                throw new Error(
                    `Quote was created, but its first costing item could not be added: ${costingItemError.message}`
                )
            }

            const convertedValues = {
                title: cleanTitle,
                description: notes.trim() || null,
                client_id: customerId || null,
                store_id: siteId || null,
                assigned_to: assignedTo || null,
                priority,
                status: "converted",
                due_date: dueDate || null,
                source: "manual",
                original_note: notes.trim() || null,
                converted_costing_job_id: quote.id,
                updated_at: new Date().toISOString(),
            }

            const { data: convertedItem, error: convertError } = await supabase
                .from("internal_work_items")
                .update(convertedValues)
                .eq("id", editingItem.id)
                .select(WORK_ITEM_SELECT)
                .single()

            if (convertError) {
                throw new Error(
                    `Quote created, but the lead could not be marked converted: ${convertError.message}`
                )
            }

            setItems((current) =>
                current.map((item) =>
                    item.id === editingItem.id ? (convertedItem as WorkItem) : item
                )
            )

            setOpen(false)
            router.push(`/quoting/${quote.id}`)
        } catch (convertError) {
            setError(
                convertError instanceof Error
                    ? convertError.message
                    : "Something went wrong while creating the quote."
            )
        } finally {
            setConverting(false)
        }
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs text-muted-foreground">
                            Job & Project Management
                        </p>
                        <h1 className="text-2xl font-bold tracking-tight">Leads & To Do</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Capture incoming work, follow-ups and tasks before they become quotes or jobs.
                        </p>
                    </div>

                    <Dialog
                        open={open}
                        onOpenChange={(value) => {
                            setOpen(value)
                            if (!value && !saving && !converting) resetForm()
                        }}
                    >
                        <DialogTrigger asChild>
                            <Button size="sm">
                                <Plus className="mr-1.5 size-3.5" />
                                Add item
                            </Button>
                        </DialogTrigger>

                        <DialogContent className="sm:max-w-[620px]">
                            <DialogHeader>
                                <DialogTitle>
                                    {editingItem ? "Edit lead or to-do" : "Add lead or to-do"}
                                </DialogTitle>
                                <DialogDescription>
                                    {editingItem
                                        ? "Update the existing lead or to-do item, or turn it into a quote."
                                        : "Capture incoming work quickly. Existing RPM customers, sites and staff are available below."}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="grid gap-4 py-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="lead-title">Title</Label>
                                    <Input
                                        id="lead-title"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="e.g. Price replacement pylon face"
                                    />
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label>Customer</Label>
                                        <Select
                                            value={customerId}
                                            onValueChange={handleCustomerChange}
                                            disabled={loadingOptions}
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
                                                <SelectItem value="__new__">+ Add new customer</SelectItem>
                                                {customers.map((customer) => (
                                                    <SelectItem key={customer.id} value={customer.id}>
                                                        {customer.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {customerId === "__new__" && (
                                            <Input
                                                value={newCustomerName}
                                                onChange={(e) => setNewCustomerName(e.target.value)}
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
                                                customerId === "__new__"
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue
                                                    placeholder={
                                                        customerId === "__new__"
                                                            ? "Add site later"
                                                            : customerId
                                                            ? "Optional site"
                                                            : "Select customer first"
                                                    }
                                                />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {filteredSites.map((site) => (
                                                    <SelectItem key={site.id} value={site.id}>
                                                        {site.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label>Assigned to</Label>
                                        <Select
                                            value={assignedTo}
                                            onValueChange={setAssignedTo}
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
                                                    <SelectItem key={user.id} value={user.id}>
                                                        {user.name || user.email || "Unnamed user"}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="lead-due">Due date</Label>
                                        <Input
                                            id="lead-due"
                                            type="date"
                                            value={dueDate}
                                            onChange={(e) => setDueDate(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label>Priority</Label>
                                        <Select value={priority} onValueChange={setPriority}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="low">Low</SelectItem>
                                                <SelectItem value="normal">Normal</SelectItem>
                                                <SelectItem value="high">High</SelectItem>
                                                <SelectItem value="urgent">Urgent</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="grid gap-2">
                                        <Label>Status</Label>
                                        <Select value={status} onValueChange={setStatus}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="new">New</SelectItem>
                                                <SelectItem value="todo">To Do</SelectItem>
                                                <SelectItem value="in_progress">In Progress</SelectItem>
                                                <SelectItem value="waiting">Waiting</SelectItem>
                                                <SelectItem value="done">Done</SelectItem>
                                                <SelectItem value="converted">Converted</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="lead-notes">Notes</Label>
                                    <textarea
                                        id="lead-notes"
                                        rows={5}
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
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

                            <DialogFooter className="sm:justify-between">
                                <div>
                                    {editingItem && editingItem.status !== "converted" && (
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            onClick={handleCreateQuote}
                                            disabled={saving || converting}
                                        >
                                            {converting ? (
                                                <>
                                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                                    Creating quote...
                                                </>
                                            ) : (
                                                "Create Quote"
                                            )}
                                        </Button>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        disabled={saving || converting}
                                        onClick={() => setOpen(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button onClick={handleSave} disabled={saving || converting}>
                                        {saving
                                            ? "Saving..."
                                            : editingItem
                                            ? "Save changes"
                                            : "Save item"}
                                    </Button>
                                </div>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                {items.length === 0 ? (
                    <div className="rounded-lg border bg-card p-8 text-center">
                        <ClipboardList className="mx-auto mb-3 size-9 text-muted-foreground" />
                        <h2 className="text-base font-semibold">No leads or tasks yet</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Your incoming leads and to-do items will appear here.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-lg border bg-card">
                        <div className="min-w-[900px]">
                            <div className="grid grid-cols-[minmax(260px,2fr)_minmax(150px,1fr)_115px_80px_130px] gap-3 border-b bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase text-muted-foreground">
                                <div>Lead / To Do</div>
                                <div>Customer / Site</div>
                                <div>Assigned To</div>
                                <div>Priority</div>
                                <div>Status / Due</div>
                            </div>

                            <div className="grid grid-cols-[minmax(260px,2fr)_minmax(150px,1fr)_115px_80px_130px] gap-3 border-b bg-muted/20 px-3 py-1.5">
                                <Select
                                    value={sortMode}
                                    onValueChange={(value) => setSortMode(value as SortMode)}
                                >
                                    <SelectTrigger className="h-7 text-[11px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="newest">Newest first</SelectItem>
                                        <SelectItem value="oldest">Oldest first</SelectItem>
                                        <SelectItem value="due">Due date</SelectItem>
                                        <SelectItem value="title">Title A-Z</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select value={customerFilter} onValueChange={setCustomerFilter}>
                                    <SelectTrigger className="h-7 text-[11px]">
                                        <SelectValue placeholder="All customers" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All customers</SelectItem>
                                        <SelectItem value="__none__">No customer</SelectItem>
                                        {customers.map((customer) => (
                                            <SelectItem key={customer.id} value={customer.id}>
                                                {customer.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                                    <SelectTrigger className="h-7 text-[11px]">
                                        <SelectValue placeholder="All staff" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All staff</SelectItem>
                                        <SelectItem value="mine">My items</SelectItem>
                                        <SelectItem value="__unassigned__">Unassigned</SelectItem>
                                        {users.map((user) => (
                                            <SelectItem key={user.id} value={user.id}>
                                                {user.name || user.email || "Unnamed user"}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                                    <SelectTrigger className="h-7 text-[11px]">
                                        <SelectValue placeholder="All" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All</SelectItem>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="normal">Normal</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="urgent">Urgent</SelectItem>
                                    </SelectContent>
                                </Select>

                                <div className="flex gap-1.5">
                                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                                        <SelectTrigger className="h-7 min-w-0 flex-1 text-[11px]">
                                            <SelectValue placeholder="All statuses" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All statuses</SelectItem>
                                            <SelectItem value="new">New</SelectItem>
                                            <SelectItem value="todo">To Do</SelectItem>
                                            <SelectItem value="in_progress">In Progress</SelectItem>
                                            <SelectItem value="waiting">Waiting</SelectItem>
                                            <SelectItem value="done">Done</SelectItem>
                                            <SelectItem value="converted">Converted</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {hasFilters && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-7 shrink-0"
                                            onClick={clearFilters}
                                            title="Clear filters"
                                        >
                                            <X className="size-3.5" />
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {visibleItems.length === 0 ? (
                                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                                    No items match the selected filters.
                                </div>
                            ) : (
                                visibleItems.map((item) => (
                                    <div
                                        key={item.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => handleOpen(item)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault()
                                                handleOpen(item)
                                            }
                                        }}
                                        className="grid cursor-pointer grid-cols-[minmax(260px,2fr)_minmax(150px,1fr)_115px_80px_130px] gap-3 border-b px-3 py-2.5 text-xs transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset last:border-b-0"
                                    >
                                        <div>
                                            <div className="font-medium">{item.title}</div>
                                            {item.description && (
                                                <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                                                    {item.description}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <div>{customerName(item.client_id)}</div>
                                            {siteName(item.store_id) && (
                                                <div className="text-[11px] text-muted-foreground">
                                                    {siteName(item.store_id)}
                                                </div>
                                            )}
                                        </div>

                                        <div>{assignedName(item.assigned_to)}</div>
                                        <div className="capitalize">{item.priority}</div>

                                        <div>
                                            <div>{statusLabel(item.status)}</div>
                                            {item.due_date && (
                                                <div className="mt-0.5 text-[11px] text-muted-foreground">
                                                    Due{" "}
                                                    {new Date(
                                                        `${item.due_date}T00:00:00`
                                                    ).toLocaleDateString("en-NZ")}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    )
}
