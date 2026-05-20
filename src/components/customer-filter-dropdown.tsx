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

interface CustomerFilterDropdownProps {
    /** "header" — compact pill in the top bar; "inline" — full-width form-style for sidebar / filter blocks */
    variant?: "header" | "inline"
    className?: string
}

/**
 * Customer scope selector. Only renders for cross-customer roles
 * (super_admin / rodier_admin). For client_hq / client_store users the
 * filter is implicit via RLS and the dropdown is hidden.
 *
 * Multiple instances can co-exist on the same page (e.g. header + sidebar
 * + in-page filter block) — they all read and write the same context.
 */
export function CustomerFilterDropdown({ variant = "header", className = "" }: CustomerFilterDropdownProps) {
    const { isAdmin, customers, clientId, setClientId, initialised } = useCustomerFilter()

    if (!initialised || !isAdmin) return null

    const triggerClass = variant === "inline"
        ? `h-10 gap-2 bg-white border-2 font-bold text-xs ${className}`
        : `h-8 gap-2 border-muted-foreground/20 bg-muted/30 text-xs font-bold uppercase tracking-wider min-w-[180px] ${className}`

    return (
        <Select
            value={clientId ?? ALL_VALUE}
            onValueChange={(v) => setClientId(v === ALL_VALUE ? null : v)}
        >
            <SelectTrigger
                className={triggerClass}
                aria-label="Filter by customer"
            >
                <Building2 className="size-3.5 text-primary" />
                <SelectValue placeholder="All Customers" />
                <ChevronsUpDown className="ml-auto size-3 opacity-50" />
            </SelectTrigger>
            <SelectContent className="z-[1100]">
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
