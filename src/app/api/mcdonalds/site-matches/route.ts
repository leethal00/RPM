import { NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { xeroAdmin } from "@/lib/xero"
import { isStaffAdmin } from "@/lib/permissions"

export const dynamic = "force-dynamic"

async function staffAdmin() {
    const server = await createServerClient()
    const { data: auth } = await server.auth.getUser()
    if (!auth.user) return null
    const admin = xeroAdmin()
    const { data: profile, error } = await admin.from("users").select("role").eq("id", auth.user.id).single()
    if (error || !isStaffAdmin(profile?.role)) return null
    return { admin, userId: auth.user.id }
}

export async function GET() {
    const staff = await staffAdmin()
    if (!staff) return NextResponse.json({ error: "Only Rodier administrators can review sites." }, { status: 403 })
    const { admin } = staff

    const { data: customers, error: customersError } = await admin.from("clients")
        .select("id,name").ilike("name", "%donald%")
    if (customersError) return NextResponse.json({ error: "Could not load customers." }, { status: 500 })
    const ids = (customers || []).map((customer) => customer.id)
    const [ownedResult, linksResult, reviewsResult, skipsResult] = await Promise.all([
        admin.from("stores").select("id,name,address,client_id,updated_at").in("client_id", ids).order("name"),
        admin.from("xero_client_contacts").select("client_id,store_id,xero_name").in("client_id", ids),
        admin.from("mcdonalds_site_reviews").select("site_id,review_status,note,updated_at"),
        admin.from("mcdonalds_xero_site_skips").select("client_id"),
    ])
    if (ownedResult.error || linksResult.error || reviewsResult.error || skipsResult.error) {
        return NextResponse.json({ error: "Could not load site matches." }, { status: 500 })
    }
    const genericCandidates = (customers || []).filter((customer) =>
        customer.name.toLocaleLowerCase("en-NZ").replace(/[^a-z]/g, "") === "mcdonalds")
    const genericWithSites = genericCandidates.filter((customer) =>
        (ownedResult.data || []).some((site) => site.client_id === customer.id))
    const originalGeneric = genericCandidates.filter((customer) => customer.name === "Mcdonalds")
    if (genericWithSites.length > 1 || (genericWithSites.length === 0 && originalGeneric.length !== 1)) {
        return NextResponse.json({ error: "The RPM McDonalds group customer could not be identified uniquely." }, { status: 409 })
    }
    const generic = genericWithSites[0] || originalGeneric[0]
    const owned = new Set((ownedResult.data || []).map((site) => site.client_id))
    const skipped = new Set((skipsResult.data || []).map((decision) => decision.client_id))
    const ownedSiteNames = new Map((ownedResult.data || []).map((site) => [site.client_id, site.name]))
    const customerNames = new Map((customers || []).map((customer) => [customer.id, customer.name]))
    const reviews = new Map((reviewsResult.data || []).map((review) => [review.site_id, review]))
    const linksByCustomer = new Map<string, typeof linksResult.data>()
    for (const link of linksResult.data || []) {
        linksByCustomer.set(link.client_id, [...(linksByCustomer.get(link.client_id) || []), link])
    }
    const xeroCustomers = (customers || []).filter((customer) =>
        customer.id !== generic.id && /^mc\s*donald/i.test(customer.name) &&
        customer.name.toLocaleLowerCase("en-NZ").replace(/[^a-z]/g, "") !== "mcdonalds" &&
        (linksByCustomer.get(customer.id) || []).length > 0
    ).map((customer) => {
        const links = linksByCustomer.get(customer.id) || []
        return {
            id: customer.id,
            name: customer.name,
            xeroName: links.map((link) => link.xero_name).join("; "),
            linkedSiteName: ownedSiteNames.get(customer.id) || null,
            skipped: skipped.has(customer.id),
            available: !owned.has(customer.id) && !skipped.has(customer.id) && links.length === 1 && links[0].store_id === null,
        }
    }).sort((a, b) => a.name.localeCompare(b.name, "en-NZ"))

    const sites = (ownedResult.data || []).map((site) => ({
        id: site.id,
        name: site.name,
        address: site.address,
        customerId: site.client_id,
        customerName: customerNames.get(site.client_id) || "Unknown customer",
        needsMatch: site.client_id === generic.id,
        xeroNames: (linksByCustomer.get(site.client_id) || [])
            .filter((link) => link.store_id === site.id || (link.store_id === null && site.client_id !== generic.id))
            .map((link) => link.xero_name),
        reviewStatus: reviews.get(site.id) && new Date(reviews.get(site.id)!.updated_at).getTime() >= new Date(site.updated_at).getTime()
            ? reviews.get(site.id)!.review_status : "pending",
        reviewNote: reviews.get(site.id)?.note || "",
    }))

    return NextResponse.json({ sites, customers: xeroCustomers })
}

export async function POST(request: Request) {
    const staff = await staffAdmin()
    if (!staff) return NextResponse.json({ error: "Only Rodier administrators can match sites." }, { status: 403 })
    const { admin } = staff
    const body = await request.json().catch(() => ({})) as { siteId?: string; customerId?: string }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuid.test(body.siteId || "") || !uuid.test(body.customerId || "")) {
        return NextResponse.json({ error: "Choose a site and customer." }, { status: 400 })
    }
    const { error } = await admin.rpc("assign_mcdonalds_site_customer", {
        p_site_id: body.siteId,
        p_client_id: body.customerId,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 409 })
    return NextResponse.json({ ok: true })
}

export async function PATCH(request: Request) {
    const staff = await staffAdmin()
    if (!staff) return NextResponse.json({ error: "Only Rodier administrators can review sites." }, { status: 403 })
    const { admin, userId } = staff
    const body = await request.json().catch(() => ({})) as {
        siteId?: string; reviewStatus?: string; note?: string
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuid.test(body.siteId || "") || !["pending", "verified", "xero_issue", "skipped"].includes(body.reviewStatus || "") ||
        typeof body.note !== "string" || body.note.length > 1000 ||
        (body.reviewStatus === "xero_issue" && !body.note.trim())) {
        return NextResponse.json({ error: "Choose a review status and add a note for Xero issues." }, { status: 400 })
    }
    const { data: site, error: siteError } = await admin.from("stores")
        .select("client_id").eq("id", body.siteId!).single()
    if (siteError || !site) {
        return NextResponse.json({ error: "Site not found." }, { status: 404 })
    }
    const { data: customer, error: customerError } = await admin.from("clients")
        .select("name").eq("id", site.client_id).single()
    if (customerError || !customer || !/donald/i.test(customer.name)) {
        return NextResponse.json({ error: "This is not a McDonalds site." }, { status: 400 })
    }
    if (body.reviewStatus === "verified") {
        if (customer.name.toLowerCase().replace(/[^a-z]/g, "") === "mcdonalds") {
            return NextResponse.json({ error: "Select this site's Xero customer before confirming." }, { status: 409 })
        }
        const { data: links, error: linksError } = await admin.from("xero_client_contacts")
            .select("client_id").eq("client_id", site.client_id).limit(1)
        if (linksError || !links?.length) {
            return NextResponse.json({ error: "This customer has no linked Xero contact to confirm." }, { status: 409 })
        }
    }
    const { error } = await admin.from("mcdonalds_site_reviews").upsert({
        site_id: body.siteId!, review_status: body.reviewStatus!, note: body.note.trim(),
        updated_by: userId, updated_at: new Date().toISOString(),
    }, { onConflict: "site_id" })
    if (error) return NextResponse.json({ error: "Could not save the review." }, { status: 500 })
    return NextResponse.json({ ok: true })
}
