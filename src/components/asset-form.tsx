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
import { Loader2, Camera } from "lucide-react"
import { AssetPhotoGallery } from "./asset-photo-gallery"
import type { AssetType, Asset } from "@/types/database"
import { assetSchema, getValidationErrors } from "@/lib/validations"

interface AssetFormProps {
    storeId: string
    asset?: Asset
    onSuccess: () => void
    onCancel: () => void
}

export function AssetForm({ storeId, asset, onSuccess, onCancel }: AssetFormProps) {
    const supabase = createClient()
    const [loading, setLoading] = useState(false)
    const [assetTypes, setAssetTypes] = useState<AssetType[]>([])

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
        pm_interval_months: asset?.pm_interval_months ?? 18,
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

        const result = assetSchema.safeParse(formData)
        if (!result.success) {
            const errors = getValidationErrors(result)
            errors.forEach((msg) => toast.error(msg))
            setLoading(false)
            return
        }

        const payload: Record<string, unknown> = {
            store_id: storeId,
            asset_group: formData.asset_group,
            asset_type_id: formData.asset_type_id,
            install_date: formData.install_date || null,
            status: formData.status,
            asset_details: formData.asset_details,
            asset_dimensions: formData.asset_dimensions,
            last_service_date: formData.last_service_date || null,
            next_service_date: formData.next_service_date || null,
            pm_interval_months: formData.pm_interval_months || null,
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
                        <Label htmlFor="asset_group" className="text-xs font-medium text-muted-foreground">Asset Group *</Label>
                        <Select
                            value={formData.asset_group}
                            onValueChange={(v: string) => setFormData({ ...formData, asset_group: v })}
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
                        <Label htmlFor="asset_type_id" className="text-xs font-medium text-muted-foreground">Asset Type *</Label>
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
                    <Label htmlFor="asset_dimensions" className="text-xs font-medium text-muted-foreground">Asset Dimensions</Label>
                    <Input
                        id="asset_dimensions"
                        placeholder="e.g. 2400mm x 600mm"
                        value={formData.asset_dimensions}
                        onChange={(e) => setFormData({ ...formData, asset_dimensions: e.target.value })}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="install_date" className="text-xs font-medium text-muted-foreground">Install Date</Label>
                        <Input
                            id="install_date"
                            type="date"
                            value={formData.install_date}
                            onChange={handleInstallDateChange}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="status" className="text-xs font-medium text-muted-foreground">Status</Label>
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

                <div className="p-4 bg-muted/40 rounded-md border border-border/60 space-y-3">
                    <Label className="text-xs font-medium text-muted-foreground">Service scheduling</Label>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-1.5">
                            <Label htmlFor="pm_interval_months" className="text-xs font-medium text-muted-foreground">PM interval (months)</Label>
                            <Input
                                id="pm_interval_months"
                                type="number"
                                min={1}
                                max={120}
                                value={formData.pm_interval_months}
                                onChange={(e) => setFormData({ ...formData, pm_interval_months: Number(e.target.value) || 0 })}
                                className="h-9"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="next_service" className="text-xs font-medium text-muted-foreground">Next service target</Label>
                            <div className="flex flex-col gap-1">
                                <span className="text-sm font-medium text-foreground">
                                    {getQuarterLabel(formData.next_service_date) || "—"}
                                </span>
                                <Input
                                    id="next_service"
                                    type="date"
                                    value={formData.next_service_date}
                                    onChange={(e) => setFormData({ ...formData, next_service_date: e.target.value })}
                                    className="h-7 text-xs"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="asset_details" className="text-xs font-medium text-muted-foreground">Asset Details (Free Format) *</Label>
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
                    <div className="px-4 py-3 bg-muted/40 rounded-md border border-dashed border-border">
                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                            <Camera className="size-3.5" />
                            Photos can be attached once the asset is created.
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
