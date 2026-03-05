"use client"

import { Input } from "@/components/ui/input"
import { Search, Filter, MapPin } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import Link from "next/link"

interface Store {
    id: string
    name: string
    address: string
    lat: number
    lng: number
    status: string
    region: string
    brand_st_pierres?: boolean
    brand_bento_bowl?: boolean
    brand_k10?: boolean
    client?: {
        name: string
    }
}

interface StoreListProps {
    stores: Store[]
    onStoreClick: (store: Store) => void
    selectedStoreId?: string
    searchTerm: string
    onSearchChange: (value: string) => void
}

export function StoreList({ stores, onStoreClick, selectedStoreId, searchTerm, onSearchChange }: StoreListProps) {
    return (
        <div className="flex h-full flex-col gap-4 border-l bg-card p-4">
            <div className="flex items-center gap-2 relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search sites..."
                    className="pl-9 h-9"
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>{stores.length} Sites showing</span>
                <button className="flex items-center gap-1 hover:text-foreground">
                    <Filter className="size-3" />
                    Filter
                </button>
            </div>

            <ScrollArea className="flex-1 -mx-4 h-full">
                <div className="px-4 space-y-3 pb-4">
                    {stores.map((store) => (
                        <div
                            key={store.id}
                            className={`flex flex-col rounded-xl overflow-hidden border transition-all ${selectedStoreId === store.id
                                ? "bg-muted/50 border-primary ring-1 ring-primary/20 shadow-md"
                                : "bg-card hover:border-muted-foreground/30 border-border"
                                }`}
                        >
                            <div className="p-3 border-b border-muted/50">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                    <div className="flex flex-col gap-0.5 min-w-0">
                                        {store.client?.name && (
                                            <span className="text-[10px] font-black uppercase text-primary tracking-wider truncate mb-0.5">
                                                {store.client.name}
                                            </span>
                                        )}
                                        <h3 className="font-bold text-sm tracking-tight leading-tight break-words pr-2">{store.name}</h3>
                                        <div className="flex items-center gap-1">
                                            {store.brand_st_pierres !== false && (
                                                <div className="h-12 w-12 rounded-xl bg-white p-1 border-2 shadow-sm flex items-center justify-center">
                                                    <img src="/brands/st-pierres.png" alt="SP" className="h-full w-full object-contain" title="St Pierre's Sushi" />
                                                </div>
                                            )}
                                            {store.brand_bento_bowl && (
                                                <div className="h-12 w-12 rounded-xl bg-white p-1 border-2 shadow-sm flex items-center justify-center">
                                                    <img src="/brands/bento-bowl.png" alt="BB" className="h-full w-full object-contain" title="Bento Bowl" />
                                                </div>
                                            )}
                                            {store.brand_k10 && (
                                                <div className="h-12 w-12 rounded-xl bg-white p-1 border-2 shadow-sm flex items-center justify-center">
                                                    <img src="/brands/k10.png" alt="K10" className="h-full w-full object-contain" title="K10 Sushi Train" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className={`size-2.5 rounded-full shrink-0 mt-1 ${store.status === 'active' ? 'bg-green-500' :
                                        store.status === 'maintenance' ? 'bg-amber-500' : 'bg-red-500'
                                        }`} />
                                </div>
                                <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground mt-1">
                                    <MapPin className="size-3 mt-0.5 shrink-0" />
                                    <span className="whitespace-normal break-words leading-tight">{store.address}</span>
                                    {store.lat && store.lng && (
                                        <div className="ml-auto size-1.5 rounded-full bg-green-500 shrink-0 mt-1" title="Verified Location" />
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 divide-x divide-muted/50 bg-muted/5">
                                <button
                                    onClick={() => onStoreClick(store)}
                                    className="flex items-center justify-center py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all"
                                >
                                    Map
                                </button>
                                <Link
                                    href={`/stores/${store.id}`}
                                    className="flex items-center justify-center py-2.5 text-[10px] font-black uppercase tracking-wider text-primary hover:bg-primary/5 transition-all text-center"
                                >
                                    Details →
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    )
}
