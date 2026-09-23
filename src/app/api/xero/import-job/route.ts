import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { getValidXero, xeroAdmin, XERO_API, xeroHeaders } from "@/lib/xero"

export const dynamic = "force-dynamic"

type XeroLineItem = {
    ItemCode?: string | null
    Description?: string | null
    Quantity?: number | null
    UnitAmount?: number | null
    LineAmount?: number | null
}

type XeroInvoice = {
    InvoiceID?: string | null
    InvoiceNumber?: string | null
    Reference?: string | null
    DateString?: string | null
    DueDateString?: string | null
    Status?: string | null
    Total?: number | null
    Contact?: { Name?: string | null } | null
    LineItems?: XeroLineItem[] | null
}

async function xeroJson(url: string, accessToken: string, tenantId: string) {
    const response = await fetch(url, { headers: xeroHeaders(accessToken, tenantId), cache: "no-store" })
    const text = await response.text()
    const body = text ? JSON.parse(text) : {}
    if (!response.ok) throw new Error(body?.Message || body?.Detail || `Xero API error ${response.status}`)
    return body
}

async function getInvoice(invoiceNumber: string) {
    const xero = await getValidXero()
    if (!xero) throw new Error("Xero is not connected.")

    const escaped = invoiceNumber.replaceAll('"', '\\"')
    const where = encodeURIComponent(`InvoiceNumber==\"${escaped}\"`)
    const body = await xeroJson(`${XERO_API}/Invoices?where=${where}`, xero.accessToken, xero.tenantId)
    return (body?.Invoices?.[0] || null) as XeroInvoice | null
}

function preview(invoice: XeroInvoice) {
    return {
        invoiceId: invoice.InvoiceID || null,
        invoiceNumber: invoice.InvoiceNumber || null,
        reference: invoice.Reference || "",
        contactName: invoice.Contact?.Name || "",
        date: invoice.DateString || null,
        dueDate: invoice.DueDateString || null,
        status: invoice.Status || "",
        total: Number(invoice.Total || 0),
        lines: (invoice.LineItems || []).map((line, index) => ({
            index,
            itemCode: line.ItemCode || "",
            description: line.Description || "",
            quantity: Number(line.Quantity || 0),
            unitAmount: Number(line.UnitAmount || 0),
            lineAmount: Number(line.LineAmount || 0),
        })),
    }
}

