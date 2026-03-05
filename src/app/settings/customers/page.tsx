"use client"

import DashboardLayout from "@/components/dashboard-layout"
import { CustomerManager } from "@/components/customer-manager"
import { Users } from "lucide-react"

export default function CustomersPage() {
    return (
        <DashboardLayout>
            <div className="flex flex-col gap-6 py-6 max-w-5xl mx-auto font-primary">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Users className="size-8 text-primary" />
                        Customer Settings
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm italic">
                        Manage defined customers and clients for site categorization.
                    </p>
                </div>

                <div className="animate-in fade-in duration-500">
                    <CustomerManager />
                </div>
            </div>
        </DashboardLayout>
    )
}
