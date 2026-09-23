"use client"

import * as React from "react"
import { Map, ClipboardList, BarChart3, Settings, PlusCircle, Building2, Calendar, Briefcase, Hammer, MapPin, Layers, Users, UserCog, Lightbulb, HelpCircle, Calculator, Package2, LogIn, Wrench, Clock, Truck, ChevronDown } from "lucide-react"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import type { User } from "@supabase/supabase-js"
import type { UserProfile, UserRole } from "@/types/database"

type NavItem = {
    title: string
    url: string
    icon: React.ComponentType<{ className?: string }>
    visibility?: "staff" | "operator"
}
type NavSection = {
    id: string
    title: string
    icon: React.ComponentType<{ className?: string }>
    items: NavItem[]
}

// All existing sidebar destinations live here. These visibility rules retain
// the old client/operator menus; actual access remains in middleware and RLS.
const sections: NavSection[] = [
    { id: "my-rpm", title: "My RPM", icon: Map, items: [
        { title: "Map View", url: "/", icon: Map },
        { title: "Sites / List", url: "/stores", icon: Building2 },
        { title: "Time Entries", url: "/quoting/time", icon: Clock, visibility: "staff" },
        { title: "Help & Support", url: "/help", icon: HelpCircle },
    ] },
    { id: "sales", title: "Sales", icon: Calculator, items: [
        { title: "Leads & To Do", url: "/leads", icon: ClipboardList, visibility: "staff" },
        { title: "Quotes", url: "/quoting", icon: Calculator, visibility: "staff" },
    ] },
    { id: "jobs-production", title: "Jobs & Production", icon: Hammer, items: [
        { title: "Projects & Tasks", url: "/tasks", icon: Briefcase },
        { title: "PM Scheduler", url: "/maintenance/pm", icon: Hammer },
        { title: "Maintenance", url: "/maintenance", icon: Calendar },
        { title: "Jobs", url: "/quoting/jobs", icon: Briefcase, visibility: "staff" },
        { title: "My department jobs", url: "/production", icon: Hammer, visibility: "operator" },
    ] },
    { id: "resources", title: "Resources", icon: Layers, items: [
        { title: "Vendors", url: "/vendors", icon: Briefcase, visibility: "staff" },
        { title: "Products", url: "/quoting/products", icon: Package2, visibility: "staff" },
        { title: "Catalogue", url: "/quoting/catalogue", icon: Layers, visibility: "staff" },
        { title: "Suppliers", url: "/quoting/suppliers", icon: Truck, visibility: "staff" },
    ] },
    { id: "management", title: "Management", icon: BarChart3, items: [
        { title: "Analysis", url: "/analysis", icon: BarChart3 },
    ] },
    { id: "development", title: "Development", icon: Wrench, items: [
        { title: "RPM Development", url: "/development", icon: Wrench, visibility: "staff" },
        { title: "Strategic Portfolio", url: "/projects", icon: PlusCircle, visibility: "staff" },
        { title: "Suggest a feature", url: "/feature-request", icon: Lightbulb, visibility: "staff" },
    ] },
    { id: "system-admin", title: "System / Admin", icon: Settings, items: [
        { title: "Users", url: "/settings/users", icon: UserCog, visibility: "staff" },
        { title: "Customers", url: "/settings/customers", icon: Users, visibility: "staff" },
        { title: "Regions", url: "/settings/regions", icon: MapPin, visibility: "staff" },
        { title: "Asset Classifications", url: "/settings/asset-types", icon: Layers, visibility: "staff" },
        { title: "Production access", url: "/settings/production", icon: Hammer, visibility: "staff" },
        { title: "Role permissions", url: "/settings/roles", icon: UserCog, visibility: "staff" },
    ] },
]

function visibleToRole(item: NavItem, role: UserRole | undefined) {
    if (role === "department_operator") return item.visibility === "operator"
    if (item.visibility === "operator") return false
    if (role === "client_hq" || role === "client_store") return item.visibility !== "staff"
    return true
}

function itemIsActive(url: string, pathname: string) {
    if (url === "/") return pathname === "/"
    if (url === "/quoting") return pathname === "/quoting" || (pathname.startsWith("/quoting/") && !["jobs", "time", "products", "catalogue", "suppliers"].some(part => pathname.startsWith("/quoting/" + part)))
    return pathname === url || pathname.startsWith(url + "/")
}

const defaultOpen = ["my-rpm", "jobs-production"]

