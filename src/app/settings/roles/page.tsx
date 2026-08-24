"use client"

import DashboardLayout from "@/components/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ShieldCheck, Crown, Hammer, Building2, Store, Check, Minus } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import type { UserRole } from "@/types/database"

interface RoleInfo {
    role: UserRole
    label: string
    description: string
    icon: typeof Crown
    headcountHint: string
}

const ROLES: RoleInfo[] = [
    {
        role: "super_admin",
        label: "Super Admin",
        description: "Rodier internal platform owners. Full read/write everywhere.",
        icon: Crown,
        headcountHint: "Lee, Stu",
    },
    {
        role: "rodier_admin",
        label: "Rodier Admin",
        description: "Rodier operations staff. Same data access as super_admin but can't delete or manage users.",
        icon: ShieldCheck,
        headcountHint: "Hugo",
    },
    {
        role: "technician",
        label: "Technician",
        description: "Field service team. Sees jobs assigned to them and site/asset context needed to fix things.",
        icon: Hammer,
        headcountHint: "Future contractors",
    },
    {
        role: "client_hq",
        label: "Client HQ",
        description: "Customer's head office user. Sees everything for their customer (all sites, jobs, photos, vendors).",
        icon: Building2,
        headcountHint: "St Pierre's HQ, McDonald's HQ",
    },
    {
        role: "client_store",
        label: "Client Store",
        description: "Customer's individual store/site user. Restricted to the sites they're assigned to.",
        icon: Store,
        headcountHint: "Site managers",
    },
]

type Cell = "full" | "view" | "own" | "none"

interface Resource {
    key: string
    label: string
    description: string
    matrix: Record<UserRole, Cell>
}

const RESOURCES: Resource[] = [
    {
        key: "sites",
        label: "Sites Portfolio",
        description: "View, create, edit and delete site records.",
        matrix: {
            super_admin: "full",
            rodier_admin: "full",
            technician: "view",
            client_hq: "view",
            client_store: "own",
        },
    },
    {
        key: "assets",
        label: "Assets",
        description: "View and manage site assets (signage, equipment, fittings).",
        matrix: {
            super_admin: "full",
            rodier_admin: "full",
            technician: "view",
            client_hq: "view",
            client_store: "own",
        },
    },
    {
        key: "jobs",
        label: "Jobs / Faults",
        description: "Report, assign, progress and resolve maintenance tickets.",
        matrix: {
            super_admin: "full",
            rodier_admin: "full",
            technician: "view",
            client_hq: "view",
            client_store: "own",
        },
    },
    {
        key: "vendors",
        label: "Vendor Directory",
        description: "Manage external contractors and trade partners.",
        matrix: {
            super_admin: "full",
            rodier_admin: "full",
            technician: "view",
            client_hq: "view",
            client_store: "none",
        },
    },
    {
        key: "projects",
        label: "HQ Projects",
        description: "Strategic capital projects spanning multiple jobs and sites.",
        matrix: {
            super_admin: "full",
            rodier_admin: "full",
            technician: "none",
            client_hq: "view",
            client_store: "none",
        },
    },
    {
        key: "photos_normal",
        label: "Photos (standard)",
        description: "Photos uploaded against sites and assets that aren't flagged as internal.",
        matrix: {
            super_admin: "full",
            rodier_admin: "full",
            technician: "view",
            client_hq: "view",
            client_store: "own",
        },
    },
    {
        key: "photos_internal",
        label: "Photos (service-team only)",
        description: "Photos flagged \"internal_only\" at upload. Used for before/after shots and staff-only documentation.",
        matrix: {
            super_admin: "full",
            rodier_admin: "full",
            technician: "view",
            client_hq: "none",
            client_store: "none",
        },
    },
    {
        key: "users",
        label: "User Management",
        description: "Create, edit and remove user accounts.",
        matrix: {
            super_admin: "full",
            rodier_admin: "view",
            technician: "none",
            client_hq: "none",
            client_store: "none",
        },
    },
    {
        key: "customers",
        label: "Customer Management",
        description: "Add new customers, manage their brands and logo library.",
        matrix: {
            super_admin: "full",
            rodier_admin: "full",
            technician: "none",
            client_hq: "none",
            client_store: "none",
        },
    },
    {
        key: "settings",
        label: "Portal Settings",
        description: "Regions, asset classifications, and other system-wide lists.",
        matrix: {
            super_admin: "full",
            rodier_admin: "full",
            technician: "none",
            client_hq: "none",
            client_store: "none",
        },
    },
    {
        key: "ai_build",
        label: "AI Auto-Build",
        description: "Submit feature requests that automatically run the AI implementation workflow. Restricted further by the per-user developer_mode flag.",
        matrix: {
            super_admin: "view",
            rodier_admin: "none",
            technician: "none",
            client_hq: "none",
            client_store: "none",
        },
    },
]

