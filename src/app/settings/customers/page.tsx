"use client"

import DashboardLayout from "@/components/dashboard-layout"
import { CustomerManager } from "@/components/customer-manager"
import { Users } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

export default function CustomersPage() {
    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader
                    icon={Users}
                    title="Customer Settings"
                    description="Manage customers, their brands, and site categorization."
                />
                <CustomerManager />
            </PageShell>
        </DashboardLayout>
    )
}
