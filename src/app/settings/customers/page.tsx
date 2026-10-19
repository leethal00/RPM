"use client"

import DashboardLayout from "@/components/dashboard-layout"
import { CustomerManager } from "@/components/customer-manager"
import { Users } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function CustomersPage() {
    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader
                    icon={Users}
                    title="Customer Settings"
                    description="Manage customers, their brands, and site categorization."
                />
                <div className="mb-4"><Button variant="outline" asChild><Link href="/settings/mcdonalds-sites">Match McDonalds sites</Link></Button></div>
                <CustomerManager />
            </PageShell>
        </DashboardLayout>
    )
}
