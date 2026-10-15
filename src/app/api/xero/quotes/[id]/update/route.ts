import { xeroErrorResponse } from "@/lib/xero-error-response"
import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { getValidXero, xeroAdmin, XERO_API, xeroHeaders } from "@/lib/xero"
import { buildXeroQuoteLines, type QuoteCostLine, type QuoteItem } from "@/lib/xero-quote-lines"
import { xeroFetch } from "@/lib/xero-requests"

export const dynamic = "force-dynamic"

function normalise(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function shortSiteName(name: string) {
    return name.replace(/\bfreestander\b/gi, "").replace(/\bstand\s*alone\b/gi, "").replace(/\s+/g, " ").trim()
}

async function xeroJson(url: string, init: RequestInit, accessToken: string, tenantId: string) {
    const response = await xeroFetch(url, {
        ...init,
        headers: { ...xeroHeaders(accessToken, tenantId), ...(init.headers || {}) },
    }, tenantId, "quote-update")
    const text = await response.text()
    const body = text ? JSON.parse(text) : {}
    if (!response.ok) {
        const detail = body?.Elements?.[0]?.ValidationErrors?.map((e: { Message?: string }) => e.Message).filter(Boolean).join("; ")
        throw new Error(detail || body?.Message || body?.Detail || `Xero API error ${response.status}`)
    }
    return body
}


async function getXeroStandardQuoteTerms(accessToken: string, tenantId: string, excludeQuoteId?: string) {
    // Xero exposes Terms on quotes, but not the organisation's default quote-terms setting.
    // Use the most recently updated Xero quote carrying Terms as Xero's source of truth,
    // rather than maintaining a duplicate copy in RPM.
    const result = await xeroJson(
        `${XERO_API}/Quotes?page=1&pageSize=100&order=${encodeURIComponent("UpdatedDateUTC DESC")}`,
        { method: "GET" },
        accessToken,
        tenantId
    )
    const quotes = (result?.Quotes || []) as Array<{ QuoteID?: string; Terms?: string | null }>
    const source = quotes.find((quote) => quote.QuoteID !== excludeQuoteId && quote.Terms?.trim())
    return source?.Terms?.trim() || ""
}

async function findContactId(clientName: string, storeName: string | undefined, email: string | undefined, accessToken: string, tenantId: string) {
    const siteShort = storeName ? shortSiteName(storeName) : ""
    if (siteShort) {
        const where = encodeURIComponent(`Name.Contains(\"${siteShort.replaceAll('"', '\\"')}\")`)
        const result = await xeroJson(`${XERO_API}/Contacts?where=${where}`, { method: "GET" }, accessToken, tenantId)
        const candidates = (result?.Contacts || []) as Array<{ ContactID?: string; Name?: string }>
        const clientTokens = normalise(clientName).split(" ").filter(Boolean)
        const siteTokens = normalise(siteShort).split(" ").filter(Boolean)
        const scored = candidates.map((contact) => {
            const name = normalise(contact.Name || "")
            const score = clientTokens.reduce((n, token) => n + (name.includes(token) ? 2 : 0), 0) + siteTokens.reduce((n, token) => n + (name.includes(token) ? 3 : 0), 0)
            return { contact, score }
        }).sort((a, b) => b.score - a.score)
        if (scored[0]?.score > 0 && scored[0].contact.ContactID) return scored[0].contact.ContactID
    }

    const exactWhere = encodeURIComponent(`Name==\"${clientName.replaceAll('"', '\\"')}\"`)
    const exact = await xeroJson(`${XERO_API}/Contacts?where=${exactWhere}`, { method: "GET" }, accessToken, tenantId)
    if (exact?.Contacts?.[0]?.ContactID) return exact.Contacts[0].ContactID as string

    const stem = normalise(clientName).replace(/\b(limited|ltd)$/, "").trim()
    if (stem) {
        const candidateWhere = encodeURIComponent(`Name.Contains("${stem.replaceAll('"', '\\"')}")`)
        const nearby = await xeroJson(`${XERO_API}/Contacts?where=${candidateWhere}`, { method: "GET" }, accessToken, tenantId)
        if ((nearby?.Contacts || []).some((contact: { Name?: string }) => normalise(contact.Name || "").replace(/\b(limited|ltd)$/, "").trim() === stem)) {
            throw new Error(`Xero has a similar contact for ${clientName}. Link it to the RPM customer in Customer Management before updating.`)
        }
    }

    const newContactName = siteShort ? `${clientName} ${siteShort}` : clientName
    const created = await xeroJson(`${XERO_API}/Contacts`, {
        method: "POST",
        body: JSON.stringify({ Contacts: [{ Name: newContactName, ...(email ? { EmailAddress: email } : {}) }] }),
    }, accessToken, tenantId)
    return created?.Contacts?.[0]?.ContactID as string | undefined
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const server = await createServerClient()
    const { data: auth } = await server.auth.getUser()
    if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
    const { id } = await context.params
    const { data: job } = await xeroAdmin().from("costing_jobs").select("xero_quote_id,xero_quote_number").eq("id", id).single()
    if (!job?.xero_quote_id) return NextResponse.json({ error: "Linked Xero quote not found" }, { status: 404 })
    const xero = await getValidXero()
    if (!xero) return NextResponse.json({ error: "Xero is not connected" }, { status: 409 })
    try {
        const result = await xeroJson(`${XERO_API}/Quotes/${job.xero_quote_id}`, { method: "GET" }, xero.accessToken, xero.tenantId)
        const quote = result?.Quotes?.[0]
        if (quote?.QuoteID !== job.xero_quote_id) return NextResponse.json({ error: "Xero returned another quote" }, { status: 502 })
        return NextResponse.json({
            xeroQuoteId: quote.QuoteID,
            xeroQuoteNumber: quote.QuoteNumber,
            rpmQuoteNumber: job.xero_quote_number,
            status: quote.Status,
            subtotal: quote.SubTotal,
            lines: (quote.LineItems || []).map((line: { Description?: string; Quantity?: number; UnitAmount?: number; LineAmount?: number }) => ({
                description: line.Description, quantity: line.Quantity, unitAmount: line.UnitAmount, amount: line.LineAmount,
            })),
        })
    } catch (error) {
        const limited = xeroErrorResponse(error)
        if (limited) return limited
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not inspect Xero quote" }, { status: 500 })
    }
}

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const server = await createServerClient()
    const { data: auth } = await server.auth.getUser()
    if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await context.params
    const admin = xeroAdmin()
    const { data: job, error: jobError } = await admin
        .from("costing_jobs")
        .select("id,title,reference,details,contact_name,status,xero_quote_id,xero_quote_number,xero_invoice_id,xero_invoice_number,client_id,clients(name,contact_email),stores(name)")
        .eq("id", id)
        .single()

    if (jobError || !job) return NextResponse.json({ error: "Quote not found" }, { status: 404 })
    if (!job.xero_quote_id) return NextResponse.json({ error: "This quote has not been sent to Xero yet." }, { status: 400 })
    if (job.status !== "quoted" || job.xero_invoice_id || job.xero_invoice_number) {
        return NextResponse.json({ error: "Only an open quote without a linked invoice can be updated in Xero." }, { status: 409 })
    }

    const [{ data: items, error: itemsError }, { data: costingLines, error: linesError }] = await Promise.all([
        admin.from("costing_items").select("id,name,size,details,delivery,sign_code,mode,qty,build_qty,unit_price,round_final_sell_to_five,sort").eq("job_id", id).order("sort"),
        admin.from("costing_lines").select("item_id,qty,unit_cost,markup,unit_sell_override").eq("job_id", id),
    ])
    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
    if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 })

    const xero = await getValidXero()
    if (!xero) return NextResponse.json({ error: "Xero is not connected." }, { status: 409 })

    try {
        const existingResult = await xeroJson(`${XERO_API}/Quotes/${job.xero_quote_id}`, { method: "GET" }, xero.accessToken, xero.tenantId)
        const existing = existingResult?.Quotes?.[0]
        if (!existing) throw new Error("Quote could not be found in Xero.")
        if (existing.QuoteID !== job.xero_quote_id) throw new Error("Xero returned a different quote. No update was made.")
        if (job.xero_quote_number && existing.QuoteNumber !== job.xero_quote_number) {
            return NextResponse.json({ error: `RPM shows ${job.xero_quote_number}, but Xero shows ${existing.QuoteNumber || "no quote number"}. Check the linked quote before updating.` }, { status: 409 })
        }
        const xeroStatus = String(existing.Status || "").toUpperCase()
        if (xeroStatus !== "DRAFT" && xeroStatus !== "SENT") {
            return NextResponse.json({ error: `Xero quote is ${existing.Status || "unavailable"}. Only draft and sent quotes can be revised; check its status in RPM first.` }, { status: 409 })
        }

        const client = Array.isArray(job.clients) ? job.clients[0] : job.clients
        const store = Array.isArray(job.stores) ? job.stores[0] : job.stores
        const clientName = client?.name || "Rodier RPM customer"
        // A sent quote may already be in a customer's hands. Keep its Xero
        // contact stable while revising the scope and prices in place.
        const { data: linkedContact, error: linkError } = job.client_id
            ? await admin.from("xero_client_contacts").select("xero_contact_id").eq("client_id", job.client_id).eq("preferred", true).maybeSingle()
            : { data: null, error: null }
        if (linkError) throw linkError
        const contactId = xeroStatus === "SENT"
            ? existing.Contact?.ContactID
            : linkedContact?.xero_contact_id || await findContactId(clientName, store?.name, client?.contact_email || undefined, xero.accessToken, xero.tenantId)
        if (!contactId) throw new Error("Xero contact could not be found or created.")

        const standardTerms = xeroStatus === "SENT"
            ? existing.Terms
            : existing.Terms?.trim() || await getXeroStandardQuoteTerms(xero.accessToken, xero.tenantId, job.xero_quote_id)
        const lineItems = buildXeroQuoteLines(job, (items || []) as QuoteItem[], (costingLines || []) as QuoteCostLine[])

        const visibleReference = job.title.trim()
        const updated = await xeroJson(`${XERO_API}/Quotes/${job.xero_quote_id}`, {
            method: "POST",
            body: JSON.stringify({ Quotes: [{
                QuoteID: job.xero_quote_id,
                QuoteNumber: job.xero_quote_number || existing.QuoteNumber,
                Contact: { ContactID: contactId },
                Status: xeroStatus,
                Date: existing.DateString || existing.Date,
                ExpiryDate: existing.ExpiryDateString || existing.ExpiryDate,
                Reference: visibleReference,
                ...(standardTerms !== undefined ? { Terms: standardTerms } : {}),
                LineItems: lineItems,
            }] }),
        }, xero.accessToken, xero.tenantId)

        const saved = updated?.Quotes?.[0]
        if (!saved?.QuoteID || saved.QuoteID !== job.xero_quote_id
            || (job.xero_quote_number && saved.QuoteNumber !== job.xero_quote_number)
            || saved.HasErrors || saved.StatusAttributeString === "ERROR"
            || String(saved.Status || "").toUpperCase() !== xeroStatus) {
            throw new Error("Xero did not confirm the quote number and status after the update. Check the quote in Xero before sending it to the client.")
        }
        return NextResponse.json({ ok: true, quote: saved, resendRequired: xeroStatus === "SENT" })
    } catch (error) {
        const limited = xeroErrorResponse(error)
        if (limited) return limited
        console.error("update xero quote", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update Xero quote." }, { status: 500 })
    }
}
