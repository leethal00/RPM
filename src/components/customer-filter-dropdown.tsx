"use client"

import * as React from "react"
import { Building2, ChevronsUpDown } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCustomerFilter } from "@/lib/customer-filter"
import type { Client, UserRole } from "@/types/database"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

const ALL_VALUE = "__all__"
const ADMIN_ROLES: UserRole[] = ["super_admin", "rodier_admin"]

interface CustomerFilterDropdownProps {
    variant?: "header" | "inline"
    className?: string
}

export function CustomerFilterDropdown({
    variant = "header",
    className = "",
}: CustomerFilterDropdownProps) {
    const {
        clientId,
        setClientId,
        customers: contextCustomers,
        initialised,
    } = useCustomerFilter()

    const supabase = React.useMemo(() => createClient(), [])

    const [isAdmin, setIsAdmin] = React.useState(false)
    const [roleChecked, setRoleChecked] = React.useState(false)
    const [customers, setCustomers] =
        React.useState<Client[]>(contextCustomers)

    React.useEffect(() => {
        if (contextCustomers.length > 0) {
            setCustomers(contextCustomers)
        }
    }, [contextCustomers])

    React.useEffect(() => {
        let cancelled = false

        async function initialiseSelector() {
            const {
                data: { user },
            } = await supabase.auth.getUser()

            if (!user) {
                if (!cancelled) {
                    setIsAdmin(false)
                    setRoleChecked(true)
                }
                return
            }

            const { data: profile } = await supabase
                .from("users")
                .select("role")
                .eq("id", user.id)
                .single()

            const role =
                (profile?.role ?? null) as UserRole | null

            const admin =
                role !== null &&
                ADMIN_ROLES.includes(role)

            if (!cancelled) {
                setIsAdmin(admin)
            }

            if (admin && contextCustomers.length === 0) {
                const { data: clientsData } = await supabase
                    .from("clients")
                    .select("*")
                    .order("name")

                if (!cancelled) {
                    setCustomers(
                        (clientsData ?? []) as Client[]
                    )
                }
            }

            if (!cancelled) {
                setRoleChecked(true)
            }
        }

        initialiseSelector()

        return () => {
            cancelled = true
        }
    }, [supabase, contextCustomers.length])

    if (!initialised || !roleChecked || !isAdmin) {
        return null
    }

    const triggerClass =
        variant === "inline"
            ? `h-9 gap-2 text-sm ${className}`
            : `h-8 gap-2 text-sm min-w-[180px] ${className}`

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
                <SelectValue placeholder="All Customers" />
                <ChevronsUpDown className="ml-auto size-3 opacity-50" />
            </SelectTrigger>

            <SelectContent className="z-[1100]">
                <SelectItem value={ALL_VALUE}>
                    All Customers
                </SelectItem>

                {customers.map((customer) => (
                    <SelectItem
                        key={customer.id}
                        value={customer.id}
                    >
                        {customer.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
