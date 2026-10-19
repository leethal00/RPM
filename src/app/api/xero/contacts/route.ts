import { NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { getValidXero, XERO_API, xeroHeaders } from "@/lib/xero"
import { xeroFetch } from "@/lib/xero-requests"
import { xeroErrorResponse } from "@/lib/xero-error-response"
import { xeroAdmin } from "@/lib/xero"
import { isStaffAdmin } from "@/lib/permissions"
import { unambiguousMcDonaldsSiteLinks } from "@/lib/mcdonalds-site-match"

export const dynamic = "force-dynamic"

type Contact = { id: string; name: string; email: string; firstName: string; lastName: string; phones: unknown[]; addresses: unknown[]; people: unknown[] }

async function allCustomerContacts(accessToken: string, tenantId: string): Promise<Contact[]> {
    const contacts: Contact[] = []
    for (let page = 1; page <= 200; page++) {
        const params = new URLSearchParams({ where: 'ContactStatus=="ACTIVE"', order: "Name", page: String(page), pageSize: "1000" })
        const response = await xeroFetch(`${XERO_API}/Contacts?${params}`, {
            headers: xeroHeaders(accessToken, tenantId), cache: "no-store"
        }, tenantId, "contacts")
        const body = await response.json()
        if (!response.ok) throw new Error(body?.Message || "Could not load Xero contacts.")
        const batch = (body?.Contacts || []) as Array<{ ContactID: string; Name: string; IsCustomer?: boolean; EmailAddress?: string; FirstName?: string; LastName?: string; Phones?: unknown[]; Addresses?: unknown[]; ContactPersons?: unknown[] }>
        contacts.push(...batch.filter((c) => c.IsCustomer).map((c) => ({
            id: c.ContactID, name: c.Name, email: c.EmailAddress || "", firstName: c.FirstName || "", lastName: c.LastName || "",
            phones: c.Phones || [], addresses: c.Addresses || [], people: c.ContactPersons || []
        })))
        if (batch.length < 1000) return contacts
    }
    throw new Error("Xero has more contacts than this sync can safely load. Contact support before importing.")
}

export async function GET() {
    const server = await createServerClient()
    const { data: auth } = await server.auth.getUser()
    if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
    const xero = await getValidXero()
    if (!xero) return NextResponse.json({ error: "Xero is not connected." }, { status: 409 })
    try {
    return NextResponse.json({ contacts: await allCustomerContacts(xero.accessToken, xero.tenantId) })
    } catch (error) {
        return xeroErrorResponse(error) || NextResponse.json({ error: error instanceof Error ? error.message : "Could not load Xero contacts." }, { status: 500 })
    }
}

function key(name: string) { return name.trim().toLocaleLowerCase("en-NZ").replace(/\s+/g, " ") }
function legalKey(name: string) { return key(name).replace(/\s+(limited|ltd)\.?$/, "") }

export async function POST(request: Request) {
    const server = await createServerClient()
    const { data: auth } = await server.auth.getUser()
    if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
    const admin = xeroAdmin()
    const { data: profile } = await admin.from("users").select("role").eq("id", auth.user.id).single()
    if (!isStaffAdmin(profile?.role)) return NextResponse.json({ error: "Only Rodier administrators can sync Xero customers." }, { status: 403 })
    const body = await request.json().catch(() => ({})) as { contactId?: string; clientId?: string; preferred?: boolean }
    try {
        const xero = await getValidXero()
        if (!xero) return NextResponse.json({ error: "Xero is not connected." }, { status: 409 })
        const contacts = await allCustomerContacts(xero.accessToken, xero.tenantId)
        const clients: Array<{ id: string; name: string; contact_email: string | null }> = []
        const links: Array<{ xero_contact_id: string; client_id: string; store_id: string | null; preferred: boolean }> = []
        for (let offset = 0; offset < 200000; offset += 1000) {
            const { data, error } = await admin.from("clients").select("id,name,contact_email").order("id").range(offset, offset + 999)
            if (error) throw error
            clients.push(...(data || []))
            if ((data || []).length < 1000) break
        }
        for (let offset = 0; offset < 200000; offset += 1000) {
            const { data, error } = await admin.from("xero_client_contacts").select("xero_contact_id,client_id,store_id,preferred").order("xero_contact_id").range(offset, offset + 999)
            if (error) throw error
            links.push(...(data || []))
            if ((data || []).length < 1000) break
        }
        if (body.contactId || body.clientId) {
            const contact = contacts.find((c) => c.id === body.contactId)
            const client = clients.find((c) => c.id === body.clientId)
            if (!contact || !client) return NextResponse.json({ error: "Choose a current Xero customer and RPM customer." }, { status: 400 })
            if (body.preferred) {
                const { error } = await admin.from("xero_client_contacts").update({ preferred: false }).eq("client_id", client.id)
                if (error) throw error
            }
            const previous = links.find((link) => link.xero_contact_id === contact.id)
            const { error } = await admin.from("xero_client_contacts").upsert({ xero_contact_id: contact.id, client_id: client.id, store_id: previous?.store_id || null, xero_name: contact.name, email: contact.email || null, preferred: !!body.preferred, updated_at: new Date().toISOString() })
            if (error) throw error
            return NextResponse.json({ linked: true })
        }
        const byName = new Map(clients.map((client) => [key(client.name), client]))
        const byContactId = new Map(links.map((link) => [link.xero_contact_id, link]))
        const linked = new Set(links.map((link) => link.xero_contact_id))
        const preferred = new Set(links.filter((link) => link.preferred).map((link) => link.client_id))
        const unlinked = contacts.filter((contact) => !linked.has(contact.id))
        const newNames = new Map<string, Contact>()
        const review: Array<{ contactId: string; name: string; suggestedClientId?: string; suggestedClientName?: string }> = []
        for (const contact of unlinked) {
            if (byName.has(key(contact.name))) continue
            const candidates = clients.filter((entry) => legalKey(entry.name) === legalKey(contact.name))
            if (candidates.length) review.push({ contactId: contact.id, name: contact.name, suggestedClientId: candidates.length === 1 ? candidates[0].id : undefined, suggestedClientName: candidates.length === 1 ? candidates[0].name : undefined })
            else {
                const newCandidates = Array.from(newNames.values()).filter((entry) => legalKey(entry.name) === legalKey(contact.name))
                if (newCandidates.length) review.push({ contactId: contact.id, name: contact.name, suggestedClientName: newCandidates.length === 1 ? newCandidates[0].name : undefined })
                else newNames.set(key(contact.name), contact)
            }
        }
        if (newNames.size) {
            const { data: createdClients, error } = await admin.from("clients").insert(Array.from(newNames.values()).map((contact) => ({ name: contact.name, contact_email: contact.email || null, active: true }))).select("id,name,contact_email")
            if (error) throw error
            for (const client of createdClients || []) {
                byName.set(key(client.name), client)
                clients.push(client)
            }
        }
        for (const contact of review) {
            if (contact.suggestedClientName && !contact.suggestedClientId) contact.suggestedClientId = byName.get(key(contact.suggestedClientName))?.id
        }
        const reviewIds = new Set(review.map((contact) => contact.contactId))
        const newRows = unlinked.filter((contact) => !reviewIds.has(contact.id)).map((contact) => {
            const client = byName.get(key(contact.name))!
            const isPreferred = !preferred.has(client.id)
            if (isPreferred) preferred.add(client.id)
            return { xero_contact_id: contact.id, client_id: client.id, store_id: null, xero_name: contact.name, email: contact.email || null, preferred: isPreferred, updated_at: new Date().toISOString() }
        })
        const rows = [...contacts.filter((contact) => linked.has(contact.id)).map((contact) => {
            const link = byContactId.get(contact.id)!
            return { xero_contact_id: contact.id, client_id: link.client_id, store_id: link.store_id, xero_name: contact.name, email: contact.email || null, preferred: link.preferred, updated_at: new Date().toISOString() }
        }), ...newRows]
        for (let index = 0; index < rows.length; index += 200) {
            const { error } = await admin.from("xero_client_contacts").upsert(rows.slice(index, index + 200))
            if (error) throw error
        }
        // A newly synced McDonalds Xero contact may correspond to an existing
        // physical site under the old generic customer. Reuse that site only
        // when both names match uniquely and the contact has no other site.
        let sitesLinked = 0
        const genericCustomers = clients.filter((client) => /^mc\s*donald['’]?s?$/i.test(client.name.trim()))
        if (genericCustomers.length === 1) {
            const relevantClientIds = clients.filter((client) => /^mc\s*donald/i.test(client.name)).map((client) => client.id)
            const { data: sites, error: sitesError } = await admin.from("stores")
                .select("id,name,client_id").in("client_id", relevantClientIds)
            if (sitesError) throw sitesError
            const plans = unambiguousMcDonaldsSiteLinks(genericCustomers[0].id, clients, sites || [], rows)
            for (const plan of plans) {
                const { data: savedLink, error: linkError } = await admin.from("xero_client_contacts")
                    .update({ store_id: plan.siteId, updated_at: new Date().toISOString() })
                    .eq("xero_contact_id", plan.contactId).is("store_id", null).select("xero_contact_id")
                if (linkError) throw linkError
                if (!savedLink?.length) continue
                const { data: movedSite, error: moveError } = await admin.from("stores")
                    .update({ client_id: plan.customerId })
                    .eq("id", plan.siteId).eq("client_id", genericCustomers[0].id).select("id")
                if (moveError || !movedSite?.length) {
                    await admin.from("xero_client_contacts").update({ store_id: null })
                        .eq("xero_contact_id", plan.contactId).eq("store_id", plan.siteId)
                    if (moveError) throw moveError
                    continue
                }
                sitesLinked++
            }
        }
        return NextResponse.json({ created: newNames.size, matched: newRows.length - newNames.size, alreadyLinked: linked.size, sitesLinked, review })
    } catch (error) {
        return xeroErrorResponse(error) || NextResponse.json({ error: error instanceof Error ? error.message : "Could not sync Xero customers." }, { status: 500 })
    }
}
