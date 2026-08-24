import { createClient } from "@supabase/supabase-js"

const TOKEN_URL = "https://identity.xero.com/connect/token"
const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize"
const CONNECTIONS_URL = "https://api.xero.com/connections"
export const XERO_API = "https://api.xero.com/api.xro/2.0"
export const XERO_SCOPES = "openid profile email accounting.transactions accounting.contacts offline_access"

type Tokens = { access_token: string; refresh_token: string; expires_in: number; scope: string }

// Service-role client — only used server-side to touch the locked-down xero_connection table.
export function xeroAdmin() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
    })
}

function basicAuth() {
    return "Basic " + Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64")
}

export function authorizeUrl(redirectUri: string, state: string) {
    const p = new URLSearchParams({
        response_type: "code", client_id: process.env.XERO_CLIENT_ID || "",
        redirect_uri: redirectUri, scope: XERO_SCOPES, state,
    })
    return `${AUTHORIZE_URL}?${p.toString()}`
}

async function postToken(body: URLSearchParams): Promise<Tokens> {
    const r = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
        body,
    })
    if (!r.ok) throw new Error(`Xero token error ${r.status}: ${await r.text()}`)
    return r.json()
}

export function exchangeCode(code: string, redirectUri: string) {
    return postToken(new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }))
}

export function refreshTokens(refreshToken: string) {
    return postToken(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }))
}

export async function getConnections(accessToken: string) {
    const r = await fetch(CONNECTIONS_URL, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } })
    if (!r.ok) throw new Error(`Xero connections error ${r.status}`)
    return r.json() as Promise<Array<{ tenantId: string; tenantName: string; tenantType: string }>>
}

// Returns a currently-valid access token + tenant id, refreshing if near expiry. null if not connected.
export async function getValidXero(): Promise<{ accessToken: string; tenantId: string } | null> {
    const admin = xeroAdmin()
    const { data } = await admin.from("xero_connection").select("*").eq("id", 1).maybeSingle()
    if (!data?.refresh_token) return null
    let accessToken: string | null = data.access_token
    let refreshToken: string = data.refresh_token
    const stale = !data.expires_at || new Date(data.expires_at).getTime() - 60_000 < Date.now()
    if (stale || !accessToken) {
        const t = await refreshTokens(refreshToken)
        accessToken = t.access_token
        refreshToken = t.refresh_token
        await admin.from("xero_connection").update({
            access_token: accessToken, refresh_token: refreshToken,
            expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", 1)
    }
    return { accessToken: accessToken as string, tenantId: data.tenant_id as string }
}

// Xero requires a Bearer + the tenant id on every API call.
export function xeroHeaders(accessToken: string, tenantId: string) {
    return {
        Authorization: `Bearer ${accessToken}`,
        "Xero-tenant-id": tenantId,
        Accept: "application/json",
        "Content-Type": "application/json",
    }
}
