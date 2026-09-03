"use client"

import { Input } from "@/components/ui/input"
import { Search, ChevronRight, AlertTriangle } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import Link from "next/link"
import type { Store } from "@/types/database"
import { BrandChips, brandsFromStore } from "@/components/brand-chip"
import { CustomerFilterDropdown } from "@/components/customer-filter-dropdown"
import { computeTrafficLight } from "@/lib/health-score"

interface StoreListProps {
    stores: Store[]
    attentionSourceStores?: Store[]
    onStoreClick: (store: Store) => void
    selectedStoreId?: string
    searchTerm: string
    onSearchChange: (value: string) => void
}

export function StoreList({
    stores,
    attentionSourceStores,
    onStoreClick,
    selectedStoreId,
    searchTerm,
    onSearchChange,
}: StoreListProps) {
    const attentionStores = (attentionSourceStores ?? stores)
        .map((store) => {
            const traffic =
                store.status === "inactive"
                    ? "muted"
                    : computeTrafficLight({
                          assets: store.assets,
                          jobs: store.jobs,
                      })

            return {
                store,
                traffic,
            }
        })
        .filter(
            (item) =>
                item.traffic === "red" ||
                item.traffic === "orange"
        )
        .sort((a, b) => {
            const priority = {
                red: 0,
                orange: 1,
            }
            const orewaDebug = (attentionSourceStores ?? stores).find(
               (store) =>
                    store.name.toLowerCase().includes("orewa")
            )

            const orewaTraffic = orewaDebug
                ? computeTrafficLight({
                      assets: orewaDebug.assets,
                      jobs: orewaDebug.jobs,
                  })
                : "not found"
            return (
                priority[
                    a.traffic as "red" | "orange"
                ] -
                priority[
                    b.traffic as "red" | "orange"
                ]
            )
        })

    return (
        <div className="flex h-full flex-col gap-3 border-l border-border/60 bg-muted/50 dark:bg-muted/30 p-4">
            <CustomerFilterDropdown
                variant="inline"
                className="w-full bg-card"
            />
            <div className="rounded border bg-yellow-50 px-2 py-1 text-xs text-black">
                DEBUG — Attention: {attentionStores.length} | Orewa: {orewaTraffic}
                </div>
            {attentionStores.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
                    <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="size-4 text-amber-500" />

                            <span className="text-sm font-semibold">
                                Needs Attention
                            </span>
                        </div>

                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {attentionStores.length}
                        </span>
                    </div>

                    <div className="max-h-48 overflow-y-auto">
                        {attentionStores.map(
                            ({ store, traffic }) => {
                                const isSelected =
                                    selectedStoreId === store.id

                                const statusDot =
                                    traffic === "red"
                                        ? "bg-red-500"
                                        : "bg-amber-500"

                                const statusText =
                                    traffic === "red"
                                        ? "Critical attention"
                                        : "Attention required"

                                const statusTextClass =
                                    traffic === "red"
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-amber-600 dark:text-amber-400"

                                return (
                                    <button
                                        key={store.id}
                                        onClick={() =>
                                            onStoreClick(store)
                                        }
                                        className={`w-full border-b border-border/50 px-3 py-2.5 text-left transition-colors last:border-b-0 ${
                                            isSelected
                                                ? "bg-primary/5"
                                                : "hover:bg-muted/50"
                                        }`}
                                    >
                                        <div className="flex items-start gap-2">
                                            <span
                                                className={`mt-1.5 size-2.5 shrink-0 rounded-full ${statusDot}`}
                                            />

                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium text-foreground">
                                                    {store.name}
                                                </div>

                                                <div
                                                    className={`mt-0.5 text-[11px] font-medium ${statusTextClass}`}
                                                >
                                                    {statusText}
                                                </div>

                                                {store.address && (
                                                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                                        {store.address}
                                                    </div>
                                                )}

                                                <Link
                                                    href={`/stores/${store.id}`}
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                                                >
                                                    View site
                                                    <ChevronRight className="size-3" />
                                                </Link>
                                            </div>
                                        </div>
                                    </button>
                                )
                            }
                        )}
                    </div>
                </div>
            )}

            <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

                <Input
                    type="search"
                    placeholder="Search sites…"
                    className="h-9 bg-card pl-9"
                    value={searchTerm}
                    onChange={(e) =>
                        onSearchChange(e.target.value)
                    }
                />
            </div>

            <div className="px-1 text-xs text-muted-foreground">
                {stores.length} sites
            </div>

            <ScrollArea className="-mx-4 h-full flex-1">
                <div className="space-y-1.5 px-4 pb-4">
                    {stores.map((store) => {
                        const isSelected =
                            selectedStoreId === store.id

                        const traffic =
                            store.status === "inactive"
                                ? "muted"
                                : computeTrafficLight({
                                      assets: store.assets,
                                      jobs: store.jobs,
                                  })

                        const statusDot =
                            traffic === "red"
                                ? "bg-red-500"
                                : traffic === "orange"
                                  ? "bg-amber-500"
                                  : traffic === "green"
                                    ? "bg-emerald-500"
                                    : "bg-muted-foreground/40"

                        return (
                            <button
                                key={store.id}
                                onClick={() =>
                                    onStoreClick(store)
                                }
                                className={`w-full rounded-md border p-3 text-left transition-colors ${
                                    isSelected
                                        ? "border-primary/40 bg-primary/5"
                                        : "border-border/60 bg-card hover:border-border hover:shadow-sm"
                                }`}
                            >
                                <div className="flex min-w-0 items-start justify-between gap-2">
                                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                                        {store.clients?.name && (
                                            <span className="truncate text-[11px] text-muted-foreground">
                                                {store.clients.name}
                                            </span>
                                        )}

                                        <h3 className="truncate text-sm font-medium leading-tight text-foreground">
                                            {store.name}
                                        </h3>

                                        <BrandChips
                                            brands={brandsFromStore(
                                                store
                                            )}
                                            size="sm"
                                        />
                                    </div>

                                    <span
                                        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${statusDot}`}
                                    />
                                </div>

                                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <span className="flex-1 truncate">
                                        {store.address}
                                    </span>
                                </div>

                                <Link
                                    href={`/stores/${store.id}`}
                                    onClick={(e) =>
                                        e.stopPropagation()
                                    }
                                    className="mt-2 inline-flex w-fit items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
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
