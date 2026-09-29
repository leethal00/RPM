import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validatePassword } from '@/lib/password-policy'

export const dynamic = 'force-dynamic'

type PasswordRequest = { action?: unknown; password?: unknown; confirmPassword?: unknown }

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Authentication is unavailable' }, { status: 503 })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Sign in to continue' }, { status: 401 })

    const { data: actor, error: roleError } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (roleError || actor?.role !== 'super_admin') {
        return NextResponse.json({ error: 'Only Super Admins can manage user passwords' }, { status: 403 })
    }

    const { id } = await context.params
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
    }

    let body: PasswordRequest
    try {
        body = await request.json() as PasswordRequest
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    if (body.action !== 'set' && body.action !== 'email') {
        return NextResponse.json({ error: 'Invalid password action' }, { status: 400 })
    }
    if (body.action === 'set') {
        if (typeof body.password !== 'string' || typeof body.confirmPassword !== 'string') {
            return NextResponse.json({ error: 'Enter and confirm a new password' }, { status: 400 })
        }
        const policyError = validatePassword(body.password)
        if (policyError) return NextResponse.json({ error: policyError }, { status: 400 })
        if (body.password !== body.confirmPassword) {
            return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 })
        }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !serviceKey || !anonKey) {
        return NextResponse.json({ error: 'Password management is not configured' }, { status: 503 })
    }

    const admin = createSupabaseClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: targetProfile, error: profileError } = await supabase.from('users').select('id').eq('id', id).single()
    if (profileError || !targetProfile) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { data: target, error: targetError } = await admin.auth.admin.getUserById(id)
    if (targetError || !target?.user) return NextResponse.json({ error: 'Auth user not found' }, { status: 404 })

    if (body.action === 'set') {
        const { error } = await admin.auth.admin.updateUserById(id, { password: body.password as string })
        if (error) return NextResponse.json({ error: error.message }, { status: 502 })
        return NextResponse.json({ message: 'Password changed successfully' })
    }

    if (!target.user.email) return NextResponse.json({ error: 'This user has no email address' }, { status: 400 })
    const mailer = createSupabaseClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error } = await mailer.auth.resetPasswordForEmail(target.user.email, {
        redirectTo: `${request.nextUrl.origin}/reset-password`,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 502 })
    return NextResponse.json({ message: 'Password reset email requested' })
}
