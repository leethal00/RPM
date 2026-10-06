import { createHmac, randomUUID, timingSafeEqual } from "crypto"
import { after, NextRequest, NextResponse } from "next/server"
import { getValidXero, xeroAdmin, XERO_API, xeroHeaders } from "@/lib/xero"
import { syncOpenQuotesForInvoices, type XeroRow } from "@/lib/xero-job-sync"
import { xeroFetch } from "@/lib/xero-requests"
import { XeroRateLimitError } from "@/lib/xero-rate-limit"

export const dynamic = "force-dynamic"

type XeroWebhookEvent = {
  resourceId?: string
  resourceUrl?: string
  eventDateUtc?: string
  eventType?: string
  eventCategory?: string
  tenantId?: string
  queueToken?: string
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
  const response = await xeroFetch(url, { headers: xeroHeaders(accessToken, tenantId), cache: "no-store" }, tenantId, "background")
  const text = await response.text()
  const body = text ? JSON.parse(text) : {}
  if (!response.ok) throw new Error(body?.Message || body?.Detail || `Xero API error ${response.status}`)
  return body
}

async function processInvoiceEvents() {
  try {
    const xero = await getValidXero()
    if (!xero) {
      console.error("Xero webhook background sync: Xero is not connected")
      return
    }

    const admin = xeroAdmin()
    const { data: pending, error: pendingError } = await admin.from("xero_api_cache").select("cache_key,payload,expires_at")
      .eq("tenant_id", xero.tenantId).like("cache_key", "pending-invoice:%").order("expires_at").limit(40)
    if (pendingError) throw pendingError
    const invoices: XeroRow[] = []
    const processed: NonNullable<typeof pending> = []
    for (const row of pending || []) {
      const event = row.payload as XeroWebhookEvent
      try {
        const invoiceResult = await xeroJson(`${XERO_API}/Invoices/${event.resourceId}`, xero.accessToken, xero.tenantId)
        const invoice = invoiceResult?.Invoices?.[0] as XeroRow | undefined
        if (!invoice) throw new Error("The notified Xero invoice is not yet available.")
        if (invoice && String(invoice.Type || "").toUpperCase() === "ACCREC") invoices.push(invoice)
        processed.push(row)
      } catch (error) {
        if (error instanceof XeroRateLimitError) throw error
        console.error("Xero webhook invoice lookup failed", event.resourceId, error)
      }
    }

    const results = await syncOpenQuotesForInvoices(invoices)
    const activated = results.filter((result) => result.ok && result.changedToJob)
    for (const result of results.filter((result) => !result.ok)) {
      console.error("Xero webhook linkback failed", result.jobId, result.error)
    }
    if (results.every((result) => result.ok)) {
      for (const row of processed) {
        // A newer notification for this invoice must survive an older worker.
        const { error } = await admin.from("xero_api_cache").delete().eq("tenant_id", xero.tenantId)
          .eq("cache_key", row.cache_key).eq("payload->>queueToken", (row.payload as XeroWebhookEvent).queueToken)
        if (error) throw error
      }
    }
    console.info("Xero webhook processed", {
      events: pending?.length || 0,
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

  if (invoiceEvents.length) {
    const xero = await getValidXero()
    if (!xero) return NextResponse.json({ error: "Xero is not connected" }, { status: 503 })
    const events = [...new Map(invoiceEvents.filter((event) => !event.tenantId || event.tenantId === xero.tenantId)
      .map((event) => [event.resourceId, event])).values()]
    if (events.length) {
      const { error } = await xeroAdmin().from("xero_api_cache").upsert(events.map((event) => ({
        tenant_id: xero.tenantId, cache_key: `pending-invoice:${event.resourceId}`, payload: { ...event, queueToken: randomUUID() },
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })))
      if (error) return NextResponse.json({ error: "Could not queue Xero notifications." }, { status: 503 })
      after(() => processInvoiceEvents())
    }
  }

  return NextResponse.json({ ok: true, accepted: invoiceEvents.length })
}
