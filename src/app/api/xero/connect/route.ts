import { NextRequest, NextResponse } from "next/server"
import { authorizeUrl } from "@/lib/xero"

export const dynamic = "force-dynamic"

// Kicks off the Xero OAuth2 flow: redirect the user to Xero to approve.
export async function GET(req: NextRequest) {
    if (!process.env.XERO_CLIENT_ID || !process.env.XERO_CLIENT_SECRET) {
        return NextResponse.json({ error: "Xero credentials not configured (XERO_CLIENT_ID / XERO_CLIENT_SECRET)" }, { status: 500 })
    }
    const origin = new URL(req.url).origin
    const redirectUri = `${origin}/api/xero/callback`
    const state = crypto.randomUUID()
    const res = NextResponse.redirect(authorizeUrl(redirectUri, state))
    res.cookies.set("xero_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 })
    return res
}
