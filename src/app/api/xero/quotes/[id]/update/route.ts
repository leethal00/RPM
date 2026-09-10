import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { getValidXero, xeroAdmin, XERO_API, xeroHeaders } from "@/lib/xero"

export const dynamic = "force-dynamic"

function normalise(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function shortSiteName(name: string) {
    return name.replace(/\bfreestander\b/gi, "").replace(/\bstand\s*alone\b/gi, "").replace(/\s+/g, " ").trim()
}

function rpmReference(id: string) {
    return `RPM-${id.slice(0, 8).toUpperCase()}`
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
        .select("id,title,reference,details,adjusted_total,xero_quote_id,clients(name,contact_email),stores(name)")
        .eq("id", id)
        .single()

    if (jobError || !job) return NextResponse.json({ error: "Quote not found" }, { status: 404 })
    if (!job.xero_quote_id) return NextResponse.json({ error: "This quote has not been sent to Xero yet." }, { status: 400 })

    const [{ data: items, error: itemsError }, { data: costingLines, error: linesError }] = await Promise.all([
        admin.from("costing_items").select("id,name,details,mode,qty,unit_price,sort").eq("job_id", id).order("sort"),
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
        if (String(existing.Status || "").toUpperCase() !== "DRAFT") {
            throw new Error(`Xero quote is ${existing.Status || "not draft"}; only draft quotes can be updated from RPM.`)
        }

        const client = Array.isArray(job.clients) ? job.clients[0] : job.clients
        const store = Array.isArray(job.stores) ? job.stores[0] : job.stores
        const clientName = client?.name || "Rodier RPM customer"
        const contactId = await findContactId(clientName, store?.name, client?.contact_email || undefined, xero.accessToken, xero.tenantId)
        if (!contactId) throw new Error("Xero contact could not be found or created.")

        const lines = costingLines || []
        const lineItems = (items || []).map((item) => {
            let unitAmount = Number(item.unit_price || 0)
            if (item.mode === "build") {
                unitAmount = lines.filter((line) => line.item_id === item.id).reduce((sum, line) => {
                    const sell = line.unit_sell_override != null ? Number(line.unit_sell_override) : Number(line.unit_cost || 0) * (1 + Number(line.markup || 0))
                    return sum + Number(line.qty || 0) * sell
                }, 0)
            }
            return {
                Description: [item.name, item.details].filter(Boolean).join(" — "),
                Quantity: Number(item.qty || 1),
                UnitAmount: Number(unitAmount.toFixed(2)),
            }
        })

        const itemTotal = lineItems.reduce((sum, line) => sum + line.Quantity * line.UnitAmount, 0)
        const adjustedTotal = job.adjusted_total == null ? null : Number(job.adjusted_total)
        if (adjustedTotal != null && Math.abs(adjustedTotal - itemTotal) > 0.005) {
            lineItems.push({ Description: "Quote total adjustment", Quantity: 1, UnitAmount: Number((adjustedTotal - itemTotal).toFixed(2)) })
        }

        const visibleReference = job.reference?.trim() || store?.name || job.title
        const updated = await xeroJson(`${XERO_API}/Quotes`, {
            method: "POST",
            body: JSON.stringify({ Quotes: [{
                QuoteID: job.xero_quote_id,
                Contact: { ContactID: contactId },
                Date: existing.DateString || existing.Date,
                ExpiryDate: existing.ExpiryDateString || existing.ExpiryDate,
                Status: "DRAFT",
                Reference: visibleReference,
                Title: job.title,
                Summary: rpmReference(id),
                Terms: job.details || undefined,
                LineItems: lineItems,
            }] }),
        }, xero.accessToken, xero.tenantId)

        return NextResponse.json({ ok: true, quote: updated?.Quotes?.[0] || null })
    } catch (error) {
        console.error("update xero quote", error)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update Xero quote." }, { status: 500 })
    }
}
