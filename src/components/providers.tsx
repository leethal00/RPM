"use client"

import { Suspense, type ReactNode } from "react"
import { CustomerFilterProvider } from "@/lib/customer-filter"

/**
 * Client-side providers that need to wrap the whole app tree
 * (above any page-level useFilter() / useSearchParams() calls).
 */
export function Providers({ children }: { children: ReactNode }) {
    return (
        <Suspense fallback={null}>
            <CustomerFilterProvider>
                {children}
            </CustomerFilterProvider>
        </Suspense>
    )
}
