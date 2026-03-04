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

interface AssetFormProps {
    storeId: string
    onSuccess: () => void
    onCancel: () => void
}

export function AssetForm({ storeId, onSuccess, onCancel }: AssetFormProps) {
    const supabase = createClient()
    const [loading, setLoading] = useState(false)
    const [assetTypes, setAssetTypes] = useState<any[]>([])

    // Form State
    const [formData, setFormData] = useState({
        name: "",
        asset_type_id: "",
        install_date: "",
        status: "active",
        notes: "",
        service_interval_days: "365"
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

        const { error } = await supabase
            .from('assets')
            .insert({
                store_id: storeId,
                name: formData.name,
                asset_type_id: formData.asset_type_id,
                install_date: formData.install_date || null,
                status: formData.status,
                notes: formData.notes,
                service_interval_days: parseInt(formData.service_interval_days) || 365
            })

        if (error) {
            toast.error(error.message)
        } else {
            toast.success("Asset added successfully")
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
                    <Label htmlFor="type" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Asset Type *</Label>
                    <Select
                        onValueChange={(value) => setFormData({ ...formData, asset_type_id: value })}
                        required
                    >
                        <SelectTrigger id="type">
                            <SelectValue placeholder="Select asset type" />
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
                        <Label htmlFor="interval" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Service Interval (Days)</Label>
                        <Input
                            id="interval"
                            type="number"
                            value={formData.service_interval_days}
                            onChange={(e) => setFormData({ ...formData, service_interval_days: e.target.value })}
                        />
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
                        "Add Asset"
                    )}
                </Button>
            </div>
        </form>
    )
}
