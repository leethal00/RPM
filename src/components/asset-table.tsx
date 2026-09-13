"use client"

import Image from "next/image"
import { useMemo, useState } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, ImageIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import type { Asset } from "@/types/database"

interface AssetTableProps {
    assets: Asset[]
    storeId: string
}

type SortKey = "photo" | "type" | "status" | "dimensions" | "nextService"
type SortDirection = "asc" | "desc"

export function AssetTable({ assets, storeId }: AssetTableProps) {
    const router = useRouter()
    const [sortKey, setSortKey] = useState<SortKey>("type")
    const [sortDirection, setSortDirection] = useState<SortDirection>("asc")

    const getStatus = (asset: Asset) => {
        const activeFaults = asset.jobs?.filter(j => j.status === 'open' || j.status === 'in_progress')
        if (activeFaults && activeFaults.length > 0) {
            return { label: "Faulted", dot: "bg-destructive", tone: "text-destructive", rank: 0 }
        }
        if (asset.next_service_date) {
            const nextDue = new Date(asset.next_service_date)
            if (nextDue < new Date()) {
                return { label: "Overdue", dot: "bg-amber-500", tone: "text-amber-600 dark:text-amber-400", rank: 1 }
            }
        }
        return { label: "Healthy", dot: "bg-emerald-500", tone: "text-muted-foreground", rank: 2 }
    }

    const getQuarterLabel = (dateString?: string | null) => {
        if (!dateString) return "—"
        const date = new Date(dateString)
        const quarter = Math.floor(date.getMonth() / 3) + 1
        return `Q${quarter} ${date.getFullYear()}`
    }

    const getThumbnail = (asset: Asset) => {
        const photos = asset.asset_photos || []
        return photos.find(photo => photo.is_thumbnail) || [...photos].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    }

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDirection(current => current === "asc" ? "desc" : "asc")
        } else {
            setSortKey(key)
            setSortDirection("asc")
        }
    }

    const sortedAssets = useMemo(() => {
        const multiplier = sortDirection === "asc" ? 1 : -1
        return [...assets].sort((a, b) => {
            let comparison = 0

            if (sortKey === "photo") {
                comparison = Number(Boolean(getThumbnail(a))) - Number(Boolean(getThumbnail(b)))
            } else if (sortKey === "type") {
                const aValue = `${a.asset_types?.label || ""} ${a.asset_group || ""}`.trim()
                const bValue = `${b.asset_types?.label || ""} ${b.asset_group || ""}`.trim()
                comparison = aValue.localeCompare(bValue, undefined, { sensitivity: "base" })
            } else if (sortKey === "status") {
                comparison = getStatus(a).rank - getStatus(b).rank
            } else if (sortKey === "dimensions") {
                comparison = (a.asset_dimensions || "").localeCompare(b.asset_dimensions || "", undefined, { numeric: true, sensitivity: "base" })
            } else if (sortKey === "nextService") {
                const aTime = a.next_service_date ? new Date(a.next_service_date).getTime() : Number.POSITIVE_INFINITY
                const bTime = b.next_service_date ? new Date(b.next_service_date).getTime() : Number.POSITIVE_INFINITY
                comparison = aTime - bTime
            }

            return comparison * multiplier
        })
    }, [assets, sortDirection, sortKey])

    const SortHeader = ({ column, label, className = "" }: { column: SortKey; label: string; className?: string }) => {
        const active = sortKey === column
        const Icon = !active ? ArrowUpDown : sortDirection === "asc" ? ArrowUp : ArrowDown
        return (
            <button
                type="button"
                onClick={() => toggleSort(column)}
                className={`inline-flex items-center gap-1.5 hover:text-foreground transition-colors ${active ? "text-foreground" : "text-muted-foreground"} ${className}`}
                aria-label={`Sort by ${label}`}
            >
                {label}
                <Icon className="size-3" />
            </button>
        )
    }

    return (
        <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow className="border-b border-border/60 hover:bg-transparent">
                        <TableHead className="h-10 text-xs font-medium w-[92px]"><SortHeader column="photo" label="Photo" /></TableHead>
                        <TableHead className="h-10 text-xs font-medium"><SortHeader column="type" label="Type / group" /></TableHead>
                        <TableHead className="h-10 text-xs font-medium"><SortHeader column="status" label="Status" /></TableHead>
                        <TableHead className="h-10 text-xs font-medium"><SortHeader column="dimensions" label="Dimensions" /></TableHead>
                        <TableHead className="h-10 text-xs font-medium"><SortHeader column="nextService" label="Next service" /></TableHead>
                        <TableHead className="h-10 text-xs font-medium text-muted-foreground text-right w-[80px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {assets.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                                No assets found for this site.
                            </TableCell>
                        </TableRow>
                    ) : (
                        sortedAssets.map((asset) => {
                            const status = getStatus(asset)
                            const thumbnail = getThumbnail(asset)
                            const assetHref = `/stores/${storeId}/assets/${asset.id}`
                            return (
                                <TableRow
                                    key={asset.id}
                                    onClick={() => router.push(assetHref)}
                                    onMouseEnter={() => router.prefetch(assetHref)}
                                    className="group border-b border-border/40 last:border-b-0 hover:bg-accent/30 transition-colors cursor-pointer"
                                >
                                    <TableCell className="py-2.5">
                                        {thumbnail ? (
                                            <div className="relative h-12 w-16 overflow-hidden rounded-md border border-border/60 bg-muted/40">
                                                <Image
                                                    src={thumbnail.url}
                                                    alt={`${asset.asset_types?.label || "Asset"} thumbnail`}
                                                    fill
                                                    className="object-cover"
                                                    sizes="64px"
                                                />
                                            </div>
                                        ) : (
                                            <div className="h-12 w-16 rounded-md border border-dashed border-border/60 bg-muted/20 flex items-center justify-center text-muted-foreground/50">
                                                <ImageIcon className="size-4" />
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-medium text-foreground group-hover:text-primary transition-colors">{asset.asset_types?.label}</span>
                                            {asset.asset_group && (
                                                <span className="text-xs text-muted-foreground">{asset.asset_group}</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <div className={`flex items-center gap-1.5 text-sm ${status.tone}`}>
                                            <span className={`size-1.5 rounded-full ${status.dot}`} />
                                            {status.label}
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-3 text-sm text-muted-foreground">
                                        {asset.asset_dimensions || "—"}
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-sm text-foreground">{getQuarterLabel(asset.next_service_date)}</span>
                                            <span className="text-xs text-muted-foreground">{asset.next_service_date || "Not set"}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right py-3">
                                        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                            Manage
                                            <ChevronRight className="size-3.5" />
                                        </span>
                                    </TableCell>
                                </TableRow>
                            )
                        })
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
