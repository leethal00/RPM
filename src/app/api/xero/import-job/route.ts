import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { getValidXero, xeroAdmin, XERO_API, xeroHeaders } from "@/lib/xero"
import { isStaffAdmin } from "@/lib/permissions"

export const dynamic = "force-dynamic"

type XeroLineItem = {
    LineItemID?: string | null
    ItemCode?: string | null
    Description?: string | null
    Quantity?: number | null
    UnitAmount?: number | null
    LineAmount?: number | null
}

type XeroInvoice = {
    InvoiceID?: string | null
    InvoiceNumber?: string | null
    Type?: string | null
    Reference?: string | null
    DateString?: string | null
    DueDateString?: string | null
    Status?: string | null
    Total?: number | null
    SubTotal?: number | null
    Contact?: { ContactID?: string | null; Name?: string | null } | null
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
    const summary = (body?.Invoices?.[0] || null) as XeroInvoice | null
    if (!summary) return null
    if (!summary.InvoiceID || summary.InvoiceNumber !== invoiceNumber) {
        throw new Error("The Xero invoice could not be identified. Find it again.")
    }
    // Xero's filtered invoice list is a summary; line items require an individual invoice request.
    const detail = await xeroJson(`${XERO_API}/Invoices/${encodeURIComponent(summary.InvoiceID)}?unitdp=4`, xero.accessToken, xero.tenantId)
    const invoice = (detail?.Invoices?.[0] || null) as XeroInvoice | null
    if (!invoice || invoice.InvoiceID !== summary.InvoiceID || invoice.InvoiceNumber !== invoiceNumber) {
        throw new Error("The Xero invoice detail did not match the lookup. Find it again.")
    }
    return invoice
}

function hasImportableLines(invoice: XeroInvoice) {
    return Array.isArray(invoice.LineItems) && invoice.LineItems.length > 0
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
        subTotal: Number(invoice.SubTotal || 0),
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
        const { data: profile } = await admin.from("users").select("role").eq("id", auth.user.id).single()
        if (!isStaffAdmin(profile?.role)) return NextResponse.json({ error: "Only Rodier administrators can import Xero invoices." }, { status: 403 })
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
        if (!invoice.InvoiceID || invoice.InvoiceNumber !== invoiceNumber) {
            return NextResponse.json({ error: "The Xero invoice could not be identified. Find it again." }, { status: 409 })
        }
        if (invoice.Type !== "ACCREC" || !["DRAFT", "AUTHORISED", "PAID"].includes(invoice.Status || "")) {
            return NextResponse.json({ error: "Only draft or approved Xero sales invoices can be imported." }, { status: 400 })
        }
        if (!hasImportableLines(invoice)) return NextResponse.json({ error: "Xero returned no invoice lines. The invoice cannot be imported for BOMs yet." }, { status: 409 })
        const { data: claimed } = await admin.from("costing_jobs").select("id").eq("xero_invoice_id", invoice.InvoiceID).maybeSingle()
        if (claimed) return NextResponse.json({ error: `Invoice ${invoiceNumber} is already linked to an RPM job.`, existingJobId: claimed.id }, { status: 409 })

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
        qty: line.Quantity == null ? 1 : Number(line.Quantity),
        unit_cost: 0,
        unit_price: Number(line.UnitAmount || 0),
        xero_imported_line: true,
        xero_line_item_id: line.LineItemID || null,
        xero_line_amount: line.LineAmount == null ? null : Number(line.LineAmount),
        xero_unit_amount: line.UnitAmount == null ? null : Number(line.UnitAmount),
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
    const { data: profile } = await admin.from("users").select("role").eq("id", auth.user.id).single()
    if (!isStaffAdmin(profile?.role)) return NextResponse.json({ error: "Only Rodier administrators can import Xero invoices." }, { status: 403 })
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
        if (invoice.Type !== "ACCREC" || !["DRAFT", "AUTHORISED", "PAID"].includes(invoice.Status || "")) {
            return NextResponse.json({ error: "Only draft or approved Xero sales invoices can be imported." }, { status: 400 })
        }
        if (!hasImportableLines(invoice)) return NextResponse.json({ error: "Xero returned no invoice lines. The invoice cannot be imported for BOMs yet." }, { status: 409 })
        const { data: claimed } = await admin.from("costing_jobs").select("id").eq("xero_invoice_id", invoice.InvoiceID).maybeSingle()
        if (claimed) return NextResponse.json({ error: `Invoice ${invoiceNumber} is already linked to an RPM job.`, existingJobId: claimed.id }, { status: 409 })

        if (body.storeId) {
            if (!body.clientId) return NextResponse.json({ error: "Select a customer for this site." }, { status: 400 })
            const { data: site, error: siteError } = await admin.from("stores").select("id,client_id").eq("id", body.storeId).maybeSingle()
            if (siteError) throw siteError
            if (!site || site.client_id !== body.clientId) return NextResponse.json({ error: "The selected site does not belong to this customer." }, { status: 400 })
        }

        let resolvedClientId = body.clientId || null
        if (!resolvedClientId) {
            const contactName = String(invoice.Contact?.Name || "").trim()
            if (!contactName) return NextResponse.json({ error: "The Xero invoice has no customer name to import." }, { status: 409 })
            const { data: customers, error: customerError } = await admin.from("clients").select("id,name")
            if (customerError) throw customerError
            const matches = (customers || []).filter((customer) => String(customer.name || "").trim().toLocaleLowerCase() === contactName.toLocaleLowerCase())
            if (matches.length > 1) return NextResponse.json({ error: `Multiple RPM customers match ${contactName}. Select the correct customer before importing.` }, { status: 409 })
            if (matches.length === 1) resolvedClientId = matches[0].id
            else {
                const { data: customer, error: createError } = await admin.from("clients")
                    .insert({ name: contactName, active: true })
                    .select("id")
                    .single()
                if (createError || !customer) throw createError || new Error("Could not import the Xero customer.")
                resolvedClientId = customer.id
            }
        }

        const title = String(body.title || "").trim() || String(invoice.Reference || "").trim() || invoiceNumber
        const { data: job, error: jobError } = await admin
            .from("costing_jobs")
            .insert({
                job_number: invoiceNumber,
                title,
                reference: invoice.Reference || null,
                client_id: resolvedClientId,
                store_id: body.storeId || null,
                qty: 1,
                status: "in_progress",
                xero_invoice_id: invoice.InvoiceID,
                xero_invoice_number: invoiceNumber,
                completion_date: body.completionDate || invoice.DateString?.slice(0, 10) || null,
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

        const { error: statusError } = await admin.from("costing_jobs")
            .update({ xero_invoice_import_status: invoice.Status })
            .eq("id", createdJobId)
        if (statusError) throw statusError

        return NextResponse.json({ ok: true, jobId: createdJobId, invoiceNumber, invoiceStatus: invoice.Status })
    } catch (error) {
        if (createdJobId) await admin.from("costing_jobs").delete().eq("id", createdJobId)
        console.error("import Xero invoice as RPM job", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not import the Xero invoice." }, { status: 500 })
    }
}

