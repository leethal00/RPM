"use client"

import DashboardLayout from "@/components/dashboard-layout"
import { RegionManager } from "@/components/region-manager"
import { MapPin } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

export default function RegionsSettingsPage() {
    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader
                    icon={MapPin}
                    title="Region Settings"
                    description="Manage defined geographical regions for site assignment."
                />
                <RegionManager />
            </PageShell>
        </DashboardLayout>
    )
}
