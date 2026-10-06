import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { getValidXero, xeroAdmin, XERO_API, xeroHeaders } from "@/lib/xero"
import { isStaffAdmin } from "@/lib/permissions"
import { XeroRateLimitError } from "@/lib/xero-rate-limit"
import { xeroFetch } from "@/lib/xero-requests"
import { itemFromXeroLine, type XeroImportLine } from "@/lib/xero-import-lines"

export const dynamic = "force-dynamic"

type XeroLineItem = XeroImportLine

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
    const response = await xeroFetch(url, { headers: xeroHeaders(accessToken, tenantId), cache: "no-store" }, tenantId, "import")
    const text = await response.text()
    const body = text ? JSON.parse(text) : {}
    if (!response.ok) throw new Error(body?.Message || body?.Detail || `Xero API error ${response.status}`)
    return body
}

async function getInvoice(invoiceNumber: string) {
    const xero = await getValidXero()
    if (!xero) throw new Error("Xero is not connected.")

    // Paging includes full line items in the lookup, avoiding a second detail request.
    const params = new URLSearchParams({ InvoiceNumbers: invoiceNumber, page: "1", pageSize: "100", unitdp: "4" })
    const detail = await xeroJson(`${XERO_API}/Invoices?${params}`, xero.accessToken, xero.tenantId)
    const invoice = (detail?.Invoices?.[0] || null) as XeroInvoice | null
    if (!invoice) return null
    if (!invoice.InvoiceID || invoice.InvoiceNumber !== invoiceNumber) {
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

    const requestedNumbers = Array.from(new Set((req.nextUrl.searchParams.get("invoice") || "").split(/[,;\n]+/).map((number) => number.trim()).filter(Boolean)))
    const invoiceNumber = requestedNumbers.join(",")
    if (!invoiceNumber) return NextResponse.json({ error: "Enter a Xero invoice number." }, { status: 400 })

    try {
        const admin = xeroAdmin()
        const { data: profile } = await admin.from("users").select("role").eq("id", auth.user.id).single()
        if (!isStaffAdmin(profile?.role)) return NextResponse.json({ error: "Only Rodier administrators can import Xero invoices." }, { status: 403 })
        const numbers = requestedNumbers
        if (numbers.length > 40) return NextResponse.json({ error: "Find up to 40 invoices at a time." }, { status: 400 })
        if (numbers.length > 1) {
            const xero = await getValidXero()
            if (!xero) throw new Error("Xero is not connected.")
            const { data: existing, error: existingError } = await admin.from("costing_jobs").select("xero_invoice_number,xero_invoice_id").in("xero_invoice_number", numbers)
            if (existingError) throw existingError
            const params = new URLSearchParams({ InvoiceNumbers: numbers.join(","), page: "1", pageSize: "100", unitdp: "4" })
            const result = await xeroJson(`${XERO_API}/Invoices?${params}`, xero.accessToken, xero.tenantId)
            const rows = (result?.Invoices || []) as XeroInvoice[]
            const invoices: ReturnType<typeof preview>[] = []
            const warnings: string[] = []
            for (const number of numbers) {
                const matches = rows.filter((invoice) => invoice.InvoiceNumber === number)
                const invoice = matches[0]
                if (existing?.some((job) => job.xero_invoice_number === number)) warnings.push(`${number} is already in RPM.`)
                else if (!invoice) warnings.push(`${number} was not found in Xero.`)
                else if (matches.length !== 1 || !invoice.InvoiceID || invoice.Type !== "ACCREC" || !["DRAFT", "AUTHORISED", "PAID"].includes(invoice.Status || "") || !hasImportableLines(invoice)) warnings.push(`${number} cannot be imported. Check its status and lines in Xero.`)
                else invoices.push(preview(invoice))
            }
            return NextResponse.json({ ok: true, invoices, warnings })
        }
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
        if (error instanceof XeroRateLimitError) return rateLimitResponse(error)
        console.error("preview Xero invoice import", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the Xero invoice." }, { status: 500 })
    }
}

function rateLimitResponse(error: XeroRateLimitError) {
    return NextResponse.json({ error: error.message, retryAfter: error.retryAfter }, {
        status: 429, headers: { "Retry-After": String(error.retryAfter) },
    })
}

export async function POST(req: NextRequest) {
    const server = await createServerClient()
    const { data: auth } = await server.auth.getUser()
    if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = await req.json().catch(() => ({})) as {
        invoiceNumber?: string
        clientId?: string | null
        storeId?: string | null
        storeIds?: string[]
        showAllSites?: boolean
        visibleToClient?: boolean
        title?: string | null
        completionDate?: string | null
        invoiceId?: string | null
    }

    const invoiceNumber = String(body.invoiceNumber || "").trim()
    if (!invoiceNumber) return NextResponse.json({ error: "Invoice number is required." }, { status: 400 })
    if (body.storeIds !== undefined && (!Array.isArray(body.storeIds) || body.storeIds.some((id) => typeof id !== "string" || !id.trim()))) {
        return NextResponse.json({ error: "Select valid sites." }, { status: 400 })
    }
    const storeIds = Array.from(new Set(body.storeIds ?? (body.storeId ? [body.storeId] : [])))

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

        for (const storeId of storeIds) {
            if (!body.clientId && body.showAllSites !== true) return NextResponse.json({ error: "Select a customer for this site." }, { status: 400 })
            const { data: site, error: siteError } = await admin.from("stores").select("id,client_id").eq("id", storeId).maybeSingle()
            if (siteError) throw siteError
            if (!site) return NextResponse.json({ error: "The selected site no longer exists. Select another site." }, { status: 400 })
            if (body.showAllSites !== true && site.client_id !== body.clientId) return NextResponse.json({ error: "The selected site does not belong to this customer." }, { status: 400 })
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
                store_id: storeIds[0] || null,
                visible_to_client: body.visibleToClient === true,
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

        if (storeIds.length > 1) {
            const { error: sitesError } = await admin.from("costing_job_sites").insert(
                storeIds.map((storeId, sort) => ({ job_id: createdJobId, store_id: storeId, sort }))
            )
            if (sitesError) throw sitesError
        }

        const rows = (invoice.LineItems || []).map((line, index) => ({ job_id: createdJobId, ...itemFromXeroLine(line, index) }))
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
        if (error instanceof XeroRateLimitError) return rateLimitResponse(error)
        console.error("import Xero invoice as RPM job", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not import the Xero invoice." }, { status: 500 })
    }
}
