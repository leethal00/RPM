import { Badge } from "@/components/ui/badge"
import { MapPin, Phone, User, Calendar } from "lucide-react"

interface StoreHeaderProps {
    store: {
        name: string
        address: string
        region: string
        status: string
        manager_name?: string
        manager_phone?: string
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
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-bold tracking-tight">{store.name}</h1>
                    <Badge className={`${statusColors[store.status] || "bg-gray-500"} text-white uppercase`}>
                        {store.status}
                    </Badge>
                </div>
                <div className="flex flex-col gap-2 text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <MapPin className="size-4" />
                        <span>{store.address}, {store.region}</span>
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
