"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { toast } from "sonner"
import { User, Mail, Shield, Loader2, Save } from "lucide-react"

export default function ProfilePage() {
    const supabase = createClient()
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [user, setUser] = useState<any>(null)
    const [profile, setProfile] = useState<any>(null)
    const [formData, setFormData] = useState({
        full_name: "",
        phone: "",
    })

    useEffect(() => {
        async function loadProfile() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push("/login")
                return
            }
            setUser(user)

            const { data: profile } = await supabase
                .from('users')
                .select('*')
                .eq('id', user.id)
                .single()

            if (profile) {
                setProfile(profile)
                setFormData({
                    full_name: profile.full_name || "",
                    phone: profile.phone || "",
                })
            }
            setLoading(false)
        }
        loadProfile()
    }, [supabase, router])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)

        const { error } = await supabase
            .from('users')
            .update({
                full_name: formData.full_name,
                phone: formData.phone,
                updated_at: new Date().toISOString(),
            })
            .eq('id', user.id)

        if (error) {
            toast.error("Failed to update profile", { description: error.message })
        } else {
            toast.success("Profile updated successfully")
            router.refresh()
        }
        setSaving(false)
    }

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex h-[60vh] items-center justify-center">
                    <Loader2 className="size-8 animate-spin text-primary" />
                </div>
            </DashboardLayout>
        )
    }

    const userInitials = formData.full_name?.substring(0, 2).toUpperCase() || user?.email?.substring(0, 2).toUpperCase() || "U"

    return (
        <DashboardLayout>
            <div className="max-w-4xl mx-auto py-8 px-4 font-primary">
                <div className="flex flex-col gap-8">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Your Profile</h1>
                        <p className="text-muted-foreground italic">Manage your account details and preferences.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <Card className="md:col-span-1 border-primary/20 bg-primary/5">
                            <CardHeader className="text-center">
                                <Avatar className="size-24 mx-auto border-4 border-background shadow-xl">
                                    <AvatarImage src={profile?.avatar_url || ""} />
                                    <AvatarFallback className="text-2xl font-bold">{userInitials}</AvatarFallback>
                                </Avatar>
                                <CardTitle className="mt-4">{formData.full_name || "User"}</CardTitle>
                                <CardDescription className="uppercase tracking-widest text-[10px] font-bold text-primary/80">
                                    {profile?.role || "Member"}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                    <Shield className="size-4 text-primary" />
                                    <span>Permissions: Standard</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                    <User className="size-4 text-primary" />
                                    <span>ID: ...{user?.id?.slice(-8)}</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="md:col-span-2 shadow-sm border-muted-foreground/10">
                            <CardHeader>
                                <CardTitle>Profile Information</CardTitle>
                                <CardDescription>Update your personal details here.</CardDescription>
                            </CardHeader>
                            <form onSubmit={handleSave}>
                                <CardContent className="space-y-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email Address (Read-only)</Label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                                            <Input
                                                id="email"
                                                value={user?.email || ""}
                                                readOnly
                                                className="bg-muted pl-10 cursor-not-allowed"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="full_name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Full Name</Label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                                            <Input
                                                id="full_name"
                                                placeholder="John Doe"
                                                className="pl-10"
                                                value={formData.full_name}
                                                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Phone Number</Label>
                                        <Input
                                            id="phone"
                                            placeholder="+64 123 456 789"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                    </div>
                                </CardContent>
                                <CardFooter className="flex justify-end pt-4 border-t">
                                    <Button type="submit" disabled={saving} className="min-w-[120px]">
                                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                        Save Changes
                                    </Button>
                                </CardFooter>
                            </form>
                        </Card>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
