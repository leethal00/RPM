"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Loader2, Search, MapPin } from "lucide-react"

interface SiteFormProps {
    site?: any
    onSuccess: () => void
    onCancel: () => void
}

export function SiteForm({ site, onSuccess, onCancel }: SiteFormProps) {
    const supabase = createClient()
    const [loading, setLoading] = useState(false)
    const [clientId, setClientId] = useState<string | null>(site?.client_id || null)

    // Form State
    const [formData, setFormData] = useState({
        name: site?.name || "",
        address: site?.address || "",
        region: site?.region || "",
        manager_name: site?.manager_name || "",
        manager_phone: site?.manager_phone || "",
        status: site?.status || "active",
        brand_st_pierres: site?.brand_st_pierres ?? site?.st_pierres ?? true,
        brand_bento_bowl: site?.brand_bento_bowl ?? site?.bento_bowl ?? false,
        brand_k10: site?.brand_k10 ?? site?.k10 ?? false,
        site_category: site?.site_category || "Stand alone",
        has_drive_thru: site?.has_drive_thru || false,
        lat: site?.lat || null,
        lng: site?.lng || null,
    })

    // Geocoding State
    const [searching, setSearching] = useState(false)
    const [suggestions, setSuggestions] = useState<any[]>([])

    const lookupAddress = async () => {
        if (!formData.address || formData.address.length < 5) {
            toast.error("Please enter a more specific address to search")
            return
        }

        setSearching(true)
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(formData.address)}&limit=5&countrycodes=nz`)
            const data = await response.json()
            setSuggestions(data)
            if (data.length === 0) toast.error("No locations found. Try adding more detail.")
        } catch (error) {
            toast.error("Error connecting to geocoding service")
        } finally {
            setSearching(false)
        }
    }

    const selectAddress = (suggestion: any) => {
        setFormData({
            ...formData,
            address: suggestion.display_name,
            lat: parseFloat(suggestion.lat),
            lng: parseFloat(suggestion.lon)
        })
        setSuggestions([])
        toast.success("Location verified & coordinates captured!")
    }

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

        if (!formData.name || !formData.address || !clientId) {
            if (!clientId) {
                toast.error("System error: Client ID missing. Please refresh.")
            } else {
                const missing = []
                if (!formData.name) missing.push("Site Name")
                if (!formData.address) missing.push("Site Address")
                toast.error(`Required missing: ${missing.join(", ")}`)
            }
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
            // Legacy support
            bento_bowl: formData.brand_bento_bowl
        }

        let error, count
        if (site?.id) {
            const { error: updateError, count: updateCount } = await supabase
                .from('stores')
                .update(payload, { count: 'exact' })
                .eq('id', site.id)
            error = updateError
            count = updateCount
        } else {
            const { error: insertError, count: insertCount } = await supabase
                .from('stores')
                .insert(payload, { count: 'exact' })
            error = insertError
            count = insertCount
        }

        if (error) {
            toast.error(error.message)
        } else {
            if (count === 0 && site?.id) {
                toast.warning("Site found but 0 changes applied (check permissions)")
            } else {
                toast.success(site?.id ? "Site updated successfully" : "Site added successfully")
            }
            onSuccess()
        }
        setLoading(false)
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6 py-4 font-primary">
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                <div className="grid gap-2">
                    <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Site Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                        id="name"
                        placeholder="e.g. St Pierre's — Ponsonby"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                    />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="region" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Region</Label>
                    <Input
                        id="region"
                        placeholder="e.g. Auckland"
                        value={formData.region}
                        onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    />
                </div>

                <div className="space-y-3">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Brands at this Site</Label>
                    <div className="grid grid-cols-3 gap-3">
                        {/* St Pierre's - Always True */}
                        <div className="relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-primary bg-primary/5 cursor-default">
                            <div className="h-10 w-full flex items-center justify-center">
                                <img src="/brands/st-pierres.png" alt="St Pierres" className="max-h-full max-w-full object-contain" />
                            </div>
                            <span className="text-[10px] font-bold text-primary uppercase">Sushi of Japan</span>
                            <div className="absolute -top-2 -right-2 bg-primary text-white rounded-full p-0.5">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </div>
                        </div>

                        {/* Bento Bowl */}
                        <button
                            type="button"
                            onClick={() => setFormData({ ...formData, brand_bento_bowl: !formData.brand_bento_bowl })}
                            className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${formData.brand_bento_bowl ? 'border-[#e67e22] bg-[#e67e22]/5' : 'border-muted bg-muted/20 hover:border-muted-foreground/30'}`}
                        >
                            <div className="h-10 w-full flex items-center justify-center grayscale hover:grayscale-0 transition-all opacity-70 hover:opacity-100 group">
                                <img
                                    src="/brands/bento-bowl.png"
                                    alt="Bento Bowl"
                                    className={`max-h-full max-w-full object-contain ${formData.brand_bento_bowl ? 'grayscale-0 opacity-100' : ''}`}
                                />
                            </div>
                            <span className={`text-[10px] font-bold uppercase ${formData.brand_bento_bowl ? 'text-[#e67e22]' : 'text-muted-foreground'}`}>Bento Bowl</span>
                            {formData.brand_bento_bowl && (
                                <div className="absolute -top-2 -right-2 bg-[#e67e22] text-white rounded-full p-0.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </div>
                            )}
                        </button>

                        {/* K10 */}
                        <button
                            type="button"
                            onClick={() => setFormData({ ...formData, brand_k10: !formData.brand_k10 })}
                            className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${formData.brand_k10 ? 'border-[#a32b2b] bg-[#a32b2b]/5' : 'border-muted bg-muted/20 hover:border-muted-foreground/30'}`}
                        >
                            <div className="h-10 w-full flex items-center justify-center grayscale hover:grayscale-0 transition-all opacity-70 hover:opacity-100">
                                <img
                                    src="/brands/k10.png"
                                    alt="K10"
                                    className={`max-h-full max-w-full object-contain ${formData.brand_k10 ? 'grayscale-0 opacity-100' : ''}`}
                                />
                            </div>
                            <span className={`text-[10px] font-bold uppercase ${formData.brand_k10 ? 'text-[#a32b2b]' : 'text-muted-foreground'}`}>K10 Train</span>
                            {formData.brand_k10 && (
                                <div className="absolute -top-2 -right-2 bg-[#a32b2b] text-white rounded-full p-0.5">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </div>
                            )}
                        </button>
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
                    <div className="flex items-center justify-between">
                        <Label htmlFor="address" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Site Address <span className="text-red-500">*</span>
                        </Label>
                        {formData.lat && formData.lng && (
                            <Badge variant="outline" className="h-4 text-[8px] bg-green-50 text-green-700 border-green-200">LOCATION VERIFIED</Badge>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Input
                                id="address"
                                placeholder="Start typing address..."
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value, lat: null, lng: null })}
                                className={formData.lat ? 'border-green-200 bg-green-50/20' : ''}
                                required
                            />
                            {searching && <Loader2 className="absolute right-3 top-2.5 size-4 animate-spin text-muted-foreground" />}
                        </div>
                        <Button type="button" size="sm" onClick={lookupAddress} disabled={searching} className="h-10">
                            Lookup
                        </Button>
                    </div>

                    {suggestions.length > 0 && (
                        <div className="mt-1 border rounded-lg bg-white shadow-xl max-h-40 overflow-y-auto z-50 divide-y">
                            {suggestions.map((s, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    className="w-full text-left p-2 hover:bg-muted text-xs transition-colors"
                                    onClick={() => selectAddress(s)}
                                >
                                    {s.display_name}
                                </button>
                            ))}
                        </div>
                    )}
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
