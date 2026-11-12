import { NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { xeroAdmin } from "@/lib/xero"
import { isStaffAdmin } from "@/lib/permissions"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const server = await createServerClient()
  const { data: auth } = await server.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const clientId = new URL(request.url).searchParams.get("clientId") || ""
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
    return NextResponse.json({ error: "Choose a customer" }, { status: 400 })
  }

  const admin = xeroAdmin()
  const { data: profile, error: profileError } = await admin.from("users").select("role").eq("id", auth.user.id).single()
  if (profileError) return NextResponse.json({ error: "Could not check access" }, { status: 500 })
  if (!isStaffAdmin(profile?.role)) return NextResponse.json({ error: "Not authorised" }, { status: 403 })

  try {
    // Operational site links are independent of Xero billing contacts. All
    // staff customer filters (map, site list and quote form) use this endpoint.
    const sources = await Promise.all(["xero_client_contacts", "customer_site_links"].map(async (table) => {
      const siteIds: string[] = []
      for (let from = 0; ; from += 500) {
        const { data, error } = await admin.from(table).select("store_id")
          .eq("client_id", clientId).not("store_id", "is", null)
          .order("store_id").range(from, from + 499)
        if (error) throw error
        siteIds.push(...(data || []).map((row) => row.store_id))
        if ((data || []).length < 500) return siteIds
      }
    }))
    return NextResponse.json({ siteIds: Array.from(new Set(sources.flat())) })
  } catch {
    return NextResponse.json({ error: "Could not load linked sites" }, { status: 500 })
  }
}
