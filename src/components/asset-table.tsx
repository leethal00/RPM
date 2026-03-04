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
