"use client"

import { Suspense, useEffect, type ReactNode } from "react"
import { CustomerFilterProvider } from "@/lib/customer-filter"
import { useSWRConfig } from "swr"
import { createClient } from "@/lib/supabase/client"
import { CURRENT_MEMBER_KEY } from "@/lib/hooks/use-current-member"
import type { AuthChangeEvent } from "@supabase/supabase-js"

/**
 * Client-side providers that need to wrap the whole app tree
 * (above any page-level useFilter() / useSearchParams() calls).
 */
export function Providers({ children }: { children: ReactNode }) {
    const { mutate } = useSWRConfig()
    useEffect(() => {
        let refresh: ReturnType<typeof setTimeout> | undefined
        const { data: { subscription } } = createClient().auth.onAuthStateChange((event: AuthChangeEvent) => {
            // Do not await Supabase calls while the Auth callback holds its lock.
            clearTimeout(refresh)
            if (event === "SIGNED_OUT") {
                void mutate(key => key !== CURRENT_MEMBER_KEY, undefined, { revalidate: false })
                void mutate(CURRENT_MEMBER_KEY, { user: null, profile: null }, { revalidate: false })
            } else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
                refresh = setTimeout(() => { void mutate(CURRENT_MEMBER_KEY) }, 0)
            }
        })
        return () => { clearTimeout(refresh); subscription.unsubscribe() }
    }, [mutate])
    return (
        <Suspense fallback={null}>
            <CustomerFilterProvider>
                {children}
            </CustomerFilterProvider>
        </Suspense>
    )
}
