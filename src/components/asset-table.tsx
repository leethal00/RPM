import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

interface Asset {
    id: string
    name: string
    status: string
    last_service_date: string
    next_service_date?: string
    pm_interval_months?: number
    asset_types: {
        label: string
    }
}

interface AssetTableProps {
    assets: Asset[]
    storeId: string
}

export function AssetTable({ assets, storeId }: AssetTableProps) {
    return (
        <div className="rounded-md border bg-card">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Asset Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Service</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {assets.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                                No assets found for this site.
                            </TableCell>
                        </TableRow>
                    ) : (
                        assets.map((asset) => (
                            <TableRow key={asset.id}>
                                <TableCell className="font-medium">{asset.name}</TableCell>
                                <TableCell>{asset.asset_types?.label}</TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="capitalize">
                                        {asset.status || "Healthy"}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {asset.next_service_date ? (
                                        (() => {
                                            const nextDue = new Date(asset.next_service_date)
                                            const now = new Date()
                                            const thirtyDays = new Date()
                                            thirtyDays.setDate(now.getDate() + 30)

                                            if (nextDue < now) {
                                                return <Badge variant="destructive" className="text-[10px] font-bold">OVERDUE</Badge>
                                            } else if (nextDue <= thirtyDays) {
                                                return <Badge className="bg-amber-500 text-white border-amber-600 text-[10px] font-bold">DUE SOON</Badge>
                                            } else {
                                                return <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">COMPLIANT</Badge>
                                            }
                                        })()
                                    ) : (
                                        <span className="text-xs text-muted-foreground italic tracking-tight">Not Tracked</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {asset.last_service_date ? new Date(asset.last_service_date).toLocaleDateString() : "Never"}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Link
                                        href={`/stores/${storeId}/assets/${asset.id}`}
                                        className="text-primary hover:underline font-medium text-sm"
                                    >
                                        View Details
                                    </Link>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
