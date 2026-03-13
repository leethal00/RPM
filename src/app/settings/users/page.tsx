"use client"

import DashboardLayout from "@/components/dashboard-layout"
import { UserManager } from "@/components/user-manager"

export default function UsersPage() {
    return (
        <DashboardLayout>
            <div className="p-6 max-w-7xl mx-auto space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-primary">Portal Settings</h1>
                    <p className="text-muted-foreground mt-2">Manage your platform configuration, users, and masters.</p>
                </div>
                
                <UserManager />
            </div>
        </DashboardLayout>
    )
}