function CellGlyph({ value }: { value: Cell }) {
    if (value === "full") {
        return (
            <span className="inline-flex items-center gap-1 text-xs">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span className="text-foreground">Full</span>
            </span>
        )
    }
    if (value === "view") {
        return (
            <span className="inline-flex items-center gap-1 text-xs">
                <span className="size-1.5 rounded-full bg-primary" />
                <span className="text-muted-foreground">View</span>
            </span>
        )
    }
    if (value === "own") {
        return (
            <span className="inline-flex items-center gap-1 text-xs">
                <span className="size-1.5 rounded-full bg-amber-500" />
                <span className="text-muted-foreground">Own only</span>
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/50">
            <Minus className="size-3" />
            None
        </span>
    )
}

export default function RolePermissionsPage() {
    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader
                    icon={ShieldCheck}
                    title="Role permissions"
                    description="Documentation of what each role can see and change today. Source of truth lives in RLS policies — this page reflects them."
                />

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {ROLES.map((r) => {
                        const Icon = r.icon
                        return (
                            <Card key={r.role}>
                                <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
                                    <Icon className="size-4 text-muted-foreground" />
                                    <CardTitle className="text-sm font-medium">{r.label}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground leading-relaxed">{r.description}</p>
                                    <p className="text-xs text-muted-foreground/70 mt-2">e.g. {r.headcountHint}</p>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>

                <Card>
                    <CardHeader className="pb-3 border-b border-border/60">
                        <CardTitle className="text-sm font-medium">Permission matrix</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border/40 text-left">
                                    <th className="text-xs font-medium text-muted-foreground py-3 px-4 sticky left-0 bg-card">Resource</th>
                                    {ROLES.map(r => (
                                        <th key={r.role} className="text-xs font-medium text-muted-foreground py-3 px-3 min-w-[110px]">
                                            {r.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {RESOURCES.map(res => (
                                    <tr key={res.key} className="border-b border-border/40 last:border-b-0 hover:bg-accent/30 transition-colors">
                                        <td className="py-3 px-4 sticky left-0 bg-card">
                                            <div className="font-medium text-foreground">{res.label}</div>
                                            <div className="text-xs text-muted-foreground mt-0.5 max-w-md">{res.description}</div>
                                        </td>
                                        {ROLES.map(r => (
                                            <td key={r.role} className="py-3 px-3">
                                                <CellGlyph value={res.matrix[r.role]} />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6 text-xs text-muted-foreground space-y-2">
                        <p className="flex items-center gap-2">
                            <Check className="size-3.5 text-emerald-500" />
                            <span><span className="font-medium text-foreground">Full</span> — full read + write.</span>
                        </p>
                        <p className="flex items-center gap-2">
                            <Check className="size-3.5 text-primary" />
                            <span><span className="font-medium text-foreground">View</span> — read only across the customer / portfolio.</span>
                        </p>
                        <p className="flex items-center gap-2">
                            <Check className="size-3.5 text-amber-500" />
                            <span><span className="font-medium text-foreground">Own only</span> — restricted to the user&apos;s own assigned sites.</span>
                        </p>
                        <p className="flex items-center gap-2">
                            <Minus className="size-3.5" />
                            <span><span className="font-medium text-foreground">None</span> — not visible at all.</span>
                        </p>
                        <p className="pt-3 border-t border-border/40 mt-3">
                            This matrix is read-only. Permission changes happen in the database via RLS migrations, then this page is updated to match. Future versions may surface inline edit.
                        </p>
                    </CardContent>
                </Card>
            </PageShell>
        </DashboardLayout>
    )
}
