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
    /** Whether we've finished initial load (useful for skeleton vs filter dropdown). */
    initialised: boolean
}

const CustomerFilterContext = createContext<CustomerFilterState | null>(null)

const LOCAL_STORAGE_KEY = "rpm:active_client_id"
const ADMIN_ROLES: UserRole[] = ["super_admin", "rodier_admin"]

export function CustomerFilterProvider({ children }: { children: ReactNode }) {
    const supabase = createClient()
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const [clientId, setClientIdState] = useState<string | null>(null)
    const [customers, setCustomers] = useState<Client[]>([])
    const [role, setRole] = useState<UserRole | null>(null)
    const [initialised, setInitialised] = useState(false)

    const isAdmin = role !== null && ADMIN_ROLES.includes(role)

    // Initial load: figure out role, load customer list (admins only),
    // and restore filter from URL or localStorage.
    useEffect(() => {
        async function init() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setInitialised(true)
                return
            }
            const { data: profile } = await supabase
                .from('users')
                .select('role, client_id')
                .eq('id', user.id)
                .single()

            const userRole = (profile?.role ?? null) as UserRole | null
            setRole(userRole)

            // Non-admins: their filter is implicit via RLS. Lock to their client.
            if (userRole && !ADMIN_ROLES.includes(userRole)) {
                setClientIdState(profile?.client_id ?? null)
                setInitialised(true)
                return
            }

            // Admins: load customer list and restore last filter.
            const { data: clientsData } = await supabase
                .from('clients')
                .select('*')
                .order('name')
            setCustomers((clientsData ?? []) as Client[])

            const urlClient = searchParams.get("client")
            const storedClient = typeof window !== "undefined"
                ? window.localStorage.getItem(LOCAL_STORAGE_KEY)
                : null
            setClientIdState(urlClient ?? storedClient ?? null)
            setInitialised(true)
        }
        init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const setClientId = useCallback((id: string | null) => {
        setClientIdState(id)
        if (typeof window !== "undefined") {
            if (id) window.localStorage.setItem(LOCAL_STORAGE_KEY, id)
            else window.localStorage.removeItem(LOCAL_STORAGE_KEY)
        }
        // Sync URL: ?client=<id> or remove if null
        const params = new URLSearchParams(searchParams.toString())
        if (id) params.set("client", id)
        else params.delete("client")
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }, [router, pathname, searchParams])

    return (
        <CustomerFilterContext.Provider value={{
            clientId,
            setClientId,
            customers,
            isAdmin,
            role,
            initialised,
        }}>
            {children}
        </CustomerFilterContext.Provider>
    )
}

export function useCustomerFilter(): CustomerFilterState {
    const ctx = useContext(CustomerFilterContext)
    if (!ctx) {
        throw new Error("useCustomerFilter must be used within CustomerFilterProvider")
    }
    return ctx
}
