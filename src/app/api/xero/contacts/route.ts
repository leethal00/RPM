import { NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { getValidXero, XERO_API, xeroHeaders } from "@/lib/xero"
import { xeroFetch } from "@/lib/xero-requests"
import { xeroErrorResponse } from "@/lib/xero-error-response"

export const dynamic = "force-dynamic"

export async function GET() {
    const server = await createServerClient()
    const { data: auth } = await server.auth.getUser()
    if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
    const xero = await getValidXero()
    if (!xero) return NextResponse.json({ error: "Xero is not connected." }, { status: 409 })
    try {
    const response = await xeroFetch(`${XERO_API}/Contacts?where=${encodeURIComponent('ContactStatus=="ACTIVE"')}&order=Name`, {
        headers: xeroHeaders(xero.accessToken, xero.tenantId), cache: "no-store"
    }, xero.tenantId, "contacts")
    const body = await response.json()
    if (!response.ok) return NextResponse.json({ error: body?.Message || "Could not load Xero contacts." }, { status: response.status })
    const contacts = (body?.Contacts || []).map((c: { ContactID: string; Name: string; EmailAddress?: string; FirstName?: string; LastName?: string; Phones?: unknown[]; Addresses?: unknown[]; ContactPersons?: unknown[] }) => ({
        id: c.ContactID, name: c.Name, email: c.EmailAddress || "", firstName: c.FirstName || "", lastName: c.LastName || "",
        phones: c.Phones || [], addresses: c.Addresses || [], people: c.ContactPersons || []
    }))
    return NextResponse.json({ contacts })
    } catch (error) {
        return xeroErrorResponse(error) || NextResponse.json({ error: error instanceof Error ? error.message : "Could not load Xero contacts." }, { status: 500 })
    }
}
