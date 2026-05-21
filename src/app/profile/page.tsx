"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { type User as SupabaseUser } from "@supabase/supabase-js"
import type { UserProfile } from "@/types/database"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { PageShell } from "@/components/page-shell"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { toast } from "sonner"
import { User, Mail, Shield, Loader2, Save } from "lucide-react"

export default function ProfilePage() {
    const supabase = createClient()
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [user, setUser] = useState<SupabaseUser | null>(null)
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [formData, setFormData] = useState({
        name: "",
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
                setFormData({ name: profile.name || "" })
            }
            setLoading(false)
        }
        loadProfile()
    }, [supabase, router])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user) return
        setSaving(true)

        const { error } = await supabase
            .from('users')
            .update({
                name: formData.name,
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

    const userInitials = formData.name?.substring(0, 2).toUpperCase() || user?.email?.substring(0, 2).toUpperCase() || "U"

    return (
        <DashboardLayout>
            <PageShell width="narrow">
                <div className="flex flex-col gap-6">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight">Your profile</h1>
                        <p className="text-sm text-muted-foreground">Manage your account details and preferences.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="md:col-span-1">
                            <CardHeader className="text-center">
                                <Avatar className="size-20 mx-auto">
                                    <AvatarImage src={profile?.avatar_url || ""} />
                                    <AvatarFallback className="text-xl font-medium">{userInitials}</AvatarFallback>
                                </Avatar>
                                <CardTitle className="mt-3 text-lg">{formData.name || "User"}</CardTitle>
                                <CardDescription className="text-xs text-muted-foreground capitalize">
                                    {profile?.role || "Member"}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Shield className="size-3.5" />
                                    <span>Permissions: standard</span>
                                </div>
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <User className="size-3.5" />
                                    <span>ID …{user?.id?.slice(-8)}</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="md:col-span-2">
                            <CardHeader>
                                <CardTitle>Profile Information</CardTitle>
                                <CardDescription>Update your personal details here.</CardDescription>
                            </CardHeader>
                            <form onSubmit={handleSave}>
                                <CardContent className="space-y-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">Email Address (Read-only)</Label>
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
                                        <Label htmlFor="name" className="text-xs font-medium text-muted-foreground">Name</Label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                                            <Input
                                                id="name"
                                                placeholder="e.g. Lee Ross"
                                                className="pl-10"
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            />
                                        </div>
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
            </PageShell>
        </DashboardLayout>
    )
}
