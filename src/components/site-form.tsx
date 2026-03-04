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
        hours_of_operation: site?.hours_of_operation || "",
        status: site?.status || "active",
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

        const payload = {
            ...formData,
            client_id: clientId,
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
            <div className="space-y-4">
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

                <div className="grid gap-2">
                    <Label htmlFor="hours" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Hours of Operation</Label>
                    <Textarea
                        id="hours"
                        placeholder="Mon-Fri: 9am-5pm, Sat: 10am-4pm"
                        className="min-h-[80px]"
                        value={formData.hours_of_operation}
                        onChange={(e) => setFormData({ ...formData, hours_of_operation: e.target.value })}
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
                        site?.id ? "Save Changes" : "Add Site"
                    )}
                </Button>
            </div>
        </form>
    )
}
