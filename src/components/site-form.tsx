"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

interface SiteFormProps {
    site?: any
    onSuccess: () => void
    onCancel: () => void
}

export function SiteForm({ site, onSuccess, onCancel }: SiteFormProps) {
    const supabase = createClient()
    const [loading, setLoading] = useState(false)
    const [clientId, setClientId] = useState<string | null>(null)

    // Form State
    const [formData, setFormData] = useState({
        name: site?.name || "",
        address: site?.address || "",
        region: site?.region || "",
        manager_name: site?.manager_name || "",
        manager_phone: site?.manager_phone || "",
        status: site?.status || "active",
        site_type: site?.site_type || "St Pierre Sushi",
        site_category: site?.site_category || "Stand alone",
        has_drive_thru: site?.has_drive_thru || false,
    })

    // State for structured hours
    const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    const [hoursType, setHoursType] = useState<"daily" | "weekly">(() => {
        try {
            const parsed = JSON.parse(site?.hours_of_operation || "{}")
            return parsed.type || "daily"
        } catch {
            return "daily"
        }
    })

    interface DayHours { start: string; end: string }
    const [dailyHours, setDailyHours] = useState<DayHours>(() => {
        try {
            const parsed = JSON.parse(site?.hours_of_operation || "{}")
            return parsed.type === "daily" ? parsed.hours : { start: "09:00", end: "17:00" }
        } catch {
            return { start: "09:00", end: "17:00" }
        }
    })

    const [weeklyHours, setWeeklyHours] = useState<Record<string, DayHours>>(() => {
        try {
            const parsed = JSON.parse(site?.hours_of_operation || "{}")
            if (parsed.type === "weekly") return parsed.days
            const defaultHours = { start: "09:00", end: "17:00" }
            return daysOfWeek.reduce((acc, day) => ({ ...acc, [day]: defaultHours }), {})
        } catch {
            const defaultHours = { start: "09:00", end: "17:00" }
            return daysOfWeek.reduce((acc, day) => ({ ...acc, [day]: defaultHours }), {})
        }
    })

    useEffect(() => {
        async function getClientId() {
            // Get the first client or current user's client
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data: userData } = await supabase
                    .from('users')
                    .select('client_id')
                    .eq('id', user.id)
                    .single()

                if (userData?.client_id) {
                    setClientId(userData.client_id)
                } else {
                    // Fallback to first client
                    const { data: clients } = await supabase
                        .from('clients')
                        .select('id')
                        .limit(1)
                    if (clients?.[0]) setClientId(clients[0].id)
                }
            }
        }
        getClientId()
    }, [supabase])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        if (!formData.name || !clientId) {
            toast.error("Please fill in required fields")
            setLoading(false)
            return
        }

        // Prepare hours JSON
        const hoursData = hoursType === "daily"
            ? { type: "daily", hours: dailyHours }
            : { type: "weekly", days: weeklyHours }

        const payload = {
            ...formData,
            client_id: clientId,
            hours_of_operation: JSON.stringify(hoursData),
            // Map bento_bowl legacy flag if type is Bento Bowl
            bento_bowl: formData.site_type === "Bento Bowl"
        }

        let error
        if (site?.id) {
            const { error: updateError } = await supabase
                .from('stores')
                .update(payload)
                .eq('id', site.id)
            error = updateError
        } else {
            const { error: insertError } = await supabase
                .from('stores')
                .insert(payload)
            error = insertError
        }

        if (error) {
            toast.error(error.message)
        } else {
            toast.success(site?.id ? "Site updated successfully" : "Site added successfully")
            onSuccess()
        }
        setLoading(false)
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6 py-4 font-primary">
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 no-scrollbar">
                <div className="grid gap-2">
                    <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Site Name *</Label>
                    <Input
                        id="name"
                        placeholder="e.g. St Pierre's — Ponsonby"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Site Type</Label>
                        <div className="flex bg-muted rounded-md p-1">
                            {["Bento Bowl", "K10", "St Pierre Sushi"].map(type => (
                                <button
                                    key={type}
                                    type="button"
                                    className={`flex-1 px-2 py-1.5 text-[9px] font-bold rounded-sm transition-all ${formData.site_type === type ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                    onClick={() => setFormData({ ...formData, site_type: type })}
                                >
                                    {type.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Designation</Label>
                        <div className="flex bg-muted rounded-md p-1">
                            {["Stand alone", "Inline", "Mall"].map(cat => (
                                <button
                                    key={cat}
                                    type="button"
                                    className={`flex-1 px-2 py-1.5 text-[10px] font-bold rounded-sm transition-all ${formData.site_category === cat ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                    onClick={() => setFormData({ ...formData, site_category: cat })}
                                >
                                    {cat.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between bg-muted/20 p-3 rounded-lg border border-dashed">
                    <div className="space-y-0.5">
                        <Label className="text-sm font-bold">Drive Thru</Label>
                        <p className="text-xs text-muted-foreground tracking-tight">Does this site have a drive-thru facility?</p>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${formData.has_drive_thru ? 'bg-primary' : 'bg-input'}`}
                        onClick={() => setFormData({ ...formData, has_drive_thru: !formData.has_drive_thru })}
                    >
                        <span className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${formData.has_drive_thru ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="address" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Address</Label>
                    <Input
                        id="address"
                        placeholder="123 Example St, Auckland"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="manager_name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Site Manager</Label>
                        <Input
                            id="manager_name"
                            placeholder="John Doe"
                            value={formData.manager_name}
                            onChange={(e) => setFormData({ ...formData, manager_name: e.target.value })}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="manager_phone" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Manager Phone</Label>
                        <Input
                            id="manager_phone"
                            placeholder="021 123 456"
                            value={formData.manager_phone}
                            onChange={(e) => setFormData({ ...formData, manager_phone: e.target.value })}
                        />
                    </div>
                </div>

                <div className="space-y-4 border-t pt-4">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Hours of Operation</Label>
                        <div className="flex bg-muted rounded-md p-1">
                            <button
                                type="button"
                                className={`px-3 py-1 text-[10px] font-bold rounded-sm transition-all ${hoursType === 'daily' ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setHoursType('daily')}
                            >
                                ALL DAYS SAME
                            </button>
                            <button
                                type="button"
                                className={`px-3 py-1 text-[10px] font-bold rounded-sm transition-all ${hoursType === 'weekly' ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setHoursType('weekly')}
                            >
                                SPECIFIC DAYS
                            </button>
                        </div>
                    </div>

                    {hoursType === 'daily' ? (
                        <div className="flex items-center gap-4 bg-muted/20 p-3 rounded-lg border border-dashed text-sm">
                            <div className="flex-1 grid gap-1.5">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold">Open</span>
                                <Input
                                    type="time"
                                    value={dailyHours.start}
                                    onChange={(e) => setDailyHours({ ...dailyHours, start: e.target.value })}
                                    className="h-8 text-xs"
                                />
                            </div>
                            <div className="flex-1 grid gap-1.5">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold">Close</span>
                                <Input
                                    type="time"
                                    value={dailyHours.end}
                                    onChange={(e) => setDailyHours({ ...dailyHours, end: e.target.value })}
                                    className="h-8 text-xs"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {daysOfWeek.map(day => (
                                <div key={day} className="flex items-center justify-between p-2 hover:bg-muted/30 rounded-lg border border-transparent hover:border-muted/50 transition-all text-xs">
                                    <span className="font-semibold w-20">{day}</span>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="time"
                                            value={weeklyHours[day].start}
                                            onChange={(e) => setWeeklyHours({ ...weeklyHours, [day]: { ...weeklyHours[day], start: e.target.value } })}
                                            className="h-7 w-24 text-[10px]"
                                        />
                                        <span className="text-muted-foreground text-[10px]">—</span>
                                        <Input
                                            type="time"
                                            value={weeklyHours[day].end}
                                            onChange={(e) => setWeeklyHours({ ...weeklyHours, [day]: { ...weeklyHours[day], end: e.target.value } })}
                                            className="h-7 w-24 text-[10px]"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t mt-4">
                <Button type="button" variant="outline" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" disabled={loading} className="min-w-[100px]">
                    {loading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        site?.id ? "Save Changes" : "Add Site"
                    )}
                </Button>
            </div>
        </form>
    )
}