export async function GET(req: NextRequest) {
    const server = await createServerClient()
    const { data: auth } = await server.auth.getUser()
    if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const invoiceNumber = (req.nextUrl.searchParams.get("invoice") || "").trim()
    if (!invoiceNumber) return NextResponse.json({ error: "Enter a Xero invoice number." }, { status: 400 })

    try {
        const admin = xeroAdmin()
        const { data: existing } = await admin
            .from("costing_jobs")
            .select("id,job_number,title")
            .eq("xero_invoice_number", invoiceNumber)
            .maybeSingle()

        if (existing) {
            return NextResponse.json({ error: `Invoice ${invoiceNumber} is already in RPM.`, existingJobId: existing.id }, { status: 409 })
        }

        const invoice = await getInvoice(invoiceNumber)
        if (!invoice) return NextResponse.json({ error: `Invoice ${invoiceNumber} was not found in Xero.` }, { status: 404 })
        if (String(invoice.Status || "").toUpperCase() === "VOIDED") {
            return NextResponse.json({ error: `Invoice ${invoiceNumber} is voided in Xero.` }, { status: 400 })
        }

        return NextResponse.json({ ok: true, invoice: preview(invoice) })
    } catch (error) {
        console.error("preview Xero invoice import", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the Xero invoice." }, { status: 500 })
    }
}

function itemFromLine(line: XeroLineItem, index: number) {
    const description = String(line.Description || "").trim()
    const parts = description.split(/\r?\n/).map((part) => part.trim()).filter(Boolean)
    const firstLine = parts[0] || ""
    const itemCode = String(line.ItemCode || "").trim()
    const name = itemCode || firstLine.replace(/[:\s]+$/, "") || `Invoice line ${index + 1}`
    const details = itemCode ? description : parts.slice(1).join("\n")

    return {
        name: name.slice(0, 200),
        details: details || null,
        mode: "simple",
        qty: Number(line.Quantity || 1),
        unit_cost: 0,
        unit_price: Number(line.UnitAmount || 0),
        sort: index,
    }
}

export async function POST(req: NextRequest) {
    const server = await createServerClient()
    const { data: auth } = await server.auth.getUser()
    if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = await req.json().catch(() => ({})) as {
        invoiceNumber?: string
        clientId?: string | null
        storeId?: string | null
        title?: string | null
        completionDate?: string | null
        invoiceId?: string | null
    }

    const invoiceNumber = String(body.invoiceNumber || "").trim()
    if (!invoiceNumber) return NextResponse.json({ error: "Invoice number is required." }, { status: 400 })

    const admin = xeroAdmin()
    let createdJobId: string | null = null

    try {
        const { data: existing } = await admin
            .from("costing_jobs")
            .select("id")
            .eq("xero_invoice_number", invoiceNumber)
            .maybeSingle()
        if (existing) return NextResponse.json({ error: `Invoice ${invoiceNumber} is already in RPM.`, existingJobId: existing.id }, { status: 409 })

        const invoice = await getInvoice(invoiceNumber)
        if (!invoice) return NextResponse.json({ error: `Invoice ${invoiceNumber} was not found in Xero.` }, { status: 404 })
        if (!invoice.InvoiceID || invoice.InvoiceNumber !== invoiceNumber || (body.invoiceId && body.invoiceId !== invoice.InvoiceID)) {
            return NextResponse.json({ error: "The Xero invoice changed since lookup. Find it again before importing." }, { status: 409 })
        }
        if (String(invoice.Status || "").toUpperCase() === "VOIDED") {
            return NextResponse.json({ error: `Invoice ${invoiceNumber} is voided in Xero.` }, { status: 400 })
        }

        if (body.storeId) {
            if (!body.clientId) return NextResponse.json({ error: "Select a customer for this site." }, { status: 400 })
            const { data: site, error: siteError } = await admin.from("stores").select("id,client_id").eq("id", body.storeId).maybeSingle()
            if (siteError) throw siteError
            if (!site || site.client_id !== body.clientId) return NextResponse.json({ error: "The selected site does not belong to this customer." }, { status: 400 })
        }

        const title = String(body.title || "").trim() || String(invoice.Reference || "").trim() || invoiceNumber
        const { data: job, error: jobError } = await admin
            .from("costing_jobs")
            .insert({
                job_number: invoiceNumber,
                title,
                reference: invoice.Reference || null,
                client_id: body.clientId || null,
                store_id: body.storeId || null,
                qty: 1,
                status: "in_progress",
                xero_invoice_number: invoiceNumber,
                completion_date: body.completionDate || null,
                is_template: false,
                created_by: auth.user.id,
                quoted_by: auth.user.id,
            })
            .select("id")
            .single()

        if (jobError || !job) throw jobError || new Error("Could not create the RPM job.")
        createdJobId = job.id as string

        const rows = (invoice.LineItems || []).map((line, index) => ({ job_id: createdJobId, ...itemFromLine(line, index) }))
        if (rows.length) {
            const { error: itemsError } = await admin.from("costing_items").insert(rows)
            if (itemsError) throw itemsError
        }

        return NextResponse.json({ ok: true, jobId: createdJobId, invoiceNumber })
    } catch (error) {
        if (createdJobId) await admin.from("costing_jobs").delete().eq("id", createdJobId)
        console.error("import Xero invoice as RPM job", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not import the Xero invoice." }, { status: 500 })
    }
}
