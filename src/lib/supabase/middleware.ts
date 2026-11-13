import { createServerClient } from '@supabase/ssr'
import { canOpenRoute, homeForRole, isInstaller, isMobileAdmin, isProductionOperator } from '@/lib/permissions'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
        return await Promise.race([
            checkSession(request, controller.signal),
            new Promise<never>((_, reject) => {
                timeout = setTimeout(() => { controller.abort(); reject(new Error('Session check timed out')) }, 10_000)
            }),
        ])
    } catch {
        return NextResponse.json({ error: 'RPM could not verify your session. Please reload in a moment.' }, {
            status: 503, headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' },
        })
    } finally {
        clearTimeout(timeout)
    }
}

async function checkSession(request: NextRequest, signal: AbortSignal) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            global: { fetch: (input, init) => fetch(input, {
                ...init,
                signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal,
            }) },
            cookies: {
                getAll: () => request.cookies.getAll(),
                setAll(cookies) {
                    cookies.forEach(({ name, value }) => request.cookies.set(name, value))
                    response = NextResponse.next({ request })
                    cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
                },
            },
        }
    )

    // Signature/expiry verification uses cached signing keys where supported;
    // legacy symmetric keys fall back to Auth. Never trust getSession() alone.
    const { data, error: authError } = await supabase.auth.getClaims()
    if (authError && (!authError.status || authError.status >= 500)) throw authError
    const user = data?.claims?.sub ? { id: data.claims.sub } : null
    const withCookies = (result: NextResponse) => {
        response.cookies.getAll().forEach(cookie => result.cookies.set(cookie))
        return result
    }

    // Public routes that don't require authentication.
    // Xero webhook/callback requests arrive server-to-server without an RPM session cookie;
    // webhook security is handled by the endpoint's Xero signature validation.
    const publicPaths = [
        '/login',
        '/forgot-password',
        '/reset-password',
        '/api/xero/webhook',
        '/api/xero/callback',
    ]
    const isPublicPath = publicPaths.some(path => request.nextUrl.pathname === path)

    // Protected route logic
    if (!user && !isPublicPath) {
        // no user, potentially respond by redirecting the user to the login page
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return withCookies(NextResponse.redirect(url))
    }

    const { data: profile, error: profileError } = user ? await supabase.from('users').select('role').eq('id', user.id).single() : { data: null, error: null }
    if (profileError) throw profileError
    if (user && (!isPublicPath || isProductionOperator(profile?.role) || isInstaller(profile?.role) || isMobileAdmin(profile?.role)) && !canOpenRoute(profile?.role, request.nextUrl.pathname)) {
        if (request.nextUrl.pathname.startsWith('/api/') || !profile?.role) {
            return withCookies(NextResponse.json({ error: 'Access denied' }, { status: 403 }))
        }
        const url = request.nextUrl.clone()
        url.pathname = homeForRole(profile.role)
        url.search = ''
        const denied = NextResponse.redirect(url)
        response.cookies.getAll().forEach(cookie => denied.cookies.set(cookie))
        return denied
    }

    const redirectAwayPaths = ['/login', '/forgot-password']
    const shouldRedirectAway = redirectAwayPaths.some(path => request.nextUrl.pathname === path)

    if (user && shouldRedirectAway) {
        // user is already logged in, redirect to home
        const url = request.nextUrl.clone()
        url.pathname = homeForRole(profile?.role ?? null)
        return withCookies(NextResponse.redirect(url))
    }

    return response
}
