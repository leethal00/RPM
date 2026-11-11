import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => { vi.resetModules(); vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', '') })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('loads runtime browser settings once and shares them between search and map', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ apiKey: 'browser-test-key', mapId: 'runtime-map' }) })
    vi.stubGlobal('fetch', fetcher)
    const { getGoogleMapsConfig, googleMapsMapId } = await import('../google-maps-config')
    expect(await Promise.all([getGoogleMapsConfig(), getGoogleMapsConfig()])).toEqual([
        { apiKey: 'browser-test-key', mapId: 'runtime-map' }, { apiKey: 'browser-test-key', mapId: 'runtime-map' },
    ])
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/maps/config', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }))
    expect(googleMapsMapId()).toBe('runtime-map')
})

it('keeps explicit build configuration ahead of runtime settings', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'build-test-key')
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID', 'build-map')
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const { getGoogleMapsConfig } = await import('../google-maps-config')
    expect(await getGoogleMapsConfig()).toEqual({ apiKey: 'build-test-key', mapId: 'build-map' })
    expect(fetcher).not.toHaveBeenCalled()
})

it('allows the keyless fallback only when configuration is explicitly absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ apiKey: null }) }))
    const { getGoogleMapsConfig } = await import('../google-maps-config')
    expect(await getGoogleMapsConfig()).toBeNull()
})

it('retries failed configuration reads rather than caching failure or silently changing provider', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true, json: async () => ({ apiKey: 'retry-key', mapId: 'map' }) })
    vi.stubGlobal('fetch', fetcher)
    const { getGoogleMapsConfig } = await import('../google-maps-config')
    await expect(getGoogleMapsConfig()).rejects.toThrow('could not be loaded')
    expect(await getGoogleMapsConfig()).toMatchObject({ apiKey: 'retry-key' })
    expect(fetcher).toHaveBeenCalledTimes(2)
})

it('does not silently fall back when the configuration response is malformed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ unexpected: true }) }))
    const { getGoogleMapsConfig } = await import('../google-maps-config')
    await expect(getGoogleMapsConfig()).rejects.toThrow('Invalid map configuration')
})
