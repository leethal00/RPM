"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

interface Vendor {
    id?: string
    name: string
    trade: string
    email?: string
    phone?: string
    account_code?: string
    status: string
}

interface VendorFormProps {
    vendor?: Vendor
    onSuccess: () => void
    onCancel: () => void
}

const TRADES = [
    "HVAC",
    "Plumbing",
    "Electrical",
    "Cleaning",
    "Refrigeration",
    "Signage",
    "General Maintenance",
    "CCTV & Security",
    "Fire Safety"
]

export function VendorForm({ vendor, onSuccess, onCancel }: VendorFormProps) {
    const supabase = createClient()
    const [loading, setLoading] = useState(false)

    const [formData, setFormData] = useState({
        name: vendor?.name || "",
        trade: vendor?.trade || "General Maintenance",
        email: vendor?.email || "",
        phone: vendor?.phone || "",
        account_code: vendor?.account_code || "",
        status: vendor?.status || "active"
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        if (!formData.name) {
            toast.error("Vendor Name is required")
            setLoading(false)
            return
        }

        const { data: { user } } = await supabase.auth.getUser()

        // Get client_id (optional, depends on your RLS)
        const { data: userData } = await supabase
            .from('users')
            .select('client_id')
            .eq('id', user?.id)
            .single()

        const payload: any = {
            ...formData,
            client_id: userData?.client_id
        }

        let error
        if (vendor?.id) {
            const { error: updateError } = await supabase
                .from('vendors')
                .update(payload)
                .eq('id', vendor.id)
            error = updateError
        } else {
            const { error: insertError } = await supabase
                .from('vendors')
                .insert(payload)
            error = insertError
        }

        setLoading(false)

        if (error) {
            toast.error(error.message)
        } else {
            toast.success(vendor?.id ? "Vendor Updated" : "Vendor Registered")
            onSuccess()
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6 py-4 font-primary">
            <div className="grid gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="vendor_name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Vendor Name *</Label>
                    <Input
                        id="vendor_name"
                        placeholder="e.g. Sharp Plumbing NZ"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                    />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="trade" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Primary Trade</Label>
                    <Select
                        value={formData.trade}
                        onValueChange={(value) => setFormData({ ...formData, trade: value })}
                    >
                        <SelectTrigger id="trade">
                            <SelectValue placeholder="Select a trade" />
                        </SelectTrigger>
                        <SelectContent>
                            {TRADES.map((trade) => (
                                <SelectItem key={trade} value={trade}>{trade}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email Address</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="service@vendor.co.nz"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contact Phone</Label>
                        <Input
                            id="phone"
                            placeholder="09 123 4567"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="account_code" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Account Code</Label>
                        <Input
                            id="account_code"
                            placeholder="VEN-123"
                            value={formData.account_code}
                            onChange={(e) => setFormData({ ...formData, account_code: e.target.value })}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="status" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Vendor Status</Label>
                        <Select
                            value={formData.status}
                            onValueChange={(value) => setFormData({ ...formData, status: value })}
                        >
                            <SelectTrigger id="status">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={onCancel} className="italic">
                    Cancel
                </Button>
                <Button type="submit" disabled={loading} className="min-w-[140px] font-black uppercase tracking-widest text-[10px]">
                    {loading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
                        </>
                    ) : (
                        vendor?.id ? "Save Changes" : "Register Vendor"
                    )}
                </Button>
            </div>
        </form>
    )
}
