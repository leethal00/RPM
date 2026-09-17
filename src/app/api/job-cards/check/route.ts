import { NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function POST() {
    const server = await createServerClient()
    const { data: auth, error: authError } = await server.auth.getUser()

    if (authError || !auth.user) {
        return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 })
    }

    try {
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/job-card-mail-diagnostic`
        const response = await fetch(url, {
            method: "POST",
            headers: {
                apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
                "Content-Type": "application/json",
            },
            body: "{}",
            cache: "no-store",
        })

        const text = await response.text()
        let payload: Record<string, unknown> = {}
        try {
            payload = text ? JSON.parse(text) : {}
        } catch {
            payload = { ok: false, error: text || `Diagnostic returned HTTP ${response.status}` }
        }

        if (payload.ok === true) {
            const unread = typeof payload.unread === "number" ? payload.unread : 0
            const connectMs = typeof payload.connectMs === "number" ? payload.connectMs : null
            return NextResponse.json({
                ok: false,
                error: `Native IMAP login works${connectMs != null ? ` (${connectMs} ms)` : ""}. ${unread} unread message${unread === 1 ? "" : "s"} found.`,
                diagnostic: payload,
            })
        }

        const stage = typeof payload.stage === "string" ? payload.stage : "diagnostic"
        const error = typeof payload.error === "string" ? payload.error : ""
        const responseText = typeof payload.response === "string" ? payload.response : ""

        return NextResponse.json({
            ok: false,
            error: `${stage}: ${error || responseText || `Diagnostic returned HTTP ${response.status}`}`,
            diagnostic: payload,
        })
    } catch (error) {
        return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Diagnostic check failed" })
    }
}
