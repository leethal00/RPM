import { Badge } from "@/components/ui/badge"
import { MapPin, Phone, User, Calendar, Heart } from "lucide-react"

interface StoreHeaderProps {
    store: {
        name: string
        address: string
        region: string
        status: string
        manager_name?: string
        manager_phone?: string
        site_category?: string
        has_drive_thru?: boolean
        brand_st_pierres?: boolean
        brand_bento_bowl?: boolean
        brand_k10?: boolean
        lat?: number
        lng?: number
        maintenance_score?: number
    }
}

export function StoreHeader({ store }: StoreHeaderProps) {
    const statusColors: Record<string, string> = {
        active: "bg-green-500",
        maintenance: "bg-amber-500",
        inactive: "bg-red-500",
    }

    return (
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between py-6 border-b">
            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-4">
                    <h1 className="text-3xl font-bold tracking-tight">{store.name}</h1>
                    <div className="flex flex-wrap items-center gap-3">
                        <Badge className={`${statusColors[store.status] || "bg-gray-500"} text-white uppercase`}>
                            {store.status}
                        </Badge>

                        {/* Brand Logos */}
                        <div className="flex items-center gap-2 px-2 py-1 bg-muted/20 rounded-lg border">
                            {store.brand_st_pierres !== false && (
                                <img src="/brands/st-pierres.png" alt="St Pierre's" className="h-8 w-auto object-contain" title="St Pierre's Sushi" />
                            )}
                            {store.brand_bento_bowl && (
                                <img src="/brands/bento-bowl.png" alt="Bento Bowl" className="h-8 w-auto object-contain" title="Bento Bowl" />
                            )}
                            {store.brand_k10 && (
                                <img src="/brands/k10.png" alt="K10" className="h-8 w-auto object-contain" title="K10 Sushi Train" />
                            )}
                        </div>

                        {store.site_category && (
                            <Badge variant="outline" className="text-muted-foreground uppercase text-[10px]">
                                {store.site_category}
                            </Badge>
                        )}
                        {store.has_drive_thru && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 uppercase text-[10px]">
                                DRIVE THRU
                            </Badge>
                        )}

                        <Badge
                            variant="outline"
                            className={`
                                font-black text-[10px] tracking-widest uppercase gap-1 px-2 py-1 border-2
                                ${store.maintenance_score && store.maintenance_score >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                    store.maintenance_score && store.maintenance_score >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                        'bg-red-50 text-red-700 border-red-200'}
                            `}
                        >
                            <Heart className="size-3 fill-current" />
                            Score: {store.maintenance_score ?? 100}
                        </Badge>
                    </div>
                </div>
                <div className="flex flex-col gap-2 text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <MapPin className="size-4" />
                        <div className="flex items-center gap-2 flex-wrap">
                            <span>{store.address}, {store.region}</span>
                            {store.lat && store.lng && (
                                <Badge variant="outline" className="h-4 py-0 text-[8px] bg-green-50 text-green-700 border-green-200 whitespace-nowrap">VERIFIED LOCATION</Badge>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground font-medium uppercase text-[10px] tracking-wider">Site Manager</span>
                    <div className="flex items-center gap-2">
                        <User className="size-4 text-primary" />
                        <span>{store.manager_name || "Not Assigned"}</span>
                    </div>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground font-medium uppercase text-[10px] tracking-wider">Contact</span>
                    <div className="flex items-center gap-2">
                        <Phone className="size-4 text-primary" />
                        <span>{store.manager_phone || "No Phone"}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
