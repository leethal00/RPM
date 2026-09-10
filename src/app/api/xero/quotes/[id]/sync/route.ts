import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { getValidXero, xeroAdmin, XERO_API, xeroHeaders } from "@/lib/xero"

export const dynamic = "force-dynamic"

function rpmReference(id: string) {
    return `RPM-${id.slice(0, 8).toUpperCase()}`
}

async function xeroJson(url: string, accessToken: string, tenantId: string) {
    const response = await fetch(url, { headers: xeroHeaders(accessToken, tenantId) })
    const text = await response.text()
    const body = text ? JSON.parse(text) : {}
    if (!response.ok) throw new Error(body?.Message || body?.Detail || `Xero API error ${response.status}`)
    return body
}

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const server = await createServerClient()
    const { data: auth } = await server.auth.getUser()
    if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await context.params
    const admin = xeroAdmin()
    const { data: job, error } = await admin
        .from("costing_jobs")
        .select("id,status,xero_quote_id,xero_quote_number,xero_invoice_number,job_number")
        .eq("id", id)
        .single()
    if (error || !job) return NextResponse.json({ error: "Quote not found" }, { status: 404 })
    if (!job.xero_quote_id) return NextResponse.json({ error: "This quote has not been sent to Xero yet." }, { status: 400 })

    const xero = await getValidXero()
    if (!xero) return NextResponse.json({ error: "Xero is not connected." }, { status: 409 })

    try {
        const quoteResult = await xeroJson(`${XERO_API}/Quotes/${job.xero_quote_id}`, xero.accessToken, xero.tenantId)
        const quote = quoteResult?.Quotes?.[0]
        if (!quote) throw new Error("Quote could not be found in Xero.")

        const updates: Record<string, unknown> = {
            xero_quote_number: quote.QuoteNumber || job.xero_quote_number || null,
            updated_at: new Date().toISOString(),
        }

        const xeroStatus = String(quote.Status || "").toUpperCase()
        if (xeroStatus === "ACCEPTED") updates.status = "approved"
        else if (xeroStatus === "INVOICED") updates.status = "in_progress"
        else updates.status = "quoted"

        let invoiceNumber = job.xero_invoice_number as string | null
        if (xeroStatus === "INVOICED" && !invoiceNumber) {
            const where = encodeURIComponent(`Reference==\"${rpmReference(id)}\"`)
            const invoiceResult = await xeroJson(`${XERO_API}/Invoices?where=${where}&order=Date%20DESC`, xero.accessToken, xero.tenantId)
            const invoice = invoiceResult?.Invoices?.[0]
            if (invoice?.InvoiceNumber) {
                invoiceNumber = invoice.InvoiceNumber
                updates.xero_invoice_number = invoiceNumber
                updates.job_number = invoiceNumber
                updates.status = "in_progress"
            }
        }

        const { error: saveError } = await admin.from("costing_jobs").update(updates).eq("id", id)
        if (saveError) throw saveError

        return NextResponse.json({
            ok: true,
            xeroStatus,
            status: updates.status,
            quoteNumber: updates.xero_quote_number,
            invoiceNumber,
            jobNumber: invoiceNumber || job.job_number || null,
        })
    } catch (syncError) {
        console.error("sync xero quote", syncError)
        return NextResponse.json({ error: syncError instanceof Error ? syncError.message : "Could not sync Xero status." }, { status: 500 })
    }
}
