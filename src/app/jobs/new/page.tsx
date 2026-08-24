"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { JobForm } from "@/components/job-form"
import { createClient } from "@/lib/supabase/client"
import type { Store } from "@/types/database"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { MapPin } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

export default function GlobalNewJobPage() {
    const [stores, setStores] = useState<Store[]>([])
    const [selectedStoreId, setSelectedStoreId] = useState<string>("")
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        async function fetchStores() {
            const { data } = await supabase
                .from('stores')
                .select('id, name, region')
                .order('name')
            setStores(data || [])
            setLoading(false)
        }
        fetchStores()
    }, [supabase])

    return (
        <DashboardLayout>
            <PageShell width="narrow">
                <PageHeader
                    title="Report a fault"
                    description="Follow the steps below to log a new maintenance request."
                />

                <Card>
                    <CardContent className="pt-6 space-y-2">
                        <Label htmlFor="store-select" className="text-xs font-medium text-muted-foreground">
                            Step 1 — select the site
                        </Label>
                        <div className="flex items-center gap-2">
                            <MapPin className="size-4 text-muted-foreground shrink-0" />
                            <Select
                                value={selectedStoreId}
                                onValueChange={setSelectedStoreId}
                                disabled={loading}
                            >
                                <SelectTrigger id="store-select" className="flex-1">
                                    <SelectValue placeholder={loading ? "Loading sites…" : "Choose a site…"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {stores.map((store) => (
                                        <SelectItem key={store.id} value={store.id}>
                                            {store.name} {store.region && <span className="text-muted-foreground">({store.region})</span>}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {selectedStoreId && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-3">
                        <Label className="text-xs font-medium text-muted-foreground">
                            Step 2 — describe the issue
                        </Label>
                        <JobForm storeId={selectedStoreId} />
                    </div>
                )}
            </PageShell>
        </DashboardLayout>
    )
}
