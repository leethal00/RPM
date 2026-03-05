"use client"

import * as React from "react"
import {
    Map,
    LayoutDashboard,
    ClipboardList,
    BarChart3,
    Settings,
    PlusCircle,
    Building2,
    Calendar,
    Briefcase,
    Hammer,
} from "lucide-react"

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

const navItems = [
    {
        title: "Map View",
        url: "/",
        icon: Map,
    },
    {
        title: "Sites / List",
        url: "/stores",
        icon: Building2,
    },
    {
        title: "Analysis",
        url: "/analysis",
        icon: BarChart3,
    },
    {
        title: "Active Jobs",
        url: "/jobs",
        icon: ClipboardList,
    },
    {
        title: "PM Scheduler",
        url: "/maintenance/pm",
        icon: Hammer,
    },
    {
        title: "Maintenance",
        url: "/maintenance",
        icon: Calendar,
    },
]

const supplyChainItems = [
    {
        title: "Vendors",
        url: "/vendors",
        icon: Briefcase,
    },
]

const projectItems = [
    {
        title: "HQ Projects",
        url: "/projects",
        icon: PlusCircle,
    },
]

export function AppSidebar() {
    const supabase = createClient()
    const router = useRouter()
    const [user, setUser] = React.useState<any>(null)
    const [profile, setProfile] = React.useState<any>(null)
    const [loading, setLoading] = React.useState(true)

    React.useEffect(() => {
        async function fetchData() {
            const { data: { user } } = await supabase.auth.getUser()
            setUser(user)

            if (user) {
                // Fetch Profile
                const { data: profileData } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', user.id)
                    .single()
                setProfile(profileData)
            }
            setLoading(false)
        }
        fetchData()
    }, [supabase])

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push("/login")
        router.refresh()
    }

    const userName = profile?.full_name || user?.email?.split('@')[0] || "User"
    const userEmail = user?.email || "user@example.com"
    const userInitials = userName.substring(0, 2).toUpperCase()

    return (
        <Sidebar collapsible="icon" className="border-r border-sidebar-border">
            <SidebarHeader className="border-b border-sidebar-border p-4">
                <div className="flex items-center gap-2 px-2">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Building2 className="size-4" />
                    </div>
                    <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                        <span className="font-semibold text-sidebar-foreground">RPM</span>
                        <span className="text-xs text-sidebar-foreground/60">Rodier Property</span>
                    </div>
                </div>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <div className="px-2 pt-2 mb-2">
                        <SidebarMenuButton
                            asChild
                            className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground font-bold shadow-sm"
                        >
                            <a href="/jobs/new" className="flex items-center gap-2">
                                <PlusCircle className="size-4" />
                                <span>Report Fault</span>
                            </a>
                        </SidebarMenuButton>
                    </div>
                    <SidebarGroupLabel>Main Navigation</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {navItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild tooltip={item.title}>
                                        <a href={item.url}>
                                            <item.icon className="size-4" />
                                            <span>{item.title}</span>
                                        </a>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>


                <SidebarGroup>
                    <SidebarGroupLabel>Supply Chain</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {supplyChainItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild tooltip={item.title}>
                                        <a href={item.url}>
                                            <item.icon className="size-4" />
                                            <span>{item.title}</span>
                                        </a>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel>Strategic Portfolio</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {projectItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild tooltip={item.title}>
                                        <a href={item.url}>
                                            <item.icon className="size-4" />
                                            <span>{item.title}</span>
                                        </a>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

            </SidebarContent>
            <SidebarFooter className="border-t border-sidebar-border p-4">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <SidebarMenuButton
                                    size="lg"
                                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                                >
                                    <Avatar className="h-8 w-8 rounded-lg">
                                        <AvatarImage src={profile?.avatar_url || ""} alt={userName} />
                                        <AvatarFallback className="rounded-lg">{userInitials}</AvatarFallback>
                                    </Avatar>
                                    <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                                        <span className="truncate font-semibold">{loading ? "Loading..." : userName}</span>
                                        <span className="truncate text-xs text-sidebar-foreground/60">{loading ? "..." : userEmail}</span>
                                    </div>
                                </SidebarMenuButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                                side="bottom"
                                align="end"
                                sideOffset={4}
                            >
                                <DropdownMenuLabel className="p-0 font-normal">
                                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                        <Avatar className="h-8 w-8 rounded-lg">
                                            <AvatarFallback className="rounded-lg">{userInitials}</AvatarFallback>
                                        </Avatar>
                                        <div className="grid flex-1 text-left text-sm leading-tight">
                                            <span className="truncate font-semibold">{userName}</span>
                                            <span className="truncate text-xs">{userEmail}</span>
                                        </div>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {user && (
                                    <DropdownMenuItem asChild>
                                        <a href="/profile">
                                            <Settings className="mr-2 size-4" />
                                            Profile Settings
                                        </a>
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleSignOut}>
                                    Log out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    )
}
