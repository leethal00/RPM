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
        const { data, error } = await server.functions.invoke("job-card-mail-ingest", {
            body: {},
        })

        if (error) {
            let detail = error.message || "Mailbox check failed"
            const context = (error as { context?: Response }).context

            if (context) {
                try {
                    const payload = await context.clone().json()
                    if (payload?.error) {
                        detail = payload.stage ? `${payload.stage}: ${payload.error}` : payload.error
                    }
                } catch {
                    try {
                        const text = await context.clone().text()
                        if (text) detail = text
                    } catch {
                        // Keep the original error message.
                    }
                }
            }

            return NextResponse.json({ ok: false, error: detail }, { status: 502 })
        }

        if (data?.ok === false) {
            const detail = data.stage ? `${data.stage}: ${data.error || "Mailbox check failed"}` : (data.error || "Mailbox check failed")
            return NextResponse.json({ ok: false, error: detail }, { status: 502 })
        }

        return NextResponse.json(data || { ok: true, checked: 0, results: [] })
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : "Mailbox check failed" },
            { status: 500 }
        )
    }
}
