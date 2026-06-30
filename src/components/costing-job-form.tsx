"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import type { Client, Store, CostingJob } from "@/types/database"
import { costingJobSchema, getValidationErrors } from "@/lib/validations"

interface CostingJobFormProps {
    onSuccess: (jobId?: string) => void
    onCancel: () => void
    job?: CostingJob
}

export function CostingJobForm({ onSuccess, onCancel, job }: CostingJobFormProps) {
    const supabase = createClient()
    const [loading, setLoading] = useState(false)

    const [formData, setFormData] = useState({
        title: job?.title || "",
        reference: job?.reference || "",
        qty: job?.qty?.toString() || "1",
        client_id: job?.client_id || "none",
        store_id: job?.store_id || "none",
        details: job?.details || "",
    })

    const [clients, setClients] = useState<Pick<Client, "id" | "name">[]>([])
    const [stores, setStores] = useState<Pick<Store, "id" | "name">[]>([])
    const [fetching, setFetching] = useState(true)
    const [addingClient, setAddingClient] = useState(false)
    const [newClientName, setNewClientName] = useState("")
    const [addingStore, setAddingStore] = useState(false)
    const [newStoreName, setNewStoreName] = useState("")

    async function createClientInline() {
        const name = newClientName.trim()
        if (!name) return
        const { data, error } = await supabase.from("clients").insert({ name }).select("id, name").single()
        if (error) return toast.error(error.message)
        setClients((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)))
        setFormData((f) => ({ ...f, client_id: data.id }))
        setAddingClient(false); setNewClientName("")
    }

    async function createStoreInline() {
        const name = newStoreName.trim()
        if (!name) return
        if (formData.client_id === "none") return toast.error("Pick a client first, then add its site")
        const { data, error } = await supabase.from("stores").insert({ name, client_id: formData.client_id }).select("id, name").single()
        if (error) return toast.error(error.message)
        setStores((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)))
        setFormData((f) => ({ ...f, store_id: data.id }))
        setAddingStore(false); setNewStoreName("")
    }

    useEffect(() => {
        async function fetchRefs() {
            setFetching(true)
            const [{ data: c }, { data: s }] = await Promise.all([
                supabase.from("clients").select("id, name").order("name"),
                supabase.from("stores").select("id, name").order("name"),
            ])
            setClients(c || [])
            setStores(s || [])
            setFetching(false)
        }
        fetchRefs()
    }, [supabase])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        const result = costingJobSchema.safeParse(formData)
        if (!result.success) {
            getValidationErrors(result).forEach((msg) => toast.error(msg))
            setLoading(false)
            return
        }

        const { data: userData } = await supabase.auth.getUser()

        const payload: Record<string, unknown> = {
            title: formData.title,
            reference: formData.reference || null,
            qty: parseFloat(formData.qty) || 1,
            client_id: formData.client_id === "none" ? null : formData.client_id,
            store_id: formData.store_id === "none" ? null : formData.store_id,
            details: formData.details || null,
        }

        if (job) {
            payload.id = job.id
        } else {
            payload.created_by = userData.user?.id
            payload.quoted_by = userData.user?.id
        }

        const { data, error } = await supabase
            .from("costing_jobs")
            .upsert(payload)
            .select("id")
            .single()

        if (error) {
            setLoading(false)
            toast.error(error.message)
            return
        }

        // New jobs get one default "build" item so single-item jobs are one-click.
        if (!job && data?.id) {
            await supabase.from("costing_items").insert({
                job_id: data.id, name: formData.title, mode: "build", qty: parseFloat(formData.qty) || 1, sort: 0,
            })
        }

        setLoading(false)
        toast.success(job ? "Job updated" : "Job created")
        onSuccess(data?.id)
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6 py-4 font-primary">
            <div className="space-y-4">
                <div className="grid gap-2">
                    <Label htmlFor="title" className="text-xs font-medium text-muted-foreground">Job Title</Label>
                    <Input
                        id="title"
                        placeholder="e.g. Kennards CBD — Twin pole pylon 5m"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        required
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="reference" className="text-xs font-medium text-muted-foreground">Reference</Label>
                        <Input
                            id="reference"
                            placeholder="e.g. New site templates"
                            value={formData.reference}
                            onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="qty" className="text-xs font-medium text-muted-foreground">Qty (for per-unit cost)</Label>
                        <Input
                            id="qty"
                            type="number"
                            min="1"
                            step="any"
                            value={formData.qty}
                            onChange={(e) => setFormData({ ...formData, qty: e.target.value })}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="client_id" className="text-xs font-medium text-muted-foreground">Client (optional)</Label>
                        {addingClient ? (
                            <div className="flex gap-1.5">
                                <Input autoFocus value={newClientName} placeholder="New client name"
                                    onChange={(e) => setNewClientName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") { e.preventDefault(); createClientInline() }
                                        else if (e.key === "Escape") setAddingClient(false)
                                    }} />
                                <Button type="button" size="sm" className="shrink-0" onClick={createClientInline}>Add</Button>
                                <Button type="button" size="sm" variant="ghost" className="shrink-0 px-2" onClick={() => setAddingClient(false)}>×</Button>
                            </div>
                        ) : (
                            <Select
                                value={formData.client_id}
                                onValueChange={(v) => v === "__new__" ? setAddingClient(true) : setFormData({ ...formData, client_id: v })}
                                disabled={fetching}
                            >
                                <SelectTrigger id="client_id">
                                    <SelectValue placeholder={fetching ? "Loading…" : "Select client"} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Ad-hoc / wholesale (no client)</SelectItem>
                                    <SelectItem value="__new__" className="text-primary">+ New client…</SelectItem>
                                    {clients.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="store_id" className="text-xs font-medium text-muted-foreground">Site (optional)</Label>
                        {addingStore ? (
                            <div className="flex gap-1.5">
                                <Input autoFocus value={newStoreName} placeholder="New site name"
                                    onChange={(e) => setNewStoreName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") { e.preventDefault(); createStoreInline() }
                                        else if (e.key === "Escape") setAddingStore(false)
                                    }} />
                                <Button type="button" size="sm" className="shrink-0" onClick={createStoreInline}>Add</Button>
                                <Button type="button" size="sm" variant="ghost" className="shrink-0 px-2" onClick={() => setAddingStore(false)}>×</Button>
                            </div>
                        ) : (
                            <Select
                                value={formData.store_id}
                                onValueChange={(v) => v === "__new__" ? setAddingStore(true) : setFormData({ ...formData, store_id: v })}
                                disabled={fetching}
                            >
                                <SelectTrigger id="store_id">
                                    <SelectValue placeholder={fetching ? "Loading…" : "Select site"} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No site</SelectItem>
                                    <SelectItem value="__new__" className="text-primary">+ New site…</SelectItem>
                                    {stores.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="details" className="text-xs font-medium text-muted-foreground">Details</Label>
                    <Textarea
                        id="details"
                        placeholder="Scope / notes for this job…"
                        className="min-h-[90px]"
                        value={formData.details}
                        onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                    />
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t">
                <Button type="button" variant="outline" onClick={onCancel}>Discard</Button>
                <Button type="submit" disabled={loading} className="min-w-[140px] font-medium">
                    {loading ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{job ? "Saving…" : "Creating…"}</>
                    ) : (
                        job ? "Save Changes" : "Create Job"
                    )}
                </Button>
            </div>
        </form>
    )
}
