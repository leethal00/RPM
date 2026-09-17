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

        const ok = payload.ok === true
        const stage = typeof payload.stage === "string" ? payload.stage : "diagnostic"
        const error = typeof payload.error === "string" ? payload.error : ""
        const host = typeof payload.host === "string" ? payload.host : "mail server"
        const port = typeof payload.port === "number" ? payload.port : 993
        const ms = typeof payload.ms === "number" ? payload.ms : null

        if (ok) {
            return NextResponse.json({
                ok: false,
                error: `TLS connection works to ${host}:${port}${ms != null ? ` (${ms} ms)` : ""}. Next step is testing the IMAP library/runtime.`,
                diagnostic: payload,
            })
        }

        return NextResponse.json({
            ok: false,
            error: `${stage}: ${error || `Diagnostic returned HTTP ${response.status}`}`,
            diagnostic: payload,
        })
    } catch (error) {
        return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Diagnostic check failed" })
    }
}
