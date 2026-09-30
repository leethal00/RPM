import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type InviteRequest = { email?: unknown; name?: unknown; jobIds?: unknown }

export async function POST(request: NextRequest) {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Authentication is unavailable' }, { status: 503 })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Sign in to continue' }, { status: 401 })

    const { data: actor, error: roleError } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (roleError || !['super_admin', 'rodier_admin'].includes(actor?.role ?? '')) {
        return NextResponse.json({ error: 'Only administrators can invite subcontractors' }, { status: 403 })
    }

    if (request.headers.get('origin') !== request.nextUrl.origin) {
        return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
    }

    let body: InviteRequest
    try {
        body = await request.json() as InviteRequest
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const rawJobIds = Array.isArray(body.jobIds) ? body.jobIds : null
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        || !name || name.length > 120 || !rawJobIds || rawJobIds.length > 100
        || rawJobIds.some(id => typeof id !== 'string' || !uuid.test(id))) {
        return NextResponse.json({ error: 'Enter a valid name, email and job selection' }, { status: 400 })
    }
    const jobIds = [...new Set(rawJobIds as string[])]

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
        return NextResponse.json({ error: 'Invitations are not configured' }, { status: 503 })
    }
    const admin = createSupabaseClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    if (jobIds.length) {
        const { data: jobs, error } = await admin.from('costing_jobs').select('id')
            .in('id', jobIds).eq('is_template', false)
            .in('status', ['approved', 'in_progress', 'complete'])
        if (error || jobs?.length !== jobIds.length) {
            return NextResponse.json({ error: 'Select available jobs for this subcontractor' }, { status: 400 })
        }
    }

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { name },
        redirectTo: `${request.nextUrl.origin}/reset-password`,
    })
    if (inviteError || !invited.user) {
        return NextResponse.json({ error: inviteError?.message ?? 'Invitation failed' }, { status: 502 })
    }

    const userId = invited.user.id
    const { error: profileError } = await admin.from('users').insert({
        id: userId, email, name, role: 'installer', is_subcontractor: true,
        installer_all_jobs: false, client_id: null,
    })
    const { error: assignmentError } = profileError || !jobIds.length
        ? { error: null }
        : await admin.from('installer_jobs').insert(jobIds.map(job_id => ({ job_id, user_id: userId })))

    if (profileError || assignmentError) {
        await admin.from('users').delete().eq('id', userId)
        await admin.auth.admin.deleteUser(userId)
        return NextResponse.json({ error: 'Invitation could not be completed. Please try again.' }, { status: 502 })
    }

    return NextResponse.json({ id: userId, message: `Invitation sent to ${email}` })
}
