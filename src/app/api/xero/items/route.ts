import { NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { getValidXero, XERO_API, xeroHeaders } from "@/lib/xero"

export const dynamic = "force-dynamic"

type XeroItem = {
    ItemID?: string
    Code?: string
    Name?: string
    Description?: string
    PurchaseDescription?: string
    IsSold?: boolean
    IsPurchased?: boolean
    SalesDetails?: { UnitPrice?: number }
    PurchaseDetails?: { UnitPrice?: number }
}

export async function GET() {
    const server = await createServerClient()
    const { data: auth } = await server.auth.getUser()
    if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const xero = await getValidXero()
    if (!xero) return NextResponse.json({ error: "Xero is not connected." }, { status: 409 })

    try {
        const response = await fetch(`${XERO_API}/Items`, {
            headers: xeroHeaders(xero.accessToken, xero.tenantId),
            cache: "no-store",
        })
        const text = await response.text()
        const body = text ? JSON.parse(text) : {}

        if (!response.ok) {
            const insufficient = response.status === 401 || response.status === 403
            return NextResponse.json({
                error: insufficient
                    ? "Xero item access needs permission. Reconnect Xero to grant accounting settings access."
                    : body?.Message || body?.Detail || `Xero API error ${response.status}`,
                needsReconnect: insufficient,
            }, { status: response.status })
        }

        const items = ((body?.Items || []) as XeroItem[])
            .filter((item) => item.IsSold !== false)
            .map((item) => ({
                id: item.ItemID || item.Code || item.Name || "",
                code: item.Code || "",
                name: item.Name || item.Code || "Unnamed Xero item",
                description: item.Description || item.PurchaseDescription || "",
                sell: Number(item.SalesDetails?.UnitPrice || 0),
                cost: Number(item.PurchaseDetails?.UnitPrice || 0),
            }))
            .sort((a, b) => a.name.localeCompare(b.name))

        return NextResponse.json({ items })
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load Xero items." }, { status: 500 })
    }
}
