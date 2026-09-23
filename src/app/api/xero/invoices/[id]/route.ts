import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { isStaffAdmin } from "@/lib/permissions"
import { getValidXero, xeroAdmin, XERO_API, xeroHeaders } from "@/lib/xero"
import { buildXeroInvoiceLines, type InvoiceCostLine, type InvoiceItem } from "@/lib/xero-invoice-lines"
import { siteDisplayName } from "@/lib/site-name"

export const dynamic = "force-dynamic"

type XeroInvoice = {
  InvoiceID?: string
  InvoiceNumber?: string
  Type?: string
  Status?: string
  UpdatedDateUTC?: string
  Total?: number
  Contact?: { Name?: string; ContactID?: string }
  LineItems?: Array<{ Description?: string; Quantity?: number; UnitAmount?: number; LineAmount?: number }>
  ValidationErrors?: Array<{ Message?: string }>
  HasErrors?: boolean
}

async function xeroJson(url: string, token: string, tenant: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { ...xeroHeaders(token, tenant), ...(init?.headers || {}) },
    cache: "no-store",
  })
  const text = await response.text()
  const body = text ? JSON.parse(text) : {}
  if (!response.ok) {
    const validation = body?.Elements?.[0]?.ValidationErrors?.map((row: { Message?: string }) => row.Message).filter(Boolean).join("; ")
    throw new Error(validation || body?.Message || body?.Detail || "Xero API error " + response.status)
  }
  return body
}

async function getInvoice(identifier: string, token: string, tenant: string): Promise<XeroInvoice | null> {
  const result = await xeroJson(XERO_API + "/Invoices/" + encodeURIComponent(identifier), token, tenant)
  return (result?.Invoices?.[0] || null) as XeroInvoice | null
}

function validateDraft(invoice: XeroInvoice | null) {
  if (!invoice?.InvoiceID || !invoice.InvoiceNumber) throw new Error("Invoice not found in Xero.")
  if (invoice.Type !== "ACCREC") throw new Error("Only Xero sales invoices can be linked.")
  if (invoice.Status !== "DRAFT") throw new Error("This invoice is " + (invoice.Status || "not draft") + ". Only draft invoices can be updated from RPM.")
}

function summary(invoice: XeroInvoice) {
  return {
    invoiceId: invoice.InvoiceID,
    invoiceNumber: invoice.InvoiceNumber,
    status: invoice.Status,
    contactName: invoice.Contact?.Name || "",
    total: Number(invoice.Total || 0),
    updatedAt: invoice.UpdatedDateUTC || "",
    lines: (invoice.LineItems || []).map((line) => ({
      description: line.Description || "",
      quantity: line.Quantity ?? null,
      unitAmount: line.UnitAmount ?? null,
      lineAmount: line.LineAmount ?? null,
    })),
  }
}

async function access() {
  const server = await createServerClient()
  const { data: auth } = await server.auth.getUser()
  if (!auth.user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) }
  const admin = xeroAdmin()
  const { data: profile, error: profileError } = await admin.from("users").select("role").eq("id", auth.user.id).single()
  if (profileError || !isStaffAdmin(profile?.role)) {
    return { error: NextResponse.json({ error: "Only Rodier administrators can manage Xero invoices." }, { status: 403 }) }
  }
  const xero = await getValidXero()
  if (!xero) return { error: NextResponse.json({ error: "Xero is not connected." }, { status: 409 }) }
  return { admin, xero }
}

