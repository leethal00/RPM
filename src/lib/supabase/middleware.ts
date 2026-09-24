import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { canOpenRoute, homeForRole, isInstaller, isProductionOperator } from '@/lib/permissions'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return request.cookies.get(name)?.value
                },
                set(name: string, value: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value,
                        ...options,
                    })
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    response.cookies.set({
                        name,
                        value,
                        ...options,
                    })
                },
                remove(name: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value: '',
                        ...options,
                    })
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    response.cookies.set({
                        name,
                        value: '',
                        ...options,
                    })
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()

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
        return NextResponse.redirect(url)
    }

    const { data: profile } = user ? await supabase.from('users').select('role').eq('id', user.id).single() : { data: null }
    if (user && (!isPublicPath || isProductionOperator(profile?.role) || isInstaller(profile?.role)) && !canOpenRoute(profile?.role, request.nextUrl.pathname)) {
        if (request.nextUrl.pathname.startsWith('/api/') || !profile?.role) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 })
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
        return NextResponse.redirect(url)
    }

    return response
}
