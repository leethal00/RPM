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
    variant?: "header" | "inline"
    className?: string
}

export function CustomerFilterDropdown({
    variant = "header",
    className = "",
}: CustomerFilterDropdownProps) {
    const {
        isAdmin,
        customers,
        clientId,
        setClientId,
        initialised,
    } = useCustomerFilter()

    if (!initialised || !isAdmin) return null

    const triggerClass =
        variant === "inline"
            ? `h-9 gap-2 text-sm ${className}`
            : `h-8 gap-2 text-sm min-w-[160px] ${className}`

    return (
        <Select
            value={clientId ?? ALL_VALUE}
            onValueChange={(v) =>
                setClientId(v === ALL_VALUE ? null : v)
            }
        >
            <SelectTrigger
                className={triggerClass}
                aria-label="Filter by customer"
            >
                <Building2 className="size-3.5 text-muted-foreground" />
                <SelectValue placeholder="All customers" />
                <ChevronsUpDown className="ml-auto size-3 opacity-50" />
            </SelectTrigger>

            <SelectContent className="z-[1100]">
                <SelectItem value={ALL_VALUE}>
                    All customers
                </SelectItem>

                {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                        {c.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
