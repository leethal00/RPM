import { NextResponse } from "next/server"
import { xeroAdmin } from "@/lib/xero"

export const dynamic = "force-dynamic"

// Lightweight status for the UI — never returns tokens.
export async function GET() {
    if (!process.env.XERO_CLIENT_ID) return NextResponse.json({ connected: false, configured: false })
    const admin = xeroAdmin()
    const { data } = await admin.from("xero_connection").select("tenant_name, refresh_token").eq("id", 1).maybeSingle()
    return NextResponse.json({ connected: !!data?.refresh_token, configured: true, tenantName: data?.tenant_name ?? null })
}
