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
        contact_name: job?.contact_name || "",
        quoted_by_name: job?.quoted_by_name || "",
        job_lead_name: job?.job_lead_name || "",
    })

    const [clients, setClients] = useState<Pick<Client, "id" | "name">[]>([])
    const [stores, setStores] = useState<Pick<Store, "id" | "name" | "client_id">[]>([])
    const [teamMembers, setTeamMembers] = useState<string[]>([])
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
        const { data, error } = await supabase.from("stores").insert({ name, client_id: formData.client_id }).select("id, name, client_id").single()
        if (error) return toast.error(error.message)
        setStores((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)))
        setFormData((f) => ({ ...f, store_id: data.id }))
        setAddingStore(false); setNewStoreName("")
    }

    useEffect(() => {
        async function fetchRefs() {
            setFetching(true)
            const [{ data: c }, { data: s }, { data: team }, { data: auth }] = await Promise.all([
                supabase.from("clients").select("id, name").order("name"),
                supabase.from("stores").select("id, name, client_id").order("name"),
                supabase.from("users").select("id, name, email").order("name"),
                supabase.auth.getUser(),
            ])
            setClients(c || [])
            setStores(s || [])
            const teamRows = (team || []) as Array<{ id: string; name: string | null; email: string | null }>
            const names = Array.from(new Set(teamRows.map((member) => member.name?.trim() || member.email?.split("@")[0]).filter(Boolean) as string[]))
            setTeamMembers(names)
            if (!job && auth.user?.id) {
                const currentMember = teamRows.find((member) => member.id === auth.user?.id)
                const currentName = currentMember?.name?.trim() || currentMember?.email?.split("@")[0] || ""
                if (currentName) setFormData((current) => current.quoted_by_name ? current : { ...current, quoted_by_name: currentName })
            }
            setFetching(false)
        }
        fetchRefs()
    }, [supabase, job])

    const hasClient = formData.client_id !== "none"
    const clientStores = hasClient ? stores.filter((s) => s.client_id === formData.client_id) : []

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
            contact_name: formData.contact_name.trim() || null,
            quoted_by_name: formData.quoted_by_name.trim() || null,
            job_lead_name: formData.job_lead_name.trim() || null,
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
                        <Label htmlFor="quoted_by_name" className="text-xs font-medium text-muted-foreground">Quoted by</Label>
                        <Input
                            id="quoted_by_name"
                            list="costing-team-members"
                            placeholder="e.g. Stu"
                            value={formData.quoted_by_name}
                            onChange={(e) => setFormData({ ...formData, quoted_by_name: e.target.value })}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="job_lead_name" className="text-xs font-medium text-muted-foreground">Job lead</Label>
                        <Input
                            id="job_lead_name"
                            list="costing-team-members"
                            placeholder="Assign now or later"
                            value={formData.job_lead_name}
                            onChange={(e) => setFormData({ ...formData, job_lead_name: e.target.value })}
                        />
                    </div>
                    <datalist id="costing-team-members">
                        {teamMembers.map((name) => <option key={name} value={name} />)}
                    </datalist>
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
                                onValueChange={(v) => {
                                    if (v === "__new__") { setAddingClient(true); return }
                                    setFormData((f) => {
                                        const keep = stores.some((s) => s.id === f.store_id && s.client_id === v)
                                        return { ...f, client_id: v, store_id: keep ? f.store_id : "none" }
                                    })
                                }}
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
                                disabled={fetching || !hasClient}
                            >
                                <SelectTrigger id="store_id">
                                    <SelectValue placeholder={fetching ? "Loading…" : !hasClient ? "Pick a client first" : "Select site"} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No site</SelectItem>
                                    <SelectItem value="__new__" className="text-primary">+ New site…</SelectItem>
                                    {clientStores.length === 0 ? (
                                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No sites for this client yet.</div>
                                    ) : (
                                        clientStores.map((s) => (
                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="contact_name" className="text-xs font-medium text-muted-foreground">Quote contact (optional)</Label>
                    <Input
                        id="contact_name"
                        placeholder="e.g. Moshik Yunus"
                        value={formData.contact_name}
                        onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    />
                    <p className="text-[11px] text-muted-foreground">Shown as “Contact: …” in the introductory line of the Xero quote.</p>
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
