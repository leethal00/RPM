"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { JobForm } from "@/components/job-form"
import { createClient } from "@/lib/supabase/client"
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

export default function GlobalNewJobPage() {
    const [stores, setStores] = useState<any[]>([])
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
            <div className="flex flex-col gap-6 py-6 font-primary max-w-4xl mx-auto">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">Report Fault</h1>
                    <p className="text-muted-foreground italic">Follow the steps below to log a new maintenance request.</p>
                </div>

                <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="pt-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="store-select" className="text-sm font-bold uppercase tracking-wider text-primary">
                                    Step 1: Select the Site
                                </Label>
                                <div className="flex items-center gap-3">
                                    <MapPin className="size-5 text-primary shrink-0" />
                                    <Select
                                        value={selectedStoreId}
                                        onValueChange={setSelectedStoreId}
                                        disabled={loading}
                                    >
                                        <SelectTrigger id="store-select" className="bg-background">
                                            <SelectValue placeholder={loading ? "Loading sites..." : "Choose a St Pierre's site..."} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {stores.map((store) => (
                                                <SelectItem key={store.id} value={store.id}>
                                                    {store.name} ({store.region})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {selectedStoreId && (
                    <div className="mt-4 animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="mb-6">
                            <Label className="text-sm font-bold uppercase tracking-wider text-primary">
                                Step 2: Describe the Issue
                            </Label>
                        </div>
                        <JobForm storeId={selectedStoreId} />
                    </div>
                )}
            </div>
        </DashboardLayout>
    )
}
