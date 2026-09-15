import { NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { getValidXero, XERO_API, xeroHeaders } from "@/lib/xero"

export const dynamic = "force-dynamic"

export async function GET() {
    const server = await createServerClient()
    const { data: auth } = await server.auth.getUser()
    if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
    const xero = await getValidXero()
    if (!xero) return NextResponse.json({ error: "Xero is not connected." }, { status: 409 })
    const response = await fetch(`${XERO_API}/Contacts?where=${encodeURIComponent('ContactStatus=="ACTIVE"')}&order=Name`, {
        headers: xeroHeaders(xero.accessToken, xero.tenantId), cache: "no-store"
    })
    const body = await response.json()
    if (!response.ok) return NextResponse.json({ error: body?.Message || "Could not load Xero contacts." }, { status: response.status })
    const contacts = (body?.Contacts || []).map((c: any) => ({
        id: c.ContactID, name: c.Name, email: c.EmailAddress || "", firstName: c.FirstName || "", lastName: c.LastName || "",
        phones: c.Phones || [], addresses: c.Addresses || [], people: c.ContactPersons || []
    }))
    return NextResponse.json({ contacts })
}
