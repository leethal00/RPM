import { describe, expect, it, vi, afterEach } from 'vitest'
import { normalizePlace, searchSitePlaces, siteLocationForSave } from '../site-address'

vi.mock('../google-maps', () => ({ loadGoogleMaps: vi.fn().mockResolvedValue(undefined) }))

function place(country = 'NZ', street = 'Mount Wellington Highway') {
    return {
        id: 'timezone-sylvia-park', displayName: 'TimeZone Sylvia Park',
        formattedAddress: '286 Mount Wellington Highway, Mount Wellington, Auckland 1060, New Zealand',
        location: { lat: () => -36.915, lng: () => 174.842 },
        addressComponents: [
            ['country', 'New Zealand', country], ['street_number', '286'], ['route', street],
            ['sublocality_level_1', 'Mount Wellington'], ['locality', 'Auckland'],
            ['administrative_area_level_1', 'Auckland'], ['postal_code', '1060'],
        ].map(([type, longText, shortText]) => ({ types: [type], longText, shortText: shortText || longText })),
    } as unknown as google.maps.places.Place
}

afterEach(() => vi.unstubAllGlobals())

describe('site place search', () => {
    it('normalizes a business to a street address and coordinates with locality', () => {
        expect(normalizePlace(place())).toMatchObject({
            name: 'TimeZone Sylvia Park', lat: -36.915, lng: 174.842, selectable: true,
            locality: 'Mount Wellington, Auckland',
            address_details: { street_number: '286', street: 'Mount Wellington Highway', locality: 'Auckland', country_code: 'NZ' },
        })
    })
    it('rejects overseas locations and invalid coordinates; disables incomplete street addresses', () => {
        expect(normalizePlace(place('AU'))).toBeNull()
        const invalid = { ...place(), location: { lat: () => NaN, lng: () => 174 } } as unknown as google.maps.places.Place
        expect(normalizePlace(invalid)).toBeNull()
        expect(normalizePlace(place('NZ', ''))?.selectable).toBe(false)
        const roadOnly = { ...place(), types: ['route'], addressComponents: place().addressComponents?.filter(c => !c.types.includes('street_number')) } as google.maps.places.Place
        expect(normalizePlace(roadOnly)?.selectable).toBe(false)
    })
    it('accepts street addresses without a business name', () => {
        const address = { ...place(), displayName: null } as google.maps.places.Place
        expect(normalizePlace(address)?.name).toBe(address.formattedAddress)
    })
    it('uses Auckland bias, filters NZ explicitly, and requests address components', async () => {
        const search = vi.fn().mockResolvedValue({ places: [place(), place('AU')] })
        vi.stubGlobal('google', { maps: { importLibrary: vi.fn().mockResolvedValue({ Place: { searchByText: search } }) } })
        expect(await searchSitePlaces('Timezone Sylvia Park')).toHaveLength(1)
        expect(search).toHaveBeenCalledWith(expect.objectContaining({
            textQuery: 'Timezone Sylvia Park', region: 'nz',
            locationBias: { center: { lat: -36.8485, lng: 174.7633 }, radius: 50000 },
            fields: expect.arrayContaining(['addressComponents', 'location']),
        }))
    })
    it('preserves legacy pins exactly, saves Google ID without permanent Google coordinate caching', () => {
        const legacy = { address: 'Existing address', lat: -36.85, lng: 174.7 }
        expect(siteLocationForSave(legacy)).toEqual(legacy)
        const selected = normalizePlace(place())!
        expect(siteLocationForSave(selected)).toMatchObject({ lat: null, lng: null, address_details: { place_id: selected.id } })
    })
})
