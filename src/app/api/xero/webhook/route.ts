import { createHmac, timingSafeEqual } from "crypto"
import { after, NextRequest, NextResponse } from "next/server"
import { getValidXero, XERO_API, xeroHeaders } from "@/lib/xero"
import { syncOpenQuotesForInvoices, type XeroRow } from "@/lib/xero-job-sync"

export const dynamic = "force-dynamic"

type XeroWebhookEvent = {
  resourceId?: string
  resourceUrl?: string
  eventDateUtc?: string
  eventType?: string
  eventCategory?: string
  tenantId?: string
}

function validSignature(rawBody: string, supplied: string | null) {
  const key = process.env.XERO_WEBHOOK_KEY
  if (!key || !supplied) return false
  const expected = createHmac("sha256", key).update(rawBody).digest("base64")
  const a = Buffer.from(expected)
  const b = Buffer.from(supplied)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function xeroJson(url: string, accessToken: string, tenantId: string) {
  const response = await fetch(url, { headers: xeroHeaders(accessToken, tenantId), cache: "no-store" })
  const text = await response.text()
  const body = text ? JSON.parse(text) : {}
  if (!response.ok) throw new Error(body?.Message || body?.Detail || `Xero API error ${response.status}`)
  return body
}

async function processInvoiceEvents(invoiceEvents: XeroWebhookEvent[]) {
  try {
    const xero = await getValidXero()
    if (!xero) {
      console.error("Xero webhook background sync: Xero is not connected")
      return
    }

    const invoices: XeroRow[] = []
    for (const event of invoiceEvents) {
      if (event.tenantId && event.tenantId !== xero.tenantId) continue
      try {
        const invoiceResult = await xeroJson(`${XERO_API}/Invoices/${event.resourceId}`, xero.accessToken, xero.tenantId)
        const invoice = invoiceResult?.Invoices?.[0] as XeroRow | undefined
        if (!invoice || String(invoice.Type || "").toUpperCase() !== "ACCREC") continue
        invoices.push(invoice)
      } catch (error) {
        console.error("Xero webhook invoice lookup failed", event.resourceId, error)
      }
    }

    const results = await syncOpenQuotesForInvoices(invoices)
    const activated = results.filter((result) => result.ok && result.changedToJob)
    console.info("Xero webhook processed", {
      events: invoiceEvents.length,
      invoices: invoices.length,
      matched: results.length,
      activated: activated.length,
    })
  } catch (error) {
    console.error("Xero webhook background sync failed", error)
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get("x-xero-signature")

  if (!validSignature(rawBody, signature)) {
    return new NextResponse("Invalid Xero webhook signature", { status: 401 })
  }

  let payload: { events?: XeroWebhookEvent[] } = {}
  try {
    payload = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 })
  }

  const invoiceEvents = (payload.events || []).filter(
    (event) => String(event.eventCategory || "").toUpperCase() === "INVOICE" && event.resourceId
  )

  if (invoiceEvents.length) after(() => processInvoiceEvents(invoiceEvents))

  return NextResponse.json({ ok: true, accepted: invoiceEvents.length })
}
