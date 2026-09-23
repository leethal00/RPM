import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { getValidXero, xeroAdmin, XERO_API, xeroHeaders } from "@/lib/xero"
import { effectiveBuildSell } from "@/lib/costing/pricing"

export const dynamic = "force-dynamic"
const SECTION_HEADING_CODE = "__RPM_SECTION_HEADING__"
const NOTE_CODE = "__RPM_NOTE__"

function isoDate(date: Date) {
    return date.toISOString().slice(0, 10)
}

function normalise(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function shortSiteName(name: string) {
    return name
        .replace(/\bfreestander\b/gi, "")
        .replace(/\bstand\s*alone\b/gi, "")
        .replace(/\s+/g, " ")
        .trim()
}

function cleanItemDetails(name: string, details?: string | null) {
    const raw = (details || "").trim()
    if (!raw) return ""
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    return raw.replace(new RegExp(`^${escaped}\\s*[:—-]?\\s*`, "i"), "").trim()
}


function quoteItemDescription(item: { name: string; qty: number; build_qty?: number | null; mode?: string; size?: string | null; details?: string | null; delivery?: string | null }) {
    const details = cleanItemDetails(item.name, item.details)
    return [
        item.name,
        `Qty: ${Number(item.mode === "build" && item.build_qty != null ? item.build_qty : (item.qty || 1))}`,
        item.size?.trim() ? `Size: ${item.size.trim()}` : null,
        details ? `Details: ${details}` : null,
        item.delivery?.trim() || null,
    ].filter(Boolean).join("\n")
}

function accountCodeForItem(name: string) {
    const n = normalise(name)
    if (n.includes("travel") || n.includes("mileage")) return "250"
    if (n.includes("material")) return "240"
    return "200"
}

async function xeroJson(url: string, init: RequestInit, accessToken: string, tenantId: string) {
    const response = await fetch(url, {
        ...init,
        headers: { ...xeroHeaders(accessToken, tenantId), ...(init.headers || {}) },
    })
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

async function findContactId(
    clientName: string,
    storeName: string | undefined,
    email: string | undefined,
    accessToken: string,
    tenantId: string
) {
    const siteShort = storeName ? shortSiteName(storeName) : ""

    if (siteShort) {
        const where = encodeURIComponent(`Name.Contains(\"${siteShort.replaceAll('"', '\\"')}\")`)
        const result = await xeroJson(`${XERO_API}/Contacts?where=${where}`, { method: "GET" }, accessToken, tenantId)
        const candidates = (result?.Contacts || []) as Array<{ ContactID?: string; Name?: string }>
        const clientTokens = normalise(clientName).split(" ").filter(Boolean)
        const siteTokens = normalise(siteShort).split(" ").filter(Boolean)
        const scored = candidates
            .map((contact) => {
                const name = normalise(contact.Name || "")
                const clientScore = clientTokens.reduce((n, token) => n + (name.includes(token) ? 2 : 0), 0)
                const siteScore = siteTokens.reduce((n, token) => n + (name.includes(token) ? 3 : 0), 0)
                return { contact, score: clientScore + siteScore }
            })
            .sort((a, b) => b.score - a.score)
        if (scored[0]?.score > 0 && scored[0].contact.ContactID) return scored[0].contact.ContactID
    }

    const exactWhere = encodeURIComponent(`Name==\"${clientName.replaceAll('"', '\\"')}\"`)
    const exact = await xeroJson(`${XERO_API}/Contacts?where=${exactWhere}`, { method: "GET" }, accessToken, tenantId)
    if (exact?.Contacts?.[0]?.ContactID) return exact.Contacts[0].ContactID as string

    const newContactName = siteShort ? `${clientName} ${siteShort}` : clientName
    const created = await xeroJson(`${XERO_API}/Contacts`, {
        method: "POST",
        body: JSON.stringify({ Contacts: [{ Name: newContactName, ...(email ? { EmailAddress: email } : {}) }] }),
    }, accessToken, tenantId)
    return created?.Contacts?.[0]?.ContactID as string | undefined
}

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const server = await createServerClient()
    const { data: auth } = await server.auth.getUser()
    if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await context.params
    const admin = xeroAdmin()

    const { data: job, error: jobError } = await admin
        .from("costing_jobs")
        .select("id,title,reference,details,contact_name,adjusted_total,status,xero_quote_id,client_id,store_id,clients(name,contact_email),stores(name)")
        .eq("id", id)
        .single()

    if (jobError || !job) return NextResponse.json({ error: "Quote not found" }, { status: 404 })
    if (job.xero_quote_id) return NextResponse.json({ error: "This quote has already been sent to Xero." }, { status: 409 })

    const [{ data: items, error: itemsError }, { data: costingLines, error: linesError }] = await Promise.all([
        admin.from("costing_items").select("id,name,size,details,delivery,sign_code,mode,qty,build_qty,unit_price,sort").eq("job_id", id).order("sort"),
        admin.from("costing_lines").select("item_id,qty,unit_cost,markup,unit_sell_override").eq("job_id", id),
    ])

    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
    if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 })
    if (!items?.length) return NextResponse.json({ error: "Add at least one item before sending the quote to Xero." }, { status: 400 })

    const xero = await getValidXero()
    if (!xero) return NextResponse.json({ error: "Xero is not connected." }, { status: 409 })

    try {
        const client = Array.isArray(job.clients) ? job.clients[0] : job.clients
        const store = Array.isArray(job.stores) ? job.stores[0] : job.stores
        const clientName = client?.name || "Rodier RPM customer"
        const contactId = await findContactId(clientName, store?.name, client?.contact_email || undefined, xero.accessToken, xero.tenantId)
        if (!contactId) throw new Error("Xero contact could not be found or created.")

        const standardTerms = await getXeroStandardQuoteTerms(xero.accessToken, xero.tenantId)
        const lines = costingLines || []
        let sectionNumber = 0
        const pricedLineItems = items.flatMap((item) => {
            if (item.sign_code === SECTION_HEADING_CODE) {
                sectionNumber += 1
                return [
                    { Description: "--" },
                    { Description: `${sectionNumber}. ${(item.name || "SECTION").trim().toUpperCase()}` },
                ]
            }

            if (item.sign_code === NOTE_CODE) return [{ Description: (item.name || "").trim() }]

            let unitAmount = Number(item.unit_price || 0)
            if (item.mode === "build") {
                const calculated = lines
                    .filter((line) => line.item_id === item.id)
                    .reduce((sum, line) => {
                        const sell = line.unit_sell_override != null
                            ? Number(line.unit_sell_override)
                            : Number(line.unit_cost || 0) * (1 + Number(line.markup || 0))
                        return sum + Number(line.qty || 0) * sell
                    }, 0)
                unitAmount = effectiveBuildSell(calculated, item.unit_price)
            }
            return {
                Description: quoteItemDescription(item),
                Quantity: Number(item.qty || 1),
                UnitAmount: Number(unitAmount.toFixed(2)),
                AccountCode: accountCodeForItem(item.name),
                TaxType: "OUTPUT2",
            }
        })

        const siteLabel = store?.name ? `${clientName} ${store.name}`.trim() : clientName
        const introDescription = [
            `${siteLabel}:`,
            job.details?.trim() || job.reference?.trim() || job.title.trim(),
            job.contact_name?.trim() ? `Contact: ${job.contact_name.trim()}` : null,
        ].filter(Boolean).join("\n")

        const lineItems = [
            { Description: introDescription },
            ...pricedLineItems,
        ]

        const expiry = new Date()
        expiry.setDate(expiry.getDate() + 30)
        const visibleReference = job.title.trim()
        const xeroQuote = await xeroJson(`${XERO_API}/Quotes`, {
            method: "POST",
            body: JSON.stringify({
                Quotes: [{
                    Contact: { ContactID: contactId },
                    Date: isoDate(new Date()),
                    ExpiryDate: isoDate(expiry),
                    Status: "DRAFT",
                    Reference: visibleReference,
                    ...(standardTerms ? { Terms: standardTerms } : {}),
                    LineItems: lineItems,
                }],
            }),
        }, xero.accessToken, xero.tenantId)

        const createdQuote = xeroQuote?.Quotes?.[0]
        if (!createdQuote?.QuoteID) throw new Error("Xero did not return a quote ID.")

        const { error: saveError } = await admin.from("costing_jobs").update({
            xero_quote_id: createdQuote.QuoteID,
            xero_quote_number: createdQuote.QuoteNumber || null,
            status: "quoted",
            updated_at: new Date().toISOString(),
        }).eq("id", id)
        if (saveError) throw saveError

        return NextResponse.json({
            ok: true,
            quoteId: createdQuote.QuoteID,
            quoteNumber: createdQuote.QuoteNumber || null,
            status: "quoted",
        })
    } catch (error) {
        console.error("send xero quote", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send quote to Xero." }, { status: 500 })
    }
}
