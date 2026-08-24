"use client"

import { use } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { JobForm } from "@/components/job-form"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import Link from "next/link"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

export default function NewStoreJobPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)

    return (
        <DashboardLayout>
            <PageShell width="narrow">
                <div>
                    <Button variant="ghost" size="sm" asChild className="-ml-2 h-8 text-muted-foreground hover:text-foreground">
                        <Link href={`/stores/${id}`} className="flex items-center gap-1">
                            <ChevronLeft className="size-4" />
                            Back to store
                        </Link>
                    </Button>
                </div>

                <PageHeader
                    title="Report local issue"
                    description="Logging a new fault for this specific site."
                />

                <JobForm storeId={id} />
            </PageShell>
        </DashboardLayout>
    )
}
