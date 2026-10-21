import { NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { xeroAdmin } from "@/lib/xero"
import { isStaffAdmin } from "@/lib/permissions"

export const dynamic = "force-dynamic"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function staffAdmin() {
    const server = await createServerClient()
    const { data: auth } = await server.auth.getUser()
    if (!auth.user) return null
    const admin = xeroAdmin()
    const { data: profile, error } = await admin.from("users").select("role").eq("id", auth.user.id).single()
    if (error || !isStaffAdmin(profile?.role)) return null
    return { admin, userId: auth.user.id }
}

export async function POST(request: Request) {
    const staff = await staffAdmin()
    if (!staff) return NextResponse.json({ error: "Only Rodier administrators can create sites." }, { status: 403 })
    const body = await request.json().catch(() => ({})) as { clientId?: string; siteName?: string; address?: string }
    if (!uuid.test(body.clientId || "") || typeof body.siteName !== "string" ||
        body.siteName.trim().length < 2 || body.siteName.trim().length > 200 ||
        typeof body.address !== "string" || body.address.trim().length < 5 || body.address.trim().length > 500) {
        return NextResponse.json({ error: "Enter a site name and full address." }, { status: 400 })
    }
    const { data: siteId, error } = await staff.admin.rpc("create_mcdonalds_site_for_xero_customer", {
        p_client_id: body.clientId, p_site_name: body.siteName.trim(), p_address: body.address.trim(),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 409 })
    return NextResponse.json({ siteId })
}

export async function PATCH(request: Request) {
    const staff = await staffAdmin()
    if (!staff) return NextResponse.json({ error: "Only Rodier administrators can skip Xero contacts." }, { status: 403 })
    const body = await request.json().catch(() => ({})) as { clientId?: string; skipped?: boolean }
    if (!uuid.test(body.clientId || "") || typeof body.skipped !== "boolean") {
        return NextResponse.json({ error: "Choose a Xero customer." }, { status: 400 })
    }
    const { data: client, error: clientError } = await staff.admin.from("clients")
        .select("name").eq("id", body.clientId!).single()
    if (clientError || !client || !/^mc\s*donald/i.test(client.name) ||
        client.name.toLowerCase().replace(/[^a-z]/g, "") === "mcdonalds") {
        return NextResponse.json({ error: "Choose a McDonalds site-specific Xero customer." }, { status: 400 })
    }
    const [sitesResult, contactsResult] = await Promise.all([
        staff.admin.from("stores").select("id").eq("client_id", body.clientId!).limit(1),
        staff.admin.from("xero_client_contacts").select("xero_contact_id").eq("client_id", body.clientId!).limit(1),
    ])
    if (sitesResult.error || contactsResult.error || !contactsResult.data?.length || sitesResult.data?.length) {
        return NextResponse.json({ error: "This Xero customer already has a site or is unavailable." }, { status: 409 })
    }
    const result = body.skipped
        ? await staff.admin.from("mcdonalds_xero_site_skips").upsert({
            client_id: body.clientId!, skipped_by: staff.userId, skipped_at: new Date().toISOString(),
        }, { onConflict: "client_id" })
        : await staff.admin.from("mcdonalds_xero_site_skips").delete().eq("client_id", body.clientId!)
    if (result.error) return NextResponse.json({ error: "Could not save this choice." }, { status: 500 })
    return NextResponse.json({ ok: true })
}
