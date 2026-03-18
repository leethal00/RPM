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
    MapPin,
    Layers,
    Users,
    UserCog,
    Lightbulb,
    HelpCircle,
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
    SidebarMenuSub,
    SidebarMenuSubItem,
    SidebarMenuSubButton,
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
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"

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
    const pathname = usePathname()
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
                                    <SidebarMenuButton asChild tooltip={item.title} isActive={pathname === item.url}>
                                        <Link href={item.url}>
                                            <item.icon className="size-4" />
                                            <span>{item.title}</span>
                                        </Link>
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
                                    <SidebarMenuButton asChild tooltip={item.title} isActive={pathname === item.url}>
                                        <Link href={item.url}>
                                            <item.icon className="size-4" />
                                            <span>{item.title}</span>
                                        </Link>
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
                                    <SidebarMenuButton asChild tooltip={item.title} isActive={pathname === item.url}>
                                        <Link href={item.url}>
                                            <item.icon className="size-4" />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel>Administration</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild isActive={pathname.startsWith('/settings')}>
                                    <div className="flex items-center gap-2 cursor-pointer w-full">
                                        <Settings className="size-4" />
                                        <span>Portal Settings</span>
                                    </div>
                                </SidebarMenuButton>
                                <SidebarMenuSub>
                                    <SidebarMenuSubItem>
                                        <SidebarMenuSubButton asChild isActive={pathname === '/settings/users'}>
                                            <Link href="/settings/users" className="flex items-center gap-2">
                                                <UserCog className="size-3.5" />
                                                <span>Users</span>
                                            </Link>
                                        </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                    <SidebarMenuSubItem>
                                        <SidebarMenuSubButton asChild isActive={pathname === '/settings/customers'}>
                                            <Link href="/settings/customers" className="flex items-center gap-2">
                                                <Users className="size-3.5" />
                                                <span>Customers</span>
                                            </Link>
                                        </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                    <SidebarMenuSubItem>
                                        <SidebarMenuSubButton asChild isActive={pathname === '/settings/regions'}>
                                            <Link href="/settings/regions" className="flex items-center gap-2">
                                                <MapPin className="size-3.5" />
                                                <span>Regions</span>
                                            </Link>
                                        </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                    <SidebarMenuSubItem>
                                        <SidebarMenuSubButton asChild isActive={pathname === '/settings/asset-types'}>
                                            <Link href="/settings/asset-types" className="flex items-center gap-2">
                                                <Layers className="size-3.5" />
                                                <span>Asset Classifications</span>
                                            </Link>
                                        </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                </SidebarMenuSub>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel>Support</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild tooltip="Help & Support" isActive={pathname === '/help'}>
                                    <Link href="/help">
                                        <HelpCircle className="size-4" />
                                        <span>Help & Support</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild tooltip="New Feature Request" isActive={pathname === '/feature-request'}>
                                    <Link href="/feature-request">
                                        <Lightbulb className="size-4" />
                                        <span>New Feature</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild tooltip="View Feature Requests" isActive={pathname === '/feature-requests'}>
                                    <Link href="/feature-requests">
                                        <ClipboardList className="size-4" />
                                        <span>Feature Requests</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
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
        </Sidebar >
    )
}
