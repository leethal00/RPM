"use client"

import { useState } from "react"
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

interface Project {
    id: string
    name: string
    description?: string
    status: string
    budget?: number
    start_date?: string
    end_date?: string
    store_id?: string
}

interface ProjectFormProps {
    onSuccess: () => void
    onCancel: () => void
    project?: Project
}

export function ProjectForm({ onSuccess, onCancel, project }: ProjectFormProps) {
    const supabase = createClient()
    const [loading, setLoading] = useState(false)

    const [formData, setFormData] = useState({
        name: project?.name || "",
        description: project?.description || "",
        status: project?.status || "planning",
        budget: project?.budget?.toString() || "",
        start_date: project?.start_date || "",
        end_date: project?.end_date || "",
        store_id: project?.store_id || ""
    })

    const [stores, setStores] = useState<any[]>([])
    const [fetchingStores, setFetchingStores] = useState(true)

    useState(() => {
        async function fetchStores() {
            setFetchingStores(true)
            const { data } = await supabase.from('stores').select('id, name').order('name')
            setStores(data || [])
            setFetchingStores(false)
        }
        fetchStores()
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        if (!formData.name) {
            toast.error("Project name is required")
            setLoading(false)
            return
        }

        const { data: userData } = await supabase.auth.getUser()

        const payload: any = {
            name: formData.name,
            description: formData.description,
            status: formData.status,
            budget: parseFloat(formData.budget) || 0,
            start_date: formData.start_date || null,
            end_date: formData.end_date || null,
            store_id: formData.store_id || null,
        }

        if (!project) {
            payload.created_by = userData.user?.id
        } else {
            payload.id = project.id
        }

        const { error } = await supabase
            .from('projects')
            .upsert(payload)

        setLoading(false)

        if (error) {
            toast.error(error.message)
        } else {
            toast.success(project ? "Strategic Project Updated!" : "Strategic Project Initiated!")
            onSuccess()
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6 py-4 font-primary">
            <div className="space-y-4">
                <div className="grid gap-2">
                    <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Project Title</Label>
                    <Input
                        id="name"
                        placeholder="e.g. St Pierre's Queensgate Full Refurbishment"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                    />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="description" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Strategic Objectives</Label>
                    <Textarea
                        id="description"
                        placeholder="Define the high-level goals of this project..."
                        className="min-h-[100px] italic"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="status" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Initial Status</Label>
                        <Select
                            value={formData.status}
                            onValueChange={(v) => setFormData({ ...formData, status: v })}
                        >
                            <SelectTrigger id="status">
                                <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="planning">Phase 1: Planning</SelectItem>
                                <SelectItem value="in_progress">Phase 2: Execution</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="budget" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Capex Budget ($)</Label>
                        <Input
                            id="budget"
                            type="number"
                            placeholder="50000"
                            value={formData.budget}
                            onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                        />
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="store_id" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Linked Site (Optional)</Label>
                    <Select
                        value={formData.store_id}
                        onValueChange={(v) => setFormData({ ...formData, store_id: v })}
                        disabled={fetchingStores}
                    >
                        <SelectTrigger id="store_id">
                            <SelectValue placeholder={fetchingStores ? "Loading stores..." : "Select site (optional)"} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">General Strategic HQ (No link)</SelectItem>
                            {stores.map((store) => (
                                <SelectItem key={store.id} value={store.id}>
                                    {store.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="start_date" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Target Start</Label>
                        <Input
                            id="start_date"
                            type="date"
                            value={formData.start_date}
                            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="end_date" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Target Completion</Label>
                        <Input
                            id="end_date"
                            type="date"
                            value={formData.end_date}
                            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        />
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t">
                <Button type="button" variant="outline" onClick={onCancel} className="italic">
                    Discard
                </Button>
                <Button type="submit" disabled={loading} className="min-w-[140px] font-black uppercase tracking-widest text-[10px]">
                    {loading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {project ? "Saving..." : "Initiating..."}
                        </>
                    ) : (
                        project ? "Save Changes" : "Initiate Project"
                    )}
                </Button>
            </div>
        </form>
    )
}
