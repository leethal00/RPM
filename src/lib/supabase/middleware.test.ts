// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { updateSession } from './middleware'

const mocks = vi.hoisted(() => ({ claims: vi.fn(), profile: vi.fn(), cookies: false }))
vi.mock('@supabase/ssr', () => ({ createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (cookies: unknown[]) => void } }) => {
    if (mocks.cookies) options.cookies.setAll([
        { name: 'sb-session.0', value: 'first', options: { httpOnly: true } },
        { name: 'sb-session.1', value: 'second', options: { httpOnly: true } },
    ])
    return {
        auth: { getClaims: mocks.claims },
        from: () => ({ select: () => ({ eq: () => ({ single: mocks.profile }) }) }),
    }
} }))
beforeEach(() => {
    mocks.cookies = false
    mocks.claims.mockReset().mockResolvedValue({ data: { claims: { sub: 'user' } }, error: null })
    mocks.profile.mockReset().mockResolvedValue({ data: { role: 'super_admin' }, error: null })
})

it('allows a verified administrator to open quotes', async () => {
    expect((await updateSession(new NextRequest('https://rpm.test/quoting'))).status).toBe(200)
    expect(mocks.claims).toHaveBeenCalledOnce()
})
it('redirects invalid sessions without reading a profile', async () => {
    mocks.claims.mockResolvedValue({ data: null, error: { status: 401 } })
    const response = await updateSession(new NextRequest('https://rpm.test/quoting'))
    expect(response.headers.get('location')).toBe('https://rpm.test/login')
    expect(mocks.profile).not.toHaveBeenCalled()
})
it('retains route restrictions for installers', async () => {
    mocks.profile.mockResolvedValue({ data: { role: 'installer' }, error: null })
    const response = await updateSession(new NextRequest('https://rpm.test/quoting'))
    expect(response.headers.get('location')).toBe('https://rpm.test/profile')
})
it('returns a retryable failure for a role-query outage', async () => {
    mocks.profile.mockResolvedValue({ data: null, error: { message: 'Timed out' } })
    const response = await updateSession(new NextRequest('https://rpm.test/quoting'))
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('5')
    expect(response.headers.get('cache-control')).toBe('no-store')
})
it('preserves all refreshed cookie chunks on redirects', async () => {
    mocks.cookies = true
    const response = await updateSession(new NextRequest('https://rpm.test/login'))
    expect(response.cookies.get('sb-session.0')?.value).toBe('first')
    expect(response.cookies.get('sb-session.1')?.value).toBe('second')
})
it('fails closed when session verification cannot reach Auth', async () => {
    mocks.claims.mockRejectedValue(new Error('Network unavailable'))
    expect((await updateSession(new NextRequest('https://rpm.test/quoting'))).status).toBe(503)
    expect(mocks.profile).not.toHaveBeenCalled()
})
it('bounds a stalled verification request without allowing access', async () => {
    vi.useFakeTimers()
    try {
        mocks.claims.mockReturnValue(new Promise(() => {}))
        const pending = updateSession(new NextRequest('https://rpm.test/quoting'))
        await vi.advanceTimersByTimeAsync(10_000)
        expect((await pending).status).toBe(503)
        expect(mocks.profile).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
})
