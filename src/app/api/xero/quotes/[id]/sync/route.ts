import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { xeroAdmin } from "@/lib/xero"
import { syncLinkedQuoteToJob } from "@/lib/xero-job-sync"

export const dynamic = "force-dynamic"

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const server = await createServerClient()
  const { data: auth } = await server.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const { id } = await context.params
  const admin = xeroAdmin()
  const { data: job, error } = await admin
    .from("costing_jobs")
    .select("id,title,status,xero_quote_id,xero_quote_number,xero_invoice_number,job_number")
    .eq("id", id)
    .single()

  if (error || !job) return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  if (!job.xero_quote_id) return NextResponse.json({ error: "This quote has not been sent to Xero yet." }, { status: 400 })

  const result = await syncLinkedQuoteToJob(job)
  if (!result.ok) return NextResponse.json({ error: result.error || "Could not sync Xero status." }, { status: 500 })

  return NextResponse.json({
    ok: true,
    xeroStatus: result.xeroStatus,
    invoiceNumber: result.invoiceNumber || null,
    jobNumber: result.invoiceNumber || job.job_number || null,
    changedToJob: !!result.changedToJob,
  })
}
