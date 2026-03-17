"use client"

import DashboardLayout from "@/components/dashboard-layout"
import { UserManager } from "@/components/user-manager"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

export default function UsersPage() {
    const { theme, setTheme } = useTheme()

    return (
        <DashboardLayout>
            <div className="p-6 max-w-7xl mx-auto space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-primary">Portal Settings</h1>
                    <p className="text-muted-foreground mt-2">Manage your platform configuration, users, and masters.</p>
                </div>

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
            </div>
        </DashboardLayout>
    )
}
