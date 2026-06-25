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

        setLoading(false)

        if (error) {
            toast.error(error.message)
        } else {
            toast.success(job ? "Job updated" : "Job created")
            onSuccess(data?.id)
        }
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
                        <Select
                            value={formData.client_id}
                            onValueChange={(v) => setFormData({ ...formData, client_id: v })}
                            disabled={fetching}
                        >
                            <SelectTrigger id="client_id">
                                <SelectValue placeholder={fetching ? "Loading…" : "Select client"} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Ad-hoc / wholesale (no client)</SelectItem>
                                {clients.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="store_id" className="text-xs font-medium text-muted-foreground">Site (optional)</Label>
                        <Select
                            value={formData.store_id}
                            onValueChange={(v) => setFormData({ ...formData, store_id: v })}
                            disabled={fetching}
                        >
                            <SelectTrigger id="store_id">
                                <SelectValue placeholder={fetching ? "Loading…" : "Select site"} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">No site</SelectItem>
                                {stores.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
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
