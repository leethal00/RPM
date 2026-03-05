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
    asset_group: 'internal' | 'external'
    asset_details?: string
    asset_dimensions?: string
    status: string
    last_service_date: string
    next_service_date?: string
    asset_types: {
        label: string
    }
    jobs?: {
        status: string
    }[]
}

interface AssetTableProps {
    assets: Asset[]
    storeId: string
}

export function AssetTable({ assets, storeId }: AssetTableProps) {
    const getStatusBadge = (asset: Asset) => {
        // 1. Red if has active faults (open/in_progress jobs)
        const activeFaults = asset.jobs?.filter(j =>
            j.status === 'open' || j.status === 'in_progress'
        )
        if (activeFaults && activeFaults.length > 0) {
            return <Badge variant="destructive" className="bg-red-600 text-[10px] font-black tracking-widest uppercase">FAULTED</Badge>
        }

        // 2. Orange if overdue from service date
        if (asset.next_service_date) {
            const nextDue = new Date(asset.next_service_date)
            const now = new Date()
            if (nextDue < now) {
                return (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-black tracking-widest uppercase">
                        OVERDUE
                    </Badge>
                )
            }
        }

        // 3. Green (Default)
        return (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-black tracking-widest uppercase">
                HEALTHY
            </Badge>
        )
    }

    const getQuarterLabel = (dateString?: string) => {
        if (!dateString) return "TBD"
        const date = new Date(dateString)
        const month = date.getMonth()
        const year = date.getFullYear()
        const quarter = Math.floor(month / 3) + 1
        return `Q${quarter} ${year}`
    }

    return (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden font-primary">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead className="text-[10px] font-black uppercase tracking-widest">Type / Group</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest">Status</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest">Dimensions</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest">Next Service</TableHead>
                        <TableHead className="text-right text-[10px] font-black uppercase tracking-widest">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {assets.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center py-20 text-muted-foreground italic">
                                No assets found for this site.
                            </TableCell>
                        </TableRow>
                    ) : (
                        assets.map((asset) => (
                            <TableRow key={asset.id} className="group hover:bg-muted/10 transition-colors">
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-sm tracking-tight">{asset.asset_types?.label}</span>
                                        <span className="text-[10px] font-black uppercase text-primary/70 tracking-widest">{asset.asset_group}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {getStatusBadge(asset)}
                                </TableCell>
                                <TableCell className="text-xs font-medium text-muted-foreground">
                                    {asset.asset_dimensions || "—"}
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-xs uppercase tracking-tighter">
                                            {getQuarterLabel(asset.next_service_date)}
                                        </span>
                                        <span className="text-[9px] text-muted-foreground italic">
                                            {asset.next_service_date || "Not set"}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Link
                                        href={`/stores/${storeId}/assets/${asset.id}`}
                                        className="inline-flex items-center gap-1.5 text-primary hover:text-primary/80 font-black text-[10px] uppercase tracking-widest transition-colors"
                                    >
                                        Manage
                                        <div className="size-5 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                                            <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
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
