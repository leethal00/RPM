"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, Plus, Trash2, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface MaintenanceScheduleListProps {
    assetId: string
}

export function MaintenanceScheduleList({ assetId }: MaintenanceScheduleListProps) {
    const [schedules, setSchedules] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [isOpen, setIsOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const supabase = createClient()

    const [form, setForm] = useState({
        task_name: "",
        frequency_days: "180",
    })

    useEffect(() => {
        fetchSchedules()
    }, [assetId])

    async function fetchSchedules() {
        const { data } = await supabase
            .from('maintenance_schedules')
            .select('*')
            .eq('asset_id', assetId)
            .order('next_due_at', { ascending: true })

        setSchedules(data || [])
        setLoading(false)
    }

    async function addSchedule() {
        setSaving(true)
        const nextDue = new Date()
        nextDue.setDate(nextDue.getDate() + parseInt(form.frequency_days))

        const { error } = await supabase
            .from('maintenance_schedules')
            .insert({
                asset_id: assetId,
                task_name: form.task_name,
                frequency_days: parseInt(form.frequency_days),
                next_due_at: nextDue.toISOString()
            })

        if (error) {
            toast.error("Failed to add schedule")
        } else {
            toast.success("Schedule added")
            setIsOpen(false)
            setForm({ task_name: "", frequency_days: "180" })
            fetchSchedules()
        }
        setSaving(false)
    }

    async function deleteSchedule(id: string) {
        const { error } = await supabase
            .from('maintenance_schedules')
            .delete()
            .eq('id', id)

        if (error) {
            toast.error("Failed to delete")
        } else {
            setSchedules(schedules.filter(s => s.id !== id))
            toast.success("Deleted")
        }
    }

    if (loading) return <div>Loading schedules...</div>

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold italic">Recurring Maintenance</h3>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" className="gap-2">
                            <Plus className="size-4" />
                            Add Task
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>New Maintenance Task</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Task Description</Label>
                                <Input
                                    placeholder="e.g. Deep clean condenser, replace seals"
                                    value={form.task_name}
                                    onChange={e => setForm({ ...form, task_name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Frequency (Days)</Label>
                                <Input
                                    type="number"
                                    value={form.frequency_days}
                                    onChange={e => setForm({ ...form, frequency_days: e.target.value })}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                            <Button onClick={addSchedule} disabled={saving || !form.task_name}>
                                {saving ? "Saving..." : "Create Schedule"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {schedules.map((s) => (
                    <Card key={s.id} className="relative group overflow-hidden border-primary/10">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-primary/5 rounded-lg text-primary">
                                    <Clock className="size-5" />
                                </div>
                                <div className="space-y-1">
                                    <p className="font-semibold text-sm">{s.task_name}</p>
                                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                                        <span className="flex items-center gap-1">
                                            <Calendar className="size-3" />
                                            Due: {new Date(s.next_due_at).toLocaleDateString()}
                                        </span>
                                        <span>Every {s.frequency_days} days</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {new Date(s.next_due_at) < new Date() && (
                                    <Badge variant="destructive" className="gap-1">
                                        <AlertCircle className="size-3" />
                                        OVERDUE
                                    </Badge>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => deleteSchedule(s.id)}
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                        </CardContent>
                        {new Date(s.next_due_at) < new Date() && (
                            <div className="absolute top-0 left-0 w-1 h-full bg-destructive" />
                        )}
                    </Card>
                ))}
                {schedules.length === 0 && (
                    <div className="text-center py-10 border-2 border-dashed rounded-xl border-muted">
                        <p className="text-muted-foreground text-sm italic">No recurring maintenance scheduled for this asset.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
