"use client"

import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    type ReactNode,
} from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { Client, UserRole } from "@/types/database"
import { useCurrentMember } from "@/lib/hooks/use-current-member"

interface CustomerFilterState {
    /** The active client_id filter, or null for "All Customers". */
    clientId: string | null
    /** Setter — updates URL ?client=<id> and localStorage. */
    setClientId: (id: string | null) => void
    /** Full list of customers (only populated for cross-customer roles). */
    customers: Client[]
    /** True when the filter UI should be shown — only for cross-customer roles. */
    isAdmin: boolean
    /** The signed-in user's role. */
    role: UserRole | null
    /** Whether we've finished initial load. */
    initialised: boolean
}

const CustomerFilterContext = createContext<CustomerFilterState | null>(null)

const LOCAL_STORAGE_KEY = "rpm:active_client_id"
const ADMIN_ROLES: UserRole[] = ["super_admin", "rodier_admin"]

export function CustomerFilterProvider({
    children,
}: {
    children: ReactNode
}) {
    const supabase = createClient()
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { data: member, isLoading: memberLoading } = useCurrentMember()

    const [clientId, setClientIdState] = useState<string | null>(null)
    const [customers, setCustomers] = useState<Client[]>([])
    const [role, setRole] = useState<UserRole | null>(null)
    const [initialised, setInitialised] = useState(false)

    const isAdmin =
        role !== null && ADMIN_ROLES.includes(role)

    useEffect(() => {
        if (memberLoading) return
        let cancelled = false
        async function init() {
            if (!member?.user || !member.profile) {
                setRole(null)
                setCustomers([])
                setClientIdState(null)
                setInitialised(true)
                return
            }
            const profile = member.profile

            const userRole =
                (profile?.role ?? null) as UserRole | null

            setRole(userRole)

            // HQ users with an explicit site portfolio see those sites through
            // RLS, even when the sites have different billing customers.
            if (userRole && !ADMIN_ROLES.includes(userRole)) {
                setClientIdState(userRole === "client_hq" && profile?.store_ids?.length
                    ? null : profile?.client_id ?? null)
                setInitialised(true)
                return
            }

            // Rodier admins / super admins can work across all customers.
            if (userRole && ADMIN_ROLES.includes(userRole)) {
                // If a customer is explicitly supplied in the URL,
                // use it. Otherwise start admin users at All Customers.
                const urlClient = searchParams.get("client")

                if (urlClient) {
                    setClientIdState(urlClient)

                    if (typeof window !== "undefined") {
                        window.localStorage.setItem(
                            LOCAL_STORAGE_KEY,
                            urlClient
                        )
                    }
                } else {
                    setClientIdState(null)

                    if (typeof window !== "undefined") {
                        window.localStorage.removeItem(
                            LOCAL_STORAGE_KEY
                        )
                    }
                }

                setInitialised(true)
                // The scope is known from the verified profile and URL. Do not
                // hold page data behind loading the optional dropdown choices.
                const { data: clientsData } = await supabase
                    .from("clients")
                    .select("*")
                    .order("name")
                if (!cancelled) setCustomers((clientsData ?? []) as Client[])
                return
            }

            setInitialised(true)
        }

        void init().catch(() => { if (!cancelled) setInitialised(true) })
        return () => { cancelled = true }

        // Initialise once for the signed-in session.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [member, memberLoading, supabase])

    const setClientId = useCallback(
        (id: string | null) => {
            setClientIdState(id)

            if (typeof window !== "undefined") {
                if (id) {
                    window.localStorage.setItem(
                        LOCAL_STORAGE_KEY,
                        id
                    )
                } else {
                    window.localStorage.removeItem(
                        LOCAL_STORAGE_KEY
                    )
                }
            }

            const params = new URLSearchParams(
                searchParams.toString()
            )

            if (id) {
                params.set("client", id)
            } else {
                params.delete("client")
            }

            const qs = params.toString()

            router.replace(
                qs ? `${pathname}?${qs}` : pathname,
                { scroll: false }
            )
        },
        [router, pathname, searchParams]
    )

    return (
        <CustomerFilterContext.Provider
            value={{
                clientId,
                setClientId,
                customers,
                isAdmin,
                role,
                initialised,
            }}
        >
            {children}
        </CustomerFilterContext.Provider>
    )
}

export function useCustomerFilter(): CustomerFilterState {
    const ctx = useContext(CustomerFilterContext)

    if (!ctx) {
        throw new Error(
            "useCustomerFilter must be used within CustomerFilterProvider"
        )
    }

    return ctx
}
