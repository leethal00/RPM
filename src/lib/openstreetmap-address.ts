import type { PlaceResult } from './site-address'

type Feature = {
    properties?: Record<string, unknown>
    geometry?: { type?: string; coordinates?: unknown[] }
}

export function normalizeOpenStreetMapPlace(feature: Feature): PlaceResult | null {
    const p = feature.properties || {}
    const text = (key: string) => typeof p[key] === 'string' ? p[key].trim() : ''
    const [lng, lat] = feature.geometry?.coordinates || []
    if (text('countrycode').toUpperCase() !== 'NZ' || feature.geometry?.type !== 'Point'
        || typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)
        || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    const street = text('street'), number = text('housenumber')
    const suburb = text('district'), city = text('city') || text('county')
    const streetLine = [number, street].filter(Boolean).join(' ')
    const locality = [...new Set([suburb, city].filter(Boolean))].join(', ')
    const address = [...new Set([streetLine, suburb, [city, text('postcode')].filter(Boolean).join(' '), 'New Zealand'].filter(Boolean))].join(', ')
    return {
        id: `osm:${p.osm_type || ''}:${p.osm_id || `${lng},${lat}`}`,
        name: text('name') || streetLine || locality,
        address, locality, lat, lng,
        selectable: Boolean(street && number && (city || suburb)),
        address_details: {
            street_number: number, street, suburb, locality: city, region: text('state'),
            postal_code: text('postcode'), country_code: 'NZ', place_id: null,
        },
    }
}

// Photon serves OpenStreetMap data without a Google key. This is deliberate
// button-triggered lookup, with a small cache and serial requests per browser.
// Public service has fair-use limits and no availability guarantee:
// https://github.com/komoot/photon#demo-server
const cache = new Map<string, PlaceResult[]>()
let queue: Promise<unknown> = Promise.resolve()
let nextRequestAt = 0

export function searchOpenStreetMapPlaces(query: string): Promise<PlaceResult[]> {
    const key = query.trim().toLowerCase()
    const found = cache.get(key)
    if (found) return Promise.resolve(found)
    const task = queue.then(async () => {
        const cached = cache.get(key)
        if (cached) return cached
        const delay = nextRequestAt - Date.now()
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
        nextRequestAt = Date.now() + 1000
        const params = new URLSearchParams({ q: query.trim(), limit: '10', lang: 'en', countrycode: 'NZ', lat: '-36.8485', lon: '174.7633' })
        const response = await fetch(`https://photon.komoot.io/api/?${params}`, { signal: AbortSignal.timeout(15000) })
        if (!response.ok) throw new Error('Address lookup could not connect. Try again or enter the address manually.')
        const body = await response.json()
        if (!Array.isArray(body.features)) throw new Error('Address lookup returned an invalid response.')
        const results = body.features.filter((feature: unknown): feature is Feature => !!feature && typeof feature === 'object')
            .map(normalizeOpenStreetMapPlace).filter((place: PlaceResult | null): place is PlaceResult => place !== null)
        if (cache.size >= 20) cache.delete(cache.keys().next().value!)
        cache.set(key, results)
        return results
    })
    queue = task.catch(() => undefined)
    return task
}
