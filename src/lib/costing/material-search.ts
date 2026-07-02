// Shared search logic for the materials catalogue (BOM type-ahead + picker dialog).
// Splits the query into whitespace tokens and ANDs them, so word order doesn't
// matter: "angle 50" matches "50X50X5 EQUAL ANGLE". Each token matches description
// OR code. Chars that would break PostgREST's or() filter syntax are stripped.

export function materialSearchTokens(text: string): string[] {
    return text
        .trim()
        .split(/\s+/)
        .map((t) => t.replace(/[,()*%]/g, "")) // strip PostgREST filter delimiters / wildcards
        .filter(Boolean)
        .slice(0, 8) // guard against pathological input
}

// Minimal shape of the bits of the PostgREST builder we use — keeps this file
// decoupled from the supabase-js generics while staying type-safe at call sites.
interface OrFilterable<T> {
    or(filters: string): T
}

/** Apply the tokenized AND-of-(description|code) search to a materials query. */
export function applyMaterialSearch<T extends OrFilterable<T>>(query: T, text: string): T {
    let q = query
    for (const tok of materialSearchTokens(text)) {
        q = q.or(`description.ilike.%${tok}%,code.ilike.%${tok}%`)
    }
    return q
}
