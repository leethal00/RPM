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
    return admin
}

export async function GET() {
    const admin = await staffAdmin()
    if (!admin) return NextResponse.json({ error: "Only Rodier administrators can match sites." }, { status: 403 })

    const { data: customers, error: customersError } = await admin.from("clients")
        .select("id,name").ilike("name", "%donald%")
    if (customersError) return NextResponse.json({ error: "Could not load customers." }, { status: 500 })
    const generic = (customers || []).filter((customer) =>
        customer.name.toLocaleLowerCase("en-NZ").replace(/[^a-z]/g, "") === "mcdonalds")
    if (generic.length !== 1) return NextResponse.json({ error: "The generic McDonalds customer could not be identified uniquely." }, { status: 409 })

    const ids = (customers || []).map((customer) => customer.id)
    const [sitesResult, ownedResult, linksResult] = await Promise.all([
        admin.from("stores").select("id,name,address").eq("client_id", generic[0].id).order("name"),
        admin.from("stores").select("client_id").in("client_id", ids),
        admin.from("xero_client_contacts").select("client_id,store_id,xero_name").in("client_id", ids),
    ])
    if (sitesResult.error || ownedResult.error || linksResult.error) {
        return NextResponse.json({ error: "Could not load site matches." }, { status: 500 })
    }
    const owned = new Set((ownedResult.data || []).map((site) => site.client_id))
    const linksByCustomer = new Map<string, typeof linksResult.data>()
    for (const link of linksResult.data || []) {
        linksByCustomer.set(link.client_id, [...(linksByCustomer.get(link.client_id) || []), link])
    }
    const availableCustomers = (customers || []).filter((customer) => {
        const links = linksByCustomer.get(customer.id) || []
        return customer.id !== generic[0].id && /^mc\s*donald/i.test(customer.name) &&
            !owned.has(customer.id) && links.length === 1 && links[0].store_id === null
    }).map((customer) => ({
        id: customer.id,
        name: customer.name,
        xeroName: linksByCustomer.get(customer.id)![0].xero_name,
    })).sort((a, b) => a.name.localeCompare(b.name, "en-NZ"))

    return NextResponse.json({ sites: sitesResult.data || [], customers: availableCustomers })
}

export async function POST(request: Request) {
    const admin = await staffAdmin()
    if (!admin) return NextResponse.json({ error: "Only Rodier administrators can match sites." }, { status: 403 })
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
