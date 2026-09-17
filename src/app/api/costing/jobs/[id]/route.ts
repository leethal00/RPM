import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { xeroAdmin } from "@/lib/xero"

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const server = await createServerClient()
    const { data: auth } = await server.auth.getUser()
    if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await context.params
    const admin = xeroAdmin()

    const { data: job, error: fetchError } = await admin
        .from("costing_jobs")
        .select("id,title,job_number,xero_invoice_number,xero_quote_number")
        .eq("id", id)
        .single()

    if (fetchError || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 })

    const { error: deleteError } = await admin.from("costing_jobs").delete().eq("id", id)
    if (deleteError) {
        console.error("delete RPM job", deleteError)
        return NextResponse.json({ error: deleteError.message || "Could not delete the RPM job." }, { status: 500 })
    }

    return NextResponse.json({
        ok: true,
        deleted: {
            id: job.id,
            title: job.title,
            jobNumber: job.job_number || job.xero_invoice_number || null,
            xeroQuoteNumber: job.xero_quote_number || null,
        },
        xeroUntouched: true,
    })
}
