import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const server = await createClient()
  const { data: auth } = await server.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const { data: profile, error: roleError } = await server.from("users").select("role").eq("id", auth.user.id).single()
  if (roleError || !profile || !["super_admin", "rodier_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Only Rodier admins can cancel jobs." }, { status: 403 })
  }
  const body = await req.json().catch(() => null)
  if (!body || body.confirmed !== true || (body.reason != null && typeof body.reason !== "string") || (body.reason?.length ?? 0) > 2000) {
    return NextResponse.json({ error: "Confirm cancellation and use a reason of at most 2000 characters." }, { status: 400 })
  }
  const { id } = await context.params
  // Use the signed-in client so RLS and the database cancellation guard apply.
  // No Xero calls and no child records are changed or deleted.
  const { data: job, error } = await server.from("costing_jobs")
    .update({ status: "cancelled", cancellation_reason: body.reason?.trim() || null })
    .eq("id", id).eq("status", "in_progress").eq("is_template", false)
    .select("id,status,cancelled_at,cancelled_by,cancellation_reason").maybeSingle()
  if (error) return NextResponse.json({ error: "Could not cancel the job. Refresh and try again." }, { status: 500 })
  if (!job) return NextResponse.json({ error: "The job is no longer active or is unavailable. Refresh before trying again." }, { status: 409 })
  return NextResponse.json({ job, xeroUntouched: true })
}