async function jobAndLines(admin: ReturnType<typeof xeroAdmin>, id: string, includeLines = true) {
  const [{ data: job, error: jobError }, { data: items, error: itemsError }, { data: costs, error: costsError }] = await Promise.all([
    admin.from("costing_jobs").select("id,title,reference,details,contact_name,status,is_template,job_number,xero_invoice_id,xero_invoice_number,clients(name),stores(name)").eq("id", id).single(),
    admin.from("costing_items").select("id,name,size,details,delivery,sign_code,mode,qty,build_qty,unit_price,sort").eq("job_id", id).order("sort"),
    admin.from("costing_lines").select("item_id,qty,unit_cost,markup,unit_sell_override").eq("job_id", id),
  ])
  if (jobError || !job) throw new Error("RPM job not found.")
  if (job.is_template) throw new Error("Product templates cannot be linked to Xero invoices.")
  if (itemsError) throw itemsError
  if (costsError) throw costsError
  const client = Array.isArray(job.clients) ? job.clients[0] : job.clients
  const store = Array.isArray(job.stores) ? job.stores[0] : job.stores
  const site = [client?.name, store?.name ? siteDisplayName(store.name, client?.name || "") : null].filter(Boolean).join(" ")
  const intro = [site ? site + ":" : null, job.details?.trim() || job.reference?.trim() || job.title.trim(), job.contact_name?.trim() ? "Contact: " + job.contact_name.trim() : null].filter(Boolean).join("\n")
  const proposedLines = includeLines
    ? buildXeroInvoiceLines((items || []) as InvoiceItem[], (costs || []) as InvoiceCostLine[], intro)
    : []
  return { job, proposedLines }
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const granted = await access()
    if (granted.error) return granted.error
    const { admin, xero } = granted
    if (!admin || !xero) throw new Error("Xero access unavailable.")
    const { id } = await context.params
    const number = req.nextUrl.searchParams.get("number")?.trim()
    const { job, proposedLines } = await jobAndLines(admin, id, !number)
    const identifier = number || job.xero_invoice_id
    if (!identifier) return NextResponse.json({ error: "Enter an invoice number." }, { status: 400 })
    const invoice = await getInvoice(identifier, xero.accessToken, xero.tenantId)
    validateDraft(invoice)
    if (number && invoice?.InvoiceNumber !== number) return NextResponse.json({ error: "The Xero invoice number did not match." }, { status: 409 })
    if (!number && invoice?.InvoiceNumber !== job.xero_invoice_number) return NextResponse.json({ error: "The linked invoice number changed in Xero. No update was made." }, { status: 409 })
    return NextResponse.json({ invoice: summary(invoice!), proposedLines })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not preview invoice." }, { status: 400 })
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const granted = await access()
    if (granted.error) return granted.error
    const { admin, xero } = granted
    if (!admin || !xero) throw new Error("Xero access unavailable.")
    const { id } = await context.params
    const body = await req.json().catch(() => ({})) as { action?: string; invoiceNumber?: string; expectedUpdatedAt?: string }
    const { job, proposedLines } = await jobAndLines(admin, id, body.action !== "link")

    if (body.action === "link") {
      const number = String(body.invoiceNumber || "").trim()
      if (!number) return NextResponse.json({ error: "Enter an invoice number." }, { status: 400 })
      if (job.xero_invoice_id || (job.xero_invoice_number && job.xero_invoice_number !== number)) {
        return NextResponse.json({ error: "This job is already linked to a Xero invoice." }, { status: 409 })
      }
      const invoice = await getInvoice(number, xero.accessToken, xero.tenantId)
      validateDraft(invoice)
      if (invoice?.InvoiceNumber !== number) return NextResponse.json({ error: "The Xero invoice number did not match." }, { status: 409 })
      const { data: claimed } = await admin.from("costing_jobs").select("id").eq("xero_invoice_number", number).neq("id", id).limit(1)
      if (claimed?.length) return NextResponse.json({ error: "That invoice is already used by another RPM job." }, { status: 409 })
      const { data: linkedJob, error: saveError } = await admin.from("costing_jobs").update({
        xero_invoice_id: invoice!.InvoiceID,
        xero_invoice_number: number,
        job_number: number,
        updated_at: new Date().toISOString(),
      }).eq("id", id).is("xero_invoice_id", null).select("id").maybeSingle()
      if (saveError) throw saveError
      if (!linkedJob) return NextResponse.json({ error: "This job was linked by someone else. Refresh it before continuing." }, { status: 409 })
      return NextResponse.json({ ok: true, invoice: summary(invoice!) })
    }

    if (body.action === "push") {
      if (!job.xero_invoice_id || !job.xero_invoice_number) return NextResponse.json({ error: "Link a Xero invoice first." }, { status: 409 })
      if (!body.expectedUpdatedAt) return NextResponse.json({ error: "Preview the invoice before pushing changes." }, { status: 400 })
      if (!proposedLines.some((line) => line.Quantity != null)) return NextResponse.json({ error: "Add at least one selling item before pushing to Xero." }, { status: 400 })
      const before = await getInvoice(job.xero_invoice_id, xero.accessToken, xero.tenantId)
      validateDraft(before)
      if (before?.InvoiceNumber !== job.xero_invoice_number) return NextResponse.json({ error: "The invoice number changed in Xero. No update was made." }, { status: 409 })
      if (before?.UpdatedDateUTC !== body.expectedUpdatedAt) return NextResponse.json({ error: "The invoice changed in Xero since the preview. Refresh and review it again." }, { status: 409 })

      // Deliberately replace draft line items. No InvoiceNumber, Contact, dates or status are sent.
      const result = await xeroJson(XERO_API + "/Invoices", xero.accessToken, xero.tenantId, {
        method: "POST",
        body: JSON.stringify({ Invoices: [{ InvoiceID: job.xero_invoice_id, LineItems: proposedLines }] }),
      })
      const returned = result?.Invoices?.[0] as XeroInvoice | undefined
      const validation = returned?.ValidationErrors?.map((row) => row.Message).filter(Boolean).join("; ")
      if (returned?.HasErrors || validation) throw new Error(validation || "Xero rejected the invoice update.")
      const after = await getInvoice(job.xero_invoice_id, xero.accessToken, xero.tenantId)
      if (!after || after.InvoiceID !== job.xero_invoice_id || after.InvoiceNumber !== job.xero_invoice_number) {
        throw new Error("Xero returned an unexpected invoice identity. Check the invoice in Xero before retrying.")
      }
      const { error: saveError } = await admin.from("costing_jobs").update({ xero_invoice_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id)
      if (saveError) throw saveError
      return NextResponse.json({ ok: true, invoice: summary(after) })
    }

    return NextResponse.json({ error: "Unknown invoice action." }, { status: 400 })
  } catch (error) {
    console.error("RPM Xero invoice action", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update the Xero invoice." }, { status: 400 })
  }
}
