import type { User } from "@supabase/supabase-js"
import type { UserProfile } from "@/types/database"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "./use-supabase-query"

export const CURRENT_MEMBER_KEY = "current-member"

/** Share the verified user/profile request between navigation and customer scope. */
export function useCurrentMember() {
    return useSupabaseQuery<{ user: Pick<User, "id" | "email"> | null; profile: UserProfile | null }>(CURRENT_MEMBER_KEY, async () => {
        const supabase = createClient()
        const { data, error } = await supabase.auth.getClaims()
        if (error && error.name !== "AuthSessionMissingError") throw error
        const user = data?.claims?.sub ? {
            id: data.claims.sub,
            email: typeof data.claims.email === "string" ? data.claims.email : undefined,
        } : null
        if (!user) return { data: { user: null, profile: null }, error: null }
        const { data: profile, error: profileError } = await supabase.from("users").select("*").eq("id", user.id).single()
        return { data: { user, profile }, error: profileError }
    }, { dedupingInterval: 60_000, revalidateOnFocus: true, keepPreviousData: false })
}
