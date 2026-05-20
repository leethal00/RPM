import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import type { Asset } from "@/types/database"

interface AssetTableProps {
    assets: Asset[]
    storeId: string
}

export function AssetTable({ assets, storeId }: AssetTableProps) {
    const getStatus = (asset: Asset) => {
        const activeFaults = asset.jobs?.filter(j => j.status === 'open' || j.status === 'in_progress')
        if (activeFaults && activeFaults.length > 0) {
            return { label: "Faulted", dot: "bg-destructive", tone: "text-destructive" }
        }
        if (asset.next_service_date) {
            const nextDue = new Date(asset.next_service_date)
            if (nextDue < new Date()) {
                return { label: "Overdue", dot: "bg-amber-500", tone: "text-amber-600 dark:text-amber-400" }
            }
        }
        return { label: "Healthy", dot: "bg-emerald-500", tone: "text-muted-foreground" }
    }

    const getQuarterLabel = (dateString?: string | null) => {
        if (!dateString) return "—"
        const date = new Date(dateString)
        const quarter = Math.floor(date.getMonth() / 3) + 1
        return `Q${quarter} ${date.getFullYear()}`
    }

    return (
        <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow className="border-b border-border/60 hover:bg-transparent">
                        <TableHead className="h-10 text-xs font-medium text-muted-foreground">Type / group</TableHead>
                        <TableHead className="h-10 text-xs font-medium text-muted-foreground">Status</TableHead>
                        <TableHead className="h-10 text-xs font-medium text-muted-foreground">Photo</TableHead>
                        <TableHead className="h-10 text-xs font-medium text-muted-foreground">Dimensions</TableHead>
                        <TableHead className="h-10 text-xs font-medium text-muted-foreground">Next service</TableHead>
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
                        assets.map((asset) => {
                            const status = getStatus(asset)
                            return (
                                <TableRow key={asset.id} className="group border-b border-border/40 last:border-b-0 hover:bg-accent/30 transition-colors">
                                    <TableCell className="py-3">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-medium text-foreground">{asset.asset_types?.label}</span>
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
                                        {asset.asset_photos && asset.asset_photos.length > 0 ? "Yes" : "—"}
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
                                        <Link
                                            href={`/stores/${storeId}/assets/${asset.id}`}
                                            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            Manage
                                            <ChevronRight className="size-3.5" />
                                        </Link>
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
