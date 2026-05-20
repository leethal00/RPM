"use client"

import DashboardLayout from "@/components/dashboard-layout"
import { AssetTypeManager } from "@/components/asset-type-manager"
import { Layers } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

export default function AssetTypesSettingsPage() {
    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader
                    icon={Layers}
                    title="Asset Classifications"
                    description="Define the standard types for site assets and equipment."
                />
                <AssetTypeManager />
            </PageShell>
        </DashboardLayout>
    )
}
