"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
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
    const pathname = usePathname()

    // Catalogue is already the reference layout for the dense workspace. Apply the
    // same full-width/condensed treatment to the rest of Job & Project Management,
    // while leaving print/job-card pages untouched.
    const isJobProjectArea =
        pathname === "/leads" ||
        pathname.startsWith("/quoting") ||
        pathname.startsWith("/projects") ||
        pathname.startsWith("/tasks")
    const compactWorkspace =
        isJobProjectArea &&
        !pathname.startsWith("/quoting/catalogue") &&
        !pathname.includes("/job-card")

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
                    <header className="flex h-14 shrink-0 items-center justify-between border-b px-3 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-11">
                        <div className="flex items-center gap-2">
                            <SidebarTrigger className="-ml-1" />
                            <Separator orientation="vertical" className="mr-1 h-4" />
                            <div className="flex items-center gap-2 px-2">
                                <img
                                    src="/R.jpg"
                                    alt="Rodier"
                                    className="h-8 w-8 rounded-full object-cover"
                                />
                                <h1 className="text-lg font-semibold tracking-tight text-foreground">
                                Rodier Property Management
                                </h1>
                                <CustomerFilterDropdown />
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <ThemeToggle />
                        </div>
                    </header>
                    <div className={`flex flex-1 flex-col gap-3 p-3 pt-0 ${compactWorkspace ? "rpm-compact-workspace" : ""}`}>
                        {children}
                    </div>
                </SidebarInset>
                <SessionTimeoutDialog open={sessionExpired} />
            </SidebarProvider>
        </TooltipProvider>
    )
}
