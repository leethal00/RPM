"use client"

import DashboardLayout from "@/components/dashboard-layout"
import { AssetTypeManager } from "@/components/asset-type-manager"
import { Layers } from "lucide-react"

export default function AssetTypesSettingsPage() {
    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 py-6 max-w-5xl mx-auto font-primary">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Layers className="size-8 text-primary" />
                        Asset Classifications
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm italic">
                        Define the 4-level hierarchy for site assets and equipment.
                    </p>
                </div>

                <div className="animate-in fade-in duration-500">
                    <AssetTypeManager />
                </div>
            </div>
        </DashboardLayout>
    )
}
