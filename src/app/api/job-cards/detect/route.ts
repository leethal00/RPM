import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readScanQr } from '@/lib/scan-qr.server'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const sb = await createClient()
  if (!sb) return NextResponse.json({ error: 'RPM connection is not configured' }, { status: 503 })
  const { data: auth } = await sb.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const { data: actor } = await sb.from('users').select('role').eq('id', auth.user.id).single()
  if (!['super_admin', 'rodier_admin'].includes(actor?.role || '')) return NextResponse.json({ error: 'Only RPM administrators can review scanned cards' }, { status: 403 })
  try {
    const { scanId } = await request.json()
    if (typeof scanId !== 'string' || !/^[0-9a-f-]{36}$/i.test(scanId)) return NextResponse.json({ error: 'Invalid scan' }, { status: 400 })
    const { data: scan, error } = await sb.from('job_card_scans').select('id,storage_path,mime_type,status,job_id,confirmed_at').eq('id', scanId).single()
    if (error || !scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
    if (scan.confirmed_at || ['processed', 'deleted'].includes(scan.status)) return NextResponse.json({ error: 'This card has already been confirmed or deleted' }, { status: 409 })
    if (!scan.storage_path) return NextResponse.json({ error: 'Attach the original card first' }, { status: 400 })
    const file = await sb.storage.from('job-card-scans').download(scan.storage_path)
    if (file.error || !file.data) throw new Error('Could not read the original scan. Try again.')
    if (file.data.size > 20 * 1024 * 1024) throw new Error('This scan is larger than 20 MB. Select the job manually.')
    const id = await readScanQr(new Uint8Array(await file.data.arrayBuffer()), scan.mime_type || file.data.type)
    if (!id) return NextResponse.json({ matched: false, message: 'No readable RPM QR code found. Select the job manually.' })
    const job = await sb.from('costing_jobs').select('id,job_number,title,production_title').eq('id', id).eq('is_template', false).maybeSingle()
    if (job.error) throw job.error
    if (!job.data) return NextResponse.json({ matched: false, message: 'The QR code refers to a job that is not available in RPM. Select the job manually.' })
    const saved = await sb.rpc('match_scanned_job_card', { p_scan_id: scan.id, p_job_id: id, p_storage_path: scan.storage_path })
    if (saved.error) throw saved.error
    return NextResponse.json({ matched: true, job: job.data, saved: saved.data === true })
  } catch (cause) {
    const message = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Could not read QR code. Try again or select the job manually.'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
