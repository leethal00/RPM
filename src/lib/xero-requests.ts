import { xeroAdmin } from "./xero"
import { XeroRateLimitError, xeroRetryAfter } from "./xero-rate-limit"

export type XeroActivity = "import" | "quote-check" | "quote-update" | "invoice-update" | "products" | "contacts" | "background"

function remaining(value: string | null) {
    if (value === null || !value.trim()) return null
    const n = Number(value)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

// All accounting requests share a tenant-wide cooldown and leave a background
// reserve. Neither bearer tokens, request bodies nor customer names are logged.
export async function xeroFetch(url: string, init: RequestInit, tenant: string, activity: XeroActivity): Promise<Response> {
    const admin = xeroAdmin()
    const { data: wait, error: gateError } = await admin.rpc("xero_request_gate", { p_tenant: tenant, p_background: activity === "background" })
    if (gateError) {
        console.error("Xero usage guard unavailable", { activity, message: gateError.message })
        // Background work fails closed; staff actions remain usable during a
        // telemetry outage. Xero itself continues enforcing its hard limits.
        if (activity === "background") throw new Error("Background Xero checks paused because usage tracking is unavailable.")
    }
    if (typeof wait === "number" && wait > 0) throw new XeroRateLimitError(wait)
    const started = Date.now()
    let response: Response
    try {
        response = await fetch(url, init)
    } catch (error) {
        await record(0, null)
        throw error
    }
    const retry = response.status === 429 ? xeroRetryAfter(response.headers.get("Retry-After")) : null
    await record(response.status, response.headers, retry)
    if (retry !== null) throw new XeroRateLimitError(retry)
    if (response.ok && activity === "quote-update" && init.method && init.method !== "GET") {
        const { error } = await admin.from("xero_api_cache").delete().eq("tenant_id", tenant).like("cache_key", "quotes:%")
        if (error) console.error("Xero quote cache invalidation failed", { message: error.message })
    }
    return response

    async function record(status: number, headers: Headers | null, retry: number | null = null) {
        const entry = {
            p_tenant: tenant, p_activity: activity,
            p_resource: new URL(url).pathname.replace(/\/[0-9a-f-]{36}(?=\/|$)/gi, "/:id"),
            p_method: init.method || "GET", p_status: status,
            p_day: remaining(headers?.get("X-DayLimit-Remaining") ?? null),
            p_minute: remaining(headers?.get("X-MinLimit-Remaining") ?? null),
            p_problem: headers?.get("X-Rate-Limit-Problem") ?? null, p_retry: retry,
            p_duration: Date.now() - started,
        }
        console.info("Xero request", entry)
        const { error } = await admin.rpc("xero_record_request", entry)
        if (error) console.error("Xero usage record failed", { activity, message: error.message })
    }
}

export async function cachedXeroJson<T>(tenant: string, key: string, load: () => Promise<T>, ttlSeconds = 300, refresh = false): Promise<T> {
    const admin = xeroAdmin()
    const { data, error } = await admin.from("xero_api_cache").select("payload,expires_at").eq("tenant_id", tenant).eq("cache_key", key).maybeSingle()
    if (!refresh && !error && data && Date.parse(data.expires_at) > Date.now()) return data.payload as T
    const payload = await load()
    const { error: saveError } = await admin.from("xero_api_cache").upsert({ tenant_id: tenant, cache_key: key, payload, expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString() })
    if (saveError) console.error("Xero cache save failed", { message: saveError.message })
    return payload
}
