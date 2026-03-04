"use client"

import { use } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { JobForm } from "@/components/job-form"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import Link from "next/link"

export default function NewStoreJobPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 py-6 font-primary max-w-4xl mx-auto">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" asChild className="-ml-2 h-8">
                        <Link href={`/stores/${id}`} className="flex items-center gap-1 text-muted-foreground">
                            <ChevronLeft className="size-4" />
                            Back to Store
                        </Link>
                    </Button>
                </div>

                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">Report Local Issue</h1>
                    <p className="text-muted-foreground">Logging a new fault for this specific site.</p>
                </div>

                <div className="mt-4">
                    <JobForm storeId={id} />
                </div>
            </div>
        </DashboardLayout>
    )
}
