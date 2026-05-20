"use client"

import DashboardLayout from "@/components/dashboard-layout"
import { UserManager } from "@/components/user-manager"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Moon, Sun, Settings } from "lucide-react"
import { useTheme } from "next-themes"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

export default function UsersPage() {
    const { theme, setTheme } = useTheme()

    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader
                    icon={Settings}
                    title="Portal Settings"
                    description="Manage your platform configuration, users, and masters."
                />

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Appearance</CardTitle>
                        <CardDescription>Customize how RPM looks for you.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Theme</Label>
                            <div className="flex gap-3">
                                <Button
                                    variant={theme === "light" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setTheme("light")}
                                    className="flex items-center gap-2"
                                >
                                    <Sun className="size-4" />
                                    Light
                                </Button>
                                <Button
                                    variant={theme === "dark" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setTheme("dark")}
                                    className="flex items-center gap-2"
                                >
                                    <Moon className="size-4" />
                                    Dark
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <UserManager />
            </PageShell>
        </DashboardLayout>
    )
}
