import { NextRequest, NextResponse } from "next/server"
import { exchangeCode, getConnections, xeroAdmin } from "@/lib/xero"

export const dynamic = "force-dynamic"

// Xero redirects back here with ?code & ?state after the user approves.
export async function GET(req: NextRequest) {
    const url = new URL(req.url)
    const back = (status: string) => NextResponse.redirect(`${url.origin}/quoting?xero=${status}`)

    if (url.searchParams.get("error")) return back("denied")
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    const cookieState = req.cookies.get("xero_state")?.value
    if (!code || !state || state !== cookieState) return back("error")

    try {
        const redirectUri = `${url.origin}/api/xero/callback`
        const t = await exchangeCode(code, redirectUri)
        const conns = await getConnections(t.access_token)
        const org = conns[0]
        if (!org) return back("no-org")

        const admin = xeroAdmin()
        const { error } = await admin.from("xero_connection").upsert({
            id: 1, tenant_id: org.tenantId, tenant_name: org.tenantName,
            access_token: t.access_token, refresh_token: t.refresh_token,
            expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
            scopes: t.scope, updated_at: new Date().toISOString(),
        })
        if (error) { console.error("xero save", error); return back("error") }
        return back("connected")
    } catch (e) {
        console.error("xero callback", e)
        return back("error")
    }
}
