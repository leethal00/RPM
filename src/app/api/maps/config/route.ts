import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET() {
    const server = await createServerClient()
    const { data: auth } = await server.auth.getUser()
    if (!auth.user) return NextResponse.json({ error: 'Not signed in' }, { status: 401, headers })
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await admin.from('google_maps_browser_config')
        .select('browser_api_key,map_id').eq('id', true).maybeSingle()
    if (error) return NextResponse.json({ error: 'Map configuration could not be loaded' }, { status: 503, headers })
    // This key is intentionally sent to signed-in browsers. It must be restricted
    // in Google Cloud to RPM's HTTP referrers, Maps JavaScript and Places APIs.
    return NextResponse.json(data ? { apiKey: data.browser_api_key, mapId: data.map_id } : { apiKey: null }, { headers })
}
