"use client"

import * as React from "react"
import { Building2, ChevronsUpDown } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCustomerFilter } from "@/lib/customer-filter"
import type { Client, UserRole } from "@/types/database"
import { Input } from "@/components/ui/input"
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
    searchable?: boolean
    onCustomerChange?: () => void
}

export function CustomerFilterDropdown({
    variant = "header",
    className = "",
    searchable = false,
    onCustomerChange,
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
    const [fetchedCustomers, setFetchedCustomers] = React.useState<Client[]>([])
    const [search, setSearch] = React.useState("")
    const customers = contextCustomers.length ? contextCustomers : fetchedCustomers

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
                    setFetchedCustomers(
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

    const matches = search.trim()
        ? customers.filter((customer) => customer.name.toLocaleLowerCase("en-NZ")
            .includes(search.trim().toLocaleLowerCase("en-NZ"))).slice(0, 10)
        : []

    function selectCustomer(value: string | null) {
        setClientId(value)
        setSearch("")
        onCustomerChange?.()
    }

    const selector = <Select
        value={clientId ?? ALL_VALUE}
        onValueChange={(v) => selectCustomer(v === ALL_VALUE ? null : v)}
    >
        <SelectTrigger className={triggerClass} aria-label="Filter by customer">
            <Building2 className="size-3.5 text-muted-foreground" />
            <SelectValue placeholder="All Customers" />
            <ChevronsUpDown className="ml-auto size-3 opacity-50" />
        </SelectTrigger>
        <SelectContent className="z-[1100]">
            <SelectItem value={ALL_VALUE}>All Customers</SelectItem>
            {customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>
                {customer.name}
            </SelectItem>)}
        </SelectContent>
    </Select>

    if (!searchable) return selector

    return (
        <div className="space-y-2">
                <Input
                    type="search"
                    aria-label="Search clients"
                    placeholder="Search clients…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && matches.length) {
                            event.preventDefault()
                            selectCustomer(matches[0].id)
                        }
                    }}
                    className="h-9 bg-card"
                />
                {search.trim() && <div className="max-h-52 overflow-y-auto rounded-md border bg-card" aria-label="Matching clients">
                    {matches.length ? matches.map((customer) => <button
                        type="button"
                        key={customer.id}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => selectCustomer(customer.id)}
                    >{customer.name}</button>) : <p className="px-3 py-2 text-sm text-muted-foreground">No clients found.</p>}
                </div>}
            {selector}
        </div>
    )
}
