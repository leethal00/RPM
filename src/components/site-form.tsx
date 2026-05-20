"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Loader2, Check } from "lucide-react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import type { Region, Client, Store, ClientBrand } from "@/types/database"
import { siteSchema, getValidationErrors } from "@/lib/validations"
import { BrandChip, brandsFromStore } from "@/components/brand-chip"

interface GeocodeSuggestion {
    display_name: string
    lat: string
    lon: string
}

interface SiteFormProps {
    site?: Store
    onSuccess: () => void
    onCancel: () => void
}

export function SiteForm({ site, onSuccess, onCancel }: SiteFormProps) {
    const supabase = createClient()
    const [loading, setLoading] = useState(false)
    const [regions, setRegions] = useState<Region[]>([])
    const [customers, setCustomers] = useState<Client[]>([])
    const [clientId, setClientId] = useState<string>(site?.client_id || "")

    // Brands available for the currently-selected customer, plus the current selection
    const [availableBrands, setAvailableBrands] = useState<ClientBrand[]>([])
    const [selectedBrandIds, setSelectedBrandIds] = useState<Set<string>>(
        () => new Set(brandsFromStore(site ?? {}).map((b) => b.id))
    )

    // Form State
    const [formData, setFormData] = useState({
        name: site?.name || "",
        address: site?.address || "",
        region: site?.region || "",
        manager_name: site?.manager_name || "",
        manager_phone: site?.manager_phone || "",
        status: site?.status || "active",
        site_category: site?.site_category || "Stand alone",
        has_drive_thru: site?.has_drive_thru || false,
        lat: site?.lat || null,
        lng: site?.lng || null,
        location_approximate: site?.location_approximate || false,
    })

    // Geocoding State
    const [searching, setSearching] = useState(false)
    const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])

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
        } catch {
            toast.error("Error connecting to geocoding service")
        } finally {
            setSearching(false)
        }
    }

    const selectAddress = (suggestion: GeocodeSuggestion) => {
        setFormData({
            ...formData,
            address: suggestion.display_name,
            lat: parseFloat(suggestion.lat),
            lng: parseFloat(suggestion.lon),
            location_approximate: false,
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
        async function fetchCustomers() {
            const { data } = await supabase
                .from('clients')
                .select('id, name')
                .order('name')
            setCustomers(data || [])

            // If creating new and no client selected, default to first
            if (!site?.id && !clientId && data?.[0]) {
                setClientId(data[0].id)
            }
        }
        fetchCustomers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [supabase, site?.id])

    useEffect(() => {
        async function fetchRegions() {
            const { data } = await supabase
                .from('regions')
                .select('name')
                .order('name')
            setRegions(data || [])
        }
        fetchRegions()
    }, [supabase])

    // Refresh brand list whenever the chosen customer changes.
    // If user switches customer, clear any selected brands that no longer apply.
    useEffect(() => {
        if (!clientId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setAvailableBrands([])
            return
        }
        async function fetchBrands() {
            const { data } = await supabase
                .from('client_brands')
                .select('*')
                .eq('client_id', clientId)
                .order('display_order')
            const brands = (data ?? []) as ClientBrand[]
            setAvailableBrands(brands)
            // Prune selection to brands that exist for this customer
            setSelectedBrandIds(prev => {
                const allowed = new Set(brands.map(b => b.id))
                const pruned = new Set<string>()
                prev.forEach(id => { if (allowed.has(id)) pruned.add(id) })
                return pruned
            })
        }
        fetchBrands()
    }, [supabase, clientId])

    const toggleBrand = (brandId: string) => {
        setSelectedBrandIds(prev => {
            const next = new Set(prev)
            if (next.has(brandId)) next.delete(brandId)
            else next.add(brandId)
            return next
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        if (!clientId) {
            toast.error("System error: Client ID missing. Please refresh.")
            setLoading(false)
            return
        }

        const validationPayload = {
            ...formData,
            client_id: clientId,
            brand_ids: Array.from(selectedBrandIds),
        }
        const result = siteSchema.safeParse(validationPayload)
        if (!result.success) {
            const errors = getValidationErrors(result)
            errors.forEach((msg) => toast.error(msg))
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
        }

        let storeId = site?.id
        let error

        if (site?.id) {
            const { error: updateError } = await supabase
                .from('stores')
                .update(payload)
                .eq('id', site.id)
            error = updateError
        } else {
            const { data: inserted, error: insertError } = await supabase
                .from('stores')
                .insert(payload)
                .select('id')
                .single()
            error = insertError
            if (!error && inserted) storeId = inserted.id
        }

        if (error) {
            toast.error(error.message)
            setLoading(false)
            return
        }

        // Sync store_brands: delete all current, insert the new selection.
        // Simple approach — small N (typically 1-3 brands per site) keeps this cheap.
        if (storeId) {
            await supabase.from('store_brands').delete().eq('store_id', storeId)
            const brandRows = Array.from(selectedBrandIds).map(brand_id => ({ store_id: storeId, brand_id }))
            if (brandRows.length > 0) {
                const { error: brandError } = await supabase.from('store_brands').insert(brandRows)
                if (brandError) {
                    toast.error(`Site saved but failed to update brands: ${brandError.message}`)
                    setLoading(false)
                    return
                }
            }
        }

        toast.success(site?.id ? "Site updated successfully" : "Site added successfully")
        onSuccess()
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
                    <Label htmlFor="customer" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Customer <span className="text-red-500">*</span>
                    </Label>
                    <Select
                        value={clientId}
                        onValueChange={setClientId}
                        required
                    >
                        <SelectTrigger id="customer">
                            <SelectValue placeholder="Select a customer" />
                        </SelectTrigger>
                        <SelectContent>
                            {customers.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="region" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Region</Label>
                    <Select
                        value={formData.region}
                        onValueChange={(value) => setFormData({ ...formData, region: value })}
                    >
                        <SelectTrigger id="region" className="w-full">
                            <SelectValue placeholder="Select a region" />
                        </SelectTrigger>
                        <SelectContent>
                            {regions.map((r) => (
                                <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-3">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Brands at this Site</Label>
                    {availableBrands.length === 0 ? (
                        <div className="p-3 text-xs italic text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                            {clientId
                                ? "This customer has no brands configured yet. Add brands via Portal Settings → Customers."
                                : "Select a customer first to see its brands."}
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-3">
                            {availableBrands.map((brand) => {
                                const isSelected = selectedBrandIds.has(brand.id)
                                return (
                                    <button
                                        key={brand.id}
                                        type="button"
                                        onClick={() => toggleBrand(brand.id)}
                                        className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${isSelected
                                            ? 'border-primary bg-primary/5'
                                            : 'border-muted bg-muted/20 hover:border-muted-foreground/30 opacity-70 hover:opacity-100'
                                            }`}
                                    >
                                        <BrandChip brand={brand} size="md" />
                                        <span className={`text-[10px] font-bold uppercase tracking-tight text-center ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
                                            {brand.label}
                                        </span>
                                        {isSelected && (
                                            <div className="absolute -top-2 -right-2 bg-primary text-white rounded-full p-0.5">
                                                <Check className="size-3" strokeWidth={3} />
                                            </div>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    )}
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
                        aria-checked={formData.has_drive_thru}
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
                            formData.location_approximate ? (
                                <Badge variant="outline" className="h-4 text-[8px] bg-amber-50 text-amber-700 border-amber-200">APPROXIMATE — REVIEW</Badge>
                            ) : (
                                <Badge variant="outline" className="h-4 text-[8px] bg-green-50 text-green-700 border-green-200">LOCATION VERIFIED</Badge>
                            )
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

                    {formData.lat && formData.lng && (
                        <label className="flex items-center gap-2 mt-1 text-xs text-muted-foreground cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={formData.location_approximate}
                                onChange={(e) => setFormData({ ...formData, location_approximate: e.target.checked })}
                                className="size-3.5 accent-amber-500"
                            />
                            <span>Mark location as <span className="font-semibold text-amber-700">approximate</span> — flag for later review</span>
                        </label>
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
