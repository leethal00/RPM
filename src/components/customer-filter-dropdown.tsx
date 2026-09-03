"use client"

import * as React from "react"
import { Building2, Check, ChevronsUpDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useCustomerFilter } from "@/lib/customer-filter"
import type { UserRole } from "@/types/database"

const ADMIN_ROLES: UserRole[] = [
    "super_admin",
    "rodier_admin",
]

export function CustomerFilterDropdown() {
    const {
        clientId,
        setClientId,
        customers,
        initialised,
    } = useCustomerFilter()

    const supabase = React.useMemo(
        () => createClient(),
        []
    )

    const [open, setOpen] = React.useState(false)
    const [isAdmin, setIsAdmin] = React.useState(false)
    const [roleChecked, setRoleChecked] = React.useState(false)

    React.useEffect(() => {
        let cancelled = false

        async function checkRole() {
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

            if (cancelled) return

            const role =
                (profile?.role ?? null) as UserRole | null

            setIsAdmin(
                role !== null &&
                    ADMIN_ROLES.includes(role)
            )

            setRoleChecked(true)
        }

        checkRole()

        return () => {
            cancelled = true
        }
    }, [supabase])

    if (!initialised || !roleChecked || !isAdmin) {
        return null
    }

    const selectedCustomer =
        customers.find(
            (customer) => customer.id === clientId
        ) ?? null

    const selectedLabel =
        selectedCustomer?.name ?? "All Customers"

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="min-w-[190px] justify-between"
                >
                    <div className="flex min-w-0 items-center gap-2">
                        <Building2 className="size-4 shrink-0" />

                        <span className="truncate">
                            {selectedLabel}
                        </span>
                    </div>

                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>

            <PopoverContent
                className="w-[260px] p-0"
                align="end"
            >
                <Command>
                    <CommandInput placeholder="Search customers..." />

                    <CommandList>
                        <CommandEmpty>
                            No customer found.
                        </CommandEmpty>

                        <CommandGroup>
                            <CommandItem
                                value="All Customers"
                                onSelect={() => {
                                    setClientId(null)
                                    setOpen(false)
                                }}
                            >
                                <Check
                                    className={cn(
                                        "mr-2 size-4",
                                        clientId === null
                                            ? "opacity-100"
                                            : "opacity-0"
                                    )}
                                />

                                All Customers
                            </CommandItem>

                            {customers.map((customer) => (
                                <CommandItem
                                    key={customer.id}
                                    value={customer.name}
                                    onSelect={() => {
                                        setClientId(customer.id)
                                        setOpen(false)
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 size-4",
                                            clientId === customer.id
                                                ? "opacity-100"
                                                : "opacity-0"
                                        )}
                                    />

                                    {customer.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
