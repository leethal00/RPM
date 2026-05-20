"use client"

import { Building2, ChevronsUpDown } from "lucide-react"
import { useCustomerFilter } from "@/lib/customer-filter"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

const ALL_VALUE = "__all__"

/**
 * Top-bar customer scope selector. Only renders for cross-customer roles
 * (super_admin / rodier_admin). For client_hq / client_store users the
 * filter is implicit via RLS and the dropdown is hidden.
 */
export function CustomerFilterDropdown() {
    const { isAdmin, customers, clientId, setClientId, initialised } = useCustomerFilter()

    if (!initialised || !isAdmin) return null

    return (
        <Select
            value={clientId ?? ALL_VALUE}
            onValueChange={(v) => setClientId(v === ALL_VALUE ? null : v)}
        >
            <SelectTrigger
                className="h-8 gap-2 border-muted-foreground/20 bg-muted/30 text-xs font-bold uppercase tracking-wider min-w-[180px]"
                aria-label="Filter by customer"
            >
                <Building2 className="size-3.5 text-primary" />
                <SelectValue placeholder="All Customers" />
                <ChevronsUpDown className="ml-auto size-3 opacity-50" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL_VALUE} className="font-bold">All Customers</SelectItem>
                {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                        {c.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
