import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
    user: { id: 'user' } as { id: string } | null,
    data: { browser_api_key: 'public-browser-key', map_id: 'map' } as { browser_api_key: string; map_id: string } | null,
    error: null as unknown,
    admin: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: (...args: unknown[]) => {
    state.admin(...args)
    return { from: (table: string) => {
        expect(table).toBe('google_maps_browser_config')
        return { select: (fields: string) => {
            expect(fields).toBe('browser_api_key,map_id')
            return { eq: () => ({ maybeSingle: async () => ({ data: state.data, error: state.error }) }) }
        } }
    } }
} }))
import { GET } from './route'

beforeEach(() => { state.user = { id: 'user' }; state.data = { browser_api_key: 'public-browser-key', map_id: 'map' }; state.error = null; state.admin.mockClear() })

it('returns only the public browser settings to signed-in users and prevents shared caching', async () => {
    const response = await GET()
    expect(await response.json()).toEqual({ apiKey: 'public-browser-key', mapId: 'map' })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
})
it('rejects signed-out requests before reading the server-only table', async () => {
    state.user = null
    expect((await GET()).status).toBe(401)
    expect(state.admin).not.toHaveBeenCalled()
})
it('returns explicit missing configuration and keeps database errors separate', async () => {
    state.data = null
    expect(await (await GET()).json()).toEqual({ apiKey: null })
    state.error = new Error('database unavailable')
    expect((await GET()).status).toBe(503)
})
