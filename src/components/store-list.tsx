"use client"

import { Input } from "@/components/ui/input"
import { Search, ChevronRight } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import Link from "next/link"
import type { Store } from "@/types/database"
import { BrandChips, brandsFromStore } from "@/components/brand-chip"
import { CustomerFilterDropdown } from "@/components/customer-filter-dropdown"

interface StoreListProps {
    stores: Store[]
    onStoreClick: (store: Store) => void
    selectedStoreId?: string
    searchTerm: string
    onSearchChange: (value: string) => void
}

export function StoreList({ stores, onStoreClick, selectedStoreId, searchTerm, onSearchChange }: StoreListProps) {
    return (
        <div className="flex h-full flex-col gap-3 border-l border-border/60 bg-card p-4">
            <CustomerFilterDropdown variant="inline" className="w-full" />
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search sites…"
                    className="pl-9 h-9"
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
            </div>

            <div className="text-xs text-muted-foreground px-1">
                {stores.length} sites
            </div>

            <ScrollArea className="flex-1 -mx-4 h-full">
                <div className="px-4 space-y-1.5 pb-4">
                    {stores.map((store) => {
                        const isSelected = selectedStoreId === store.id
                        const statusDot =
                            store.status === 'active' ? 'bg-emerald-500' :
                            store.status === 'maintenance' ? 'bg-amber-500' :
                            'bg-destructive'
                        return (
                            <button
                                key={store.id}
                                onClick={() => onStoreClick(store)}
                                className={`w-full text-left flex flex-col gap-2 rounded-md border p-3 transition-colors ${isSelected
                                    ? 'border-primary/40 bg-primary/5'
                                    : 'border-border/60 hover:bg-accent/40'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2 min-w-0">
                                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                                        {store.clients?.name && (
                                            <span className="text-[11px] text-muted-foreground truncate">
                                                {store.clients.name}
                                            </span>
                                        )}
                                        <h3 className="font-medium text-sm leading-tight text-foreground truncate">{store.name}</h3>
                                        <BrandChips brands={brandsFromStore(store)} size="sm" />
                                    </div>
                                    <span className={`size-1.5 rounded-full shrink-0 mt-1.5 ${statusDot}`} />
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <span className="truncate flex-1">{store.address}</span>
                                </div>
                                <Link
                                    href={`/stores/${store.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground w-fit"
                                >
                                    View details
                                    <ChevronRight className="size-3" />
                                </Link>
                            </button>
                        )
                    })}
                </div>
            </ScrollArea>
        </div>
    )
}
