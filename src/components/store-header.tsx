import { MapPin, Phone, User } from "lucide-react"
import type { Store } from "@/types/database"
import { BrandChips, brandsFromStore } from "@/components/brand-chip"
import { computeHealthScore, type HealthInputAsset, type HealthInputJob } from "@/lib/health-score"

interface StoreHeaderProps {
    store: Store
    /** Pass joined assets + jobs so the computed health score lights up. */
    assets?: HealthInputAsset[] | null
    jobs?: HealthInputJob[] | null
}

export function StoreHeader({ store, assets, jobs }: StoreHeaderProps) {
    const statusDot: Record<string, string> = {
        active: "bg-emerald-500",
        maintenance: "bg-amber-500",
        inactive: "bg-destructive",
    }
    const health = computeHealthScore({ assets, jobs })
    const healthDot =
        health.label === "unknown" ? "bg-muted-foreground/40" :
        health.label === "healthy" ? "bg-emerald-500" :
        health.label === "attention" ? "bg-amber-500" :
        "bg-destructive"
    const brands = brandsFromStore(store)

    return (
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between py-6 border-b border-border/60">
            <div className="space-y-3 min-w-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight">{store.name}</h1>
                    {brands.length > 0 && <BrandChips brands={brands} size="md" />}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                        <span className={`size-1.5 rounded-full ${statusDot[store.status] || "bg-muted-foreground"}`} />
                        <span className="capitalize">{store.status}</span>
                    </div>
                    {store.site_category && (
                        <>
                            <span className="text-muted-foreground/40">·</span>
                            <span>{store.site_category}</span>
                        </>
                    )}
                    {store.has_drive_thru && (
                        <>
                            <span className="text-muted-foreground/40">·</span>
                            <span>Drive-thru</span>
                        </>
                    )}
                    <span className="text-muted-foreground/40">·</span>
                    <div className="flex items-center gap-1.5" title={health.label === "unknown" ? "No data" : `${health.label} — ${health.score}`}>
                        <span className={`size-1.5 rounded-full ${healthDot}`} />
                        <span>Health {health.label === "unknown" ? "—" : health.score}</span>
                    </div>
                </div>
                <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="size-4 mt-0.5 shrink-0" />
                    <div className="flex items-center gap-2 flex-wrap">
                        <span>{store.address}{store.region ? `, ${store.region}` : ""}</span>
                        {store.lat && store.lng && (
                            store.location_approximate ? (
                                <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                                    <span className="size-1.5 rounded-full bg-amber-500" />
                                    Approximate — needs review
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <span className="size-1.5 rounded-full bg-emerald-500" />
                                    Verified
                                </span>
                            )
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm shrink-0">
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Site manager</span>
                    <div className="flex items-center gap-1.5">
                        <User className="size-3.5 text-muted-foreground" />
                        <span>{store.manager_name || <span className="text-muted-foreground">Not assigned</span>}</span>
                    </div>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Contact</span>
                    <div className="flex items-center gap-1.5">
                        <Phone className="size-3.5 text-muted-foreground" />
                        <span>{store.manager_phone || <span className="text-muted-foreground">—</span>}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
