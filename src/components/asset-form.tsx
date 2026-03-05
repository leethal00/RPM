"use client"

import { useState, useEffect } from "react"
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
import { Loader2, Search, Camera } from "lucide-react"
import { AssetPhotoGallery } from "./asset-photo-gallery"

interface Asset {
    id: string
    asset_group?: 'internal' | 'external'
    asset_type_id: string
    install_date?: string
    status?: string
    asset_details?: string
    asset_dimensions?: string
    last_service_date?: string
    next_service_date?: string
}

interface AssetFormProps {
    storeId: string
    asset?: Asset
    onSuccess: () => void
    onCancel: () => void
}

export function AssetForm({ storeId, asset, onSuccess, onCancel }: AssetFormProps) {
    const supabase = createClient()
    const [loading, setLoading] = useState(false)
    const [assetTypes, setAssetTypes] = useState<any[]>([])

    // Form State
    const [formData, setFormData] = useState({
        asset_group: asset?.asset_group || "external",
        asset_type_id: asset?.asset_type_id || "",
        install_date: asset?.install_date || "",
        status: asset?.status || "active",
        asset_details: asset?.asset_details || "",
        asset_dimensions: asset?.asset_dimensions || "",
        last_service_date: asset?.last_service_date || "",
        next_service_date: asset?.next_service_date || "",
    })

    useEffect(() => {
        async function fetchAssetTypes() {
            const { data } = await supabase
                .from('asset_types')
                .select('*')
                .order('label')
            setAssetTypes(data || [])
        }
        fetchAssetTypes()
    }, [supabase])

    // Helper to calculate next service date (18 months + quarter rounding)
    const calculateNextService = (installDate: string) => {
        if (!installDate) return ""
        const date = new Date(installDate)
        // Add 18 months
        date.setMonth(date.getMonth() + 18)

        const month = date.getMonth()
        const year = date.getFullYear()

        // Round to start of quarter
        let targetMonth = 0 // Q1 (Jan)
        if (month >= 3 && month <= 5) targetMonth = 3 // Q2 (Apr)
        if (month >= 6 && month <= 8) targetMonth = 6 // Q3 (Jul)
        if (month >= 9 && month <= 11) targetMonth = 9 // Q4 (Oct)

        const roundedDate = new Date(year, targetMonth, 1)
        return roundedDate.toISOString().split('T')[0]
    }

    const getQuarterLabel = (dateString: string) => {
        if (!dateString) return ""
        const date = new Date(dateString)
        const month = date.getMonth()
        const year = date.getFullYear()
        const quarter = Math.floor(month / 3) + 1
        return `Q${quarter} ${year}`
    }

    const handleInstallDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const date = e.target.value
        setFormData(prev => ({
            ...prev,
            install_date: date,
            next_service_date: calculateNextService(date)
        }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        if (!formData.asset_type_id) {
            toast.error("Please select an Asset Type")
            setLoading(false)
            return
        }

        const payload: any = {
            store_id: storeId,
            asset_group: formData.asset_group,
            asset_type_id: formData.asset_type_id,
            install_date: formData.install_date || null,
            status: formData.status,
            asset_details: formData.asset_details,
            asset_dimensions: formData.asset_dimensions,
            last_service_date: formData.last_service_date || null,
            next_service_date: formData.next_service_date || null,
        }

        let error;
        if (asset?.id) {
            const { error: updateError } = await supabase
                .from('assets')
                .update(payload)
                .eq('id', asset.id)
            error = updateError
        } else {
            const { error: insertError } = await supabase
                .from('assets')
                .insert(payload)
            error = insertError
        }

        if (error) {
            toast.error(error.message)
        } else {
            toast.success(asset?.id ? "Asset updated successfully" : "Asset added successfully")
            onSuccess()
        }
        setLoading(false)
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6 py-4 font-primary">
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="asset_group" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Asset Group *</Label>
                        <Select
                            value={formData.asset_group}
                            onValueChange={(v: any) => setFormData({ ...formData, asset_group: v })}
                        >
                            <SelectTrigger id="asset_group">
                                <SelectValue placeholder="Select group" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="external">External</SelectItem>
                                <SelectItem value="internal">Internal</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="asset_type_id" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Asset Type *</Label>
                        <Select
                            value={formData.asset_type_id}
                            onValueChange={(v) => setFormData({ ...formData, asset_type_id: v })}
                        >
                            <SelectTrigger id="asset_type_id">
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                                {assetTypes.map((type) => (
                                    <SelectItem key={type.id} value={type.id}>
                                        {type.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="asset_dimensions" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Asset Dimensions</Label>
                    <Input
                        id="asset_dimensions"
                        placeholder="e.g. 2400mm x 600mm"
                        value={formData.asset_dimensions}
                        onChange={(e) => setFormData({ ...formData, asset_dimensions: e.target.value })}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="install_date" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Install Date</Label>
                        <Input
                            id="install_date"
                            type="date"
                            value={formData.install_date}
                            onChange={handleInstallDateChange}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="status" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</Label>
                        <Select
                            value={formData.status}
                            onValueChange={(value) => setFormData({ ...formData, status: value })}
                        >
                            <SelectTrigger id="status">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="maintenance">Maintenance</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="p-4 bg-primary/5 rounded-lg border border-primary/10 space-y-3">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Service Intelligence</Label>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-1">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">Service Interval</span>
                            <span className="text-sm font-black italic">18 Months (Standard)</span>
                        </div>
                        <div className="grid gap-1">
                            <Label htmlFor="next_service" className="text-[10px] font-bold uppercase text-muted-foreground">Next Service Target</Label>
                            <div className="flex flex-col">
                                <span className="text-lg font-black text-primary uppercase tracking-tighter">
                                    {getQuarterLabel(formData.next_service_date) || "TBD"}
                                </span>
                                <Input
                                    id="next_service"
                                    type="date"
                                    value={formData.next_service_date}
                                    onChange={(e) => setFormData({ ...formData, next_service_date: e.target.value })}
                                    className="h-7 text-[10px] mt-1 opacity-50 focus:opacity-100 transition-opacity"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="asset_details" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Asset Details (Free Format) *</Label>
                    <Textarea
                        id="asset_details"
                        placeholder="e.g. Mounted on main pylon cabinet, requires cherry picker for access."
                        className="min-h-[100px]"
                        value={formData.asset_details}
                        onChange={(e) => setFormData({ ...formData, asset_details: e.target.value })}
                    />
                </div>

                {asset?.id ? (
                    <div className="pt-6 border-t">
                        <AssetPhotoGallery assetId={asset.id} />
                    </div>
                ) : (
                    <div className="pt-4 border-t px-4 py-3 bg-primary/5 rounded-lg border-2 border-dashed border-primary/20">
                        <p className="text-xs text-primary font-medium flex items-center gap-2">
                            <Camera className="size-4" />
                            Note: Photos can be attached after the asset has been created.
                        </p>
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
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
                        asset?.id ? "Save Changes" : "Add Asset"
                    )}
                </Button>
            </div>
        </form>
    )
}
