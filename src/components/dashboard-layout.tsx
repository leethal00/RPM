"use client"

import { useEffect, useState } from "react"
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ThemeToggle } from "@/components/theme-toggle"
import { SessionTimeoutDialog } from "@/components/session-timeout-dialog"
import { createClient } from "@/lib/supabase/client"
import { CustomerFilterDropdown } from "@/components/customer-filter-dropdown"

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [sessionExpired, setSessionExpired] = useState(false)

    useEffect(() => {
        const supabase = createClient()

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
            if (event === 'SIGNED_OUT') {
                setSessionExpired(true)
            }
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [])

    return (
        <TooltipProvider>
            <SidebarProvider>
                <AppSidebar />
                <SidebarInset>
                    <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
                        <div className="flex items-center gap-2">
                            <SidebarTrigger className="-ml-1" />
                            <Separator orientation="vertical" className="mr-2 h-4" />
                            <div className="flex items-center gap-3 px-4">
                                <img
                                    src="/R.jpg"
                                    alt="Rodier"
                                    className="h-9 w-9 rounded-full object-cover"
                                />
                                <h1 className="text-lg font-semibold tracking-tight text-foreground">
                                Rodier Property Management
                                </h1>
                                <CustomerFilterDropdown />
                        </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <ThemeToggle />
                        </div>
                    </header>
                    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
                        {children}
                    </div>
                </SidebarInset>
                <SessionTimeoutDialog open={sessionExpired} />
            </SidebarProvider>
        </TooltipProvider>
    )
}
