"use client"

import DashboardLayout from "@/components/dashboard-layout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RegionManager } from "@/components/region-manager"
import { AssetTypeManager } from "@/components/asset-type-manager"
import { Settings, MapPin, Layers } from "lucide-react"

export default function SettingsPage() {
    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 py-6 max-w-5xl mx-auto font-primary">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Settings className="size-8 text-primary" />
                        Portal Settings
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm italic">
                        Manage global configurations, regions, and asset classifications.
                    </p>
                </div>

                <Tabs defaultValue="regions" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 max-w-md bg-muted/50 p-1 rounded-xl">
                        <TabsTrigger value="regions" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <MapPin className="size-4" />
                            Regions
                        </TabsTrigger>
                        <TabsTrigger value="asset-types" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <Layers className="size-4" />
                            Asset Classifications
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="regions" className="pt-6 animate-in fade-in duration-500">
                        <RegionManager />
                    </TabsContent>

                    <TabsContent value="asset-types" className="pt-6 animate-in fade-in duration-500">
                        <AssetTypeManager />
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    )
}
