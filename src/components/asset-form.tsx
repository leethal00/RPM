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
import { Loader2 } from "lucide-react"

interface Asset {
    id: string
    name: string
    asset_type_id: string
    install_date?: string
    status?: string
    notes?: string
    service_interval_days?: number
    pm_interval_months?: number
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
        name: asset?.name || "",
        asset_type_id: asset?.asset_type_id || "",
        install_date: asset?.install_date || "",
        status: asset?.status || "active",
        notes: asset?.notes || "",
        service_interval_days: asset?.service_interval_days?.toString() || "365",
        pm_interval_months: asset?.pm_interval_months?.toString() || "6",
        last_service_date: asset?.last_service_date || "",
        next_service_date: asset?.next_service_date || ""
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        if (!formData.name || !formData.asset_type_id) {
            toast.error("Please fill in required fields")
            setLoading(false)
            return
        }

        const payload: any = {
            store_id: storeId,
            name: formData.name,
            asset_type_id: formData.asset_type_id,
            install_date: formData.install_date || null,
            status: formData.status,
            notes: formData.notes,
            service_interval_days: parseInt(formData.service_interval_days) || 365,
            pm_interval_months: parseInt(formData.pm_interval_months) || null,
            last_service_date: formData.last_service_date || null,
            next_service_date: formData.next_service_date || null,
            pm_status: formData.pm_interval_months ? 'active' : 'not_applicable'
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
                <div className="grid gap-2">
                    <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Asset Name *</Label>
                    <Input
                        id="name"
                        placeholder="e.g. Front Counter Menu Board"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                    />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="type" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Asset Type Hierarchy *</Label>
                    <Select
                        value={formData.asset_type_id}
                        onValueChange={(value) => setFormData({ ...formData, asset_type_id: value })}
                        required
                    >
                        <SelectTrigger id="type">
                            <SelectValue placeholder="Select asset classification" />
                        </SelectTrigger>
                        <SelectContent>
                            {assetTypes.map((type) => (
                                <SelectItem key={type.id} value={type.id}>
                                    <div className="flex flex-col text-left">
                                        <span className="font-bold">{type.label}</span>
                                        {(type.sub_cat_1 || type.sub_cat_2 || type.sub_cat_3) && (
                                            <span className="text-[10px] text-muted-foreground leading-tight">
                                                {[type.sub_cat_1, type.sub_cat_2, type.sub_cat_3].filter(Boolean).join(" > ")}
                                            </span>
                                        )}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {formData.asset_type_id && (() => {
                    const selectedType = assetTypes.find(t => t.id === formData.asset_type_id);
                    if (!selectedType) return null;
                    return (
                        <div className="grid grid-cols-3 gap-3 p-3 bg-muted/30 rounded-lg border border-dashed">
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black uppercase text-muted-foreground/60">Sub Cat 1</span>
                                <span className="text-xs font-semibold">{selectedType.sub_cat_1 || "—"}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black uppercase text-muted-foreground/60">Sub Cat 2</span>
                                <span className="text-xs font-semibold">{selectedType.sub_cat_2 || "—"}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black uppercase text-muted-foreground/60">Sub Cat 3</span>
                                <span className="text-xs font-semibold">{selectedType.sub_cat_3 || "—"}</span>
                            </div>
                        </div>
                    );
                })()}

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="install_date" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Install Date</Label>
                        <Input
                            id="install_date"
                            type="date"
                            value={formData.install_date}
                            onChange={(e) => setFormData({ ...formData, install_date: e.target.value })}
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

                <div className="space-y-4 pt-4 border-t">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Maintenance Scheduling</Label>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="pm_interval" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">PM Interval (Months)</Label>
                            <Input
                                id="pm_interval"
                                type="number"
                                placeholder="e.g. 6"
                                value={formData.pm_interval_months}
                                onChange={(e) => setFormData({ ...formData, pm_interval_months: e.target.value })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="last_service" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Last Service</Label>
                            <Input
                                id="last_service"
                                type="date"
                                value={formData.last_service_date}
                                onChange={(e) => setFormData({ ...formData, last_service_date: e.target.value })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="next_service" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Next Service</Label>
                            <Input
                                id="next_service"
                                type="date"
                                value={formData.next_service_date}
                                onChange={(e) => setFormData({ ...formData, next_service_date: e.target.value })}
                                className="border-primary/20 bg-primary/5 font-bold"
                            />
                        </div>
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="notes" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes</Label>
                    <Textarea
                        id="notes"
                        placeholder="Additional technical details, model numbers, etc."
                        className="min-h-[100px]"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    />
                </div>
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