export function AppSidebar() {
    const supabase = createClient(), router = useRouter(), pathname = usePathname()
    const [user, setUser] = React.useState<User | null>(null)
    const [profile, setProfile] = React.useState<UserProfile | null>(null)
    const [loading, setLoading] = React.useState(true)
    const [openSections, setOpenSections] = React.useState<string[]>(defaultOpen)
    React.useEffect(() => { async function fetchData() { const { data: { user } } = await supabase.auth.getUser(); setUser(user); if (user) { const { data } = await supabase.from("users").select("*").eq("id", user.id).single(); setProfile(data) }; setLoading(false) }; fetchData() }, [supabase])
    const handleSignOut = async () => { await supabase.auth.signOut(); router.push("/login"); router.refresh() }
    const handleSwitchAccount = async () => { await supabase.auth.signOut(); router.push("/login?switch=1"); router.refresh() }
    const userName = profile?.name || user?.email?.split("@")[0] || "User", userEmail = user?.email || "user@example.com", userInitials = userName.substring(0, 2).toUpperCase()
    const visibleSections = React.useMemo(() => sections.map(section => ({ ...section, items: section.items.filter(item => visibleToRole(item, profile?.role)) })).filter(section => section.items.length > 0), [profile?.role])
    const storageKey = user ? "rpm-sidebar-sections:" + user.id : null

    React.useEffect(() => {
        if (!storageKey) return
        let cancelled = false
        queueMicrotask(() => {
            if (cancelled) return
            try {
                const saved = window.localStorage.getItem(storageKey)
                if (saved) {
                    const parsed: unknown = JSON.parse(saved)
                    if (Array.isArray(parsed)) {
                        setOpenSections(parsed.filter((id): id is string => typeof id === "string" && sections.some(section => section.id === id)))
                        return
                    }
                }
            } catch { /* Browser storage may be unavailable. */ }
            const activeSection = visibleSections.find(section => section.items.some(item => itemIsActive(item.url, pathname)))
            setOpenSections(activeSection ? [...new Set([...defaultOpen, activeSection.id])] : defaultOpen)
        })
        return () => { cancelled = true }
    }, [storageKey, visibleSections, pathname])

    const toggleSection = (id: string) => {
        setOpenSections(current => {
            const next = current.includes(id) ? current.filter(section => section !== id) : [...current, id]
            if (storageKey) {
                try { window.localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* Browser storage may be unavailable. */ }
            }
            return next
        })
    }

    return <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border p-4"><div className="flex items-center gap-2 px-2"><div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Building2 className="size-4" /></div><div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden"><span className="font-semibold text-sidebar-foreground">RPM</span><span className="text-xs text-sidebar-foreground/60">Rodier Property</span></div></div></SidebarHeader>
        <SidebarContent>
            {!loading && <>
                {profile?.role !== "department_operator" && <div className="px-4 pt-4 group-data-[collapsible=icon]:px-2"><SidebarMenuButton asChild tooltip="Report Fault" className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground font-medium"><Link href="/jobs/new"><PlusCircle className="size-4" /><span>Report Fault</span></Link></SidebarMenuButton></div>}
                {visibleSections.map(section => {
                    const isOpen = openSections.includes(section.id)
                    const isActive = section.items.some(item => itemIsActive(item.url, pathname))
                    return <SidebarGroup key={section.id} className="py-1 group-data-[collapsible=icon]:px-2">
                        <button type="button" aria-expanded={isOpen} aria-controls={"sidebar-section-" + section.id} onClick={() => toggleSection(section.id)} title={section.title} className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-semibold text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${isActive ? "text-sidebar-foreground" : ""}`}>
                            <section.icon className="size-4 shrink-0" />
                            <span className="flex-1 group-data-[collapsible=icon]:hidden">{section.title}</span>
                            <ChevronDown className={`size-4 shrink-0 transition-transform group-data-[collapsible=icon]:hidden ${isOpen ? "" : "-rotate-90"}`} />
                        </button>
                        {isOpen && <SidebarGroupContent id={"sidebar-section-" + section.id} className="pt-1"><SidebarMenu>{section.items.map(item => <SidebarMenuItem key={item.url}><SidebarMenuButton asChild tooltip={item.title} isActive={itemIsActive(item.url, pathname)}><Link href={item.url}><item.icon className="size-4" /><span>{item.title}</span></Link></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent>}
                    </SidebarGroup>
                })}
            </>}
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-4"><SidebarMenu><SidebarMenuItem><DropdownMenu><DropdownMenuTrigger asChild><SidebarMenuButton size="lg"><Avatar className="h-8 w-8 rounded-lg"><AvatarImage src={profile?.avatar_url || ""} alt={userName} /><AvatarFallback>{userInitials}</AvatarFallback></Avatar><div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden"><span className="truncate font-semibold">{loading ? "Loading..." : userName}</span><span className="truncate text-xs text-sidebar-foreground/60">{loading ? "..." : userEmail}</span></div></SidebarMenuButton></DropdownMenuTrigger><DropdownMenuContent className="min-w-56" side="bottom" align="end"><DropdownMenuLabel>{userName}<div className="text-xs font-normal">{userEmail}</div></DropdownMenuLabel><DropdownMenuSeparator />{user && <DropdownMenuItem asChild><a href="/profile"><Settings className="mr-2 size-4" />Profile Settings</a></DropdownMenuItem>}<DropdownMenuItem onClick={handleSwitchAccount}><LogIn className="mr-2 size-4" />Switch account</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={handleSignOut}>Log out</DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarMenuItem></SidebarMenu></SidebarFooter>
    </Sidebar>
}
