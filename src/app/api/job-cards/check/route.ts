import { NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function POST() {
    const server = await createServerClient()
    const { data: auth, error: authError } = await server.auth.getUser()

    if (authError || !auth.user) {
        return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 })
    }

    const { data: sessionData } = await server.auth.getSession()
    const accessToken = sessionData.session?.access_token

    if (!accessToken) {
        return NextResponse.json({ ok: false, error: "No active RPM session token" }, { status: 401 })
    }

    try {
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/job-card-mail-ingest`
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
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
            payload = { ok: false, error: text || `Importer returned HTTP ${response.status}` }
        }

        if (payload.ok === true && response.ok) {
            const checked = typeof payload.checked === "number" ? payload.checked : 0
            const unread = typeof payload.unread_found === "number" ? payload.unread_found : checked
            return NextResponse.json({
                ...payload,
                message: unread === 0
                    ? "Mailbox checked — no new job cards."
                    : `Mailbox checked — ${checked} email${checked === 1 ? "" : "s"} processed. Refreshing scanned job cards.`,
            })
        }

        const stage = typeof payload.stage === "string" ? payload.stage : "importer"
        const error = typeof payload.error === "string" ? payload.error : `Importer returned HTTP ${response.status}`
        return NextResponse.json({ ok: false, error: `${stage}: ${error}`, diagnostic: payload })
    } catch (error) {
        return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Mailbox check failed" })
    }
}
