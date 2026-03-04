import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
        if (typeof window === 'undefined') {
            // During SSR/Build, we can skip if env vars are missing
            return null as any
        }
        throw new Error('Supabase credentials missing. Check your .env client-side.')
    }

    return createBrowserClient(url, key)
}
