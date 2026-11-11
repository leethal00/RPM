import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => { vi.resetModules(); vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', ''); vi.stubGlobal('google', undefined) })
afterEach(() => { document.head.querySelectorAll('script[src*="maps.googleapis.com"]').forEach(script => script.remove()); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('uses the runtime key for one shared SDK script across simultaneous map and search loads', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ apiKey: 'runtime-test-key', mapId: 'runtime-map' }) })
    vi.stubGlobal('fetch', fetcher)
    const { loadGoogleMaps } = await import('../google-maps')
    const first = loadGoogleMaps(), second = loadGoogleMaps()
    await vi.waitFor(() => expect(document.head.querySelectorAll('script[src*="maps.googleapis.com"]')).toHaveLength(1))
    const script = document.head.querySelector<HTMLScriptElement>('script[src*="maps.googleapis.com"]')!
    expect(new URL(script.src).searchParams.get('key')).toBe('runtime-test-key')
    ;(window as unknown as { __rpmGoogleMapsReady: () => void }).__rpmGoogleMapsReady()
    await Promise.all([first, second])
    expect(fetcher).toHaveBeenCalledTimes(1)
})
