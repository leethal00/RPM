import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadGoogleMaps } from '../google-maps'
import { searchSitePlaces, siteLocationForSave } from '../site-address'
import { normalizeOpenStreetMapPlace } from '../openstreetmap-address'

vi.mock('../google-maps', () => ({ loadGoogleMaps: vi.fn() }))
vi.mock('../google-maps-config', () => ({ getGoogleMapsConfig: vi.fn().mockResolvedValue(null) }))

const feature = {
    properties: { countrycode: 'NZ', name: '5 Scotia Place', street: 'Scotia Place', housenumber: '5', city: 'Auckland', postcode: '1010', osm_type: 'N', osm_id: 123 },
    geometry: { type: 'Point', coordinates: [174.76, -36.85] },
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('address search without Google configuration', () => {
    it('looks up NZ addresses without loading Google and retains a usable map pin on save', async () => {
        vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', '')
        const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [feature, { ...feature, properties: { ...feature.properties, countrycode: 'AU' } }] }) })
        vi.stubGlobal('fetch', fetcher)
        const result = await searchSitePlaces('5 Scotia Place Auckland')
        expect(loadGoogleMaps).not.toHaveBeenCalled()
        expect(result).toHaveLength(1)
        expect(siteLocationForSave(result[0])).toMatchObject({ address: '5 Scotia Place, Auckland 1010, New Zealand', lat: -36.85, lng: 174.76, selectable: true, address_details: { place_id: null } })
        const url = new URL(fetcher.mock.calls[0][0])
        expect(url.hostname).toBe('photon.komoot.io')
        expect(url.searchParams.get('q')).toBe('5 Scotia Place Auckland')
        expect(url.searchParams.get('countrycode')).toBe('NZ')
        expect(await searchSitePlaces('5 Scotia Place Auckland')).toEqual(result)
        expect(fetcher).toHaveBeenCalledTimes(1)
    })
    it('rejects malformed and overseas locations and keeps street-only results unselectable', () => {
        expect(normalizeOpenStreetMapPlace({})).toBeNull()
        expect(normalizeOpenStreetMapPlace({ ...feature, geometry: { type: 'Point', coordinates: [NaN, -36.85] } })).toBeNull()
        expect(normalizeOpenStreetMapPlace({ ...feature, properties: { ...feature.properties, countrycode: 'AU' } })).toBeNull()
        expect(normalizeOpenStreetMapPlace({ ...feature, properties: { ...feature.properties, housenumber: '' } })?.selectable).toBe(false)
    })
    it('reports provider errors without turning them into an empty-result success', async () => {
        vi.useFakeTimers()
        vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', '')
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
        const rejected = expect(searchSitePlaces('Unavailable address')).rejects.toThrow('could not connect')
        await vi.runAllTimersAsync()
        await rejected
    })
})
