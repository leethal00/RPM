"use client"

import DashboardLayout from "@/components/dashboard-layout"
import { RegionManager } from "@/components/region-manager"
import { MapPin } from "lucide-react"

export default function RegionsSettingsPage() {
    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 py-6 max-w-5xl mx-auto font-primary">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <MapPin className="size-8 text-primary" />
                        Region Settings
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm italic">
                        Manage defined geographical regions for site assignment.
                    </p>
                </div>

                <div className="animate-in fade-in duration-500">
                    <RegionManager />
                </div>
            </div>
        </DashboardLayout>
    )
}
