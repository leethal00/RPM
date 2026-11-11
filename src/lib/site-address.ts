import { loadGoogleMaps } from './google-maps'
import { searchOpenStreetMapPlaces } from './openstreetmap-address'
import { getGoogleMapsConfig } from './google-maps-config'

/** Address fields confirmed by the user when saving a site. */
export interface SiteAddressDetails {
    street_number: string
    street: string
    suburb: string
    locality: string
    region: string
    postal_code: string
    country_code: string
    place_id: string | null
}

export interface SiteLocation {
    address: string
    lat: number | null
    lng: number | null
    address_details?: SiteAddressDetails | null
}

export interface PlaceResult extends SiteLocation {
    id: string
    name: string
    locality: string
    selectable: boolean
}

export function normalizePlace(place: google.maps.places.Place): PlaceResult | null {
    const part = (type: string, short = false) => {
        const component = place.addressComponents?.find(c => c.types.includes(type))
        return (short ? component?.shortText : component?.longText) || ''
    }
    if (part('country', true) !== 'NZ' || !place.location || !place.formattedAddress) return null
    const lat = place.location.lat(), lng = place.location.lng()
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    const details: SiteAddressDetails = {
        street_number: part('street_number'), street: part('route'),
        suburb: part('sublocality_level_1') || part('sublocality'),
        locality: part('locality') || part('postal_town'), region: part('administrative_area_level_1'),
        postal_code: part('postal_code'), country_code: 'NZ', place_id: place.id,
    }
    return {
        id: place.id, name: place.displayName || place.formattedAddress,
        address: place.formattedAddress, locality: [details.suburb, details.locality].filter(Boolean).join(', '),
        lat, lng, address_details: details,
        // Never label an area-only result as a verified street address.
        selectable: Boolean(details.street && (details.locality || details.suburb) &&
            (details.street_number || place.types?.some(type => ['premise', 'subpremise', 'establishment'].includes(type)))),
    }
}

export async function searchSitePlaces(query: string): Promise<PlaceResult[]> {
    if (!await getGoogleMapsConfig()) return searchOpenStreetMapPlaces(query)
    await loadGoogleMaps()
    const { Place } = await google.maps.importLibrary('places') as google.maps.PlacesLibrary
    const { places } = await Place.searchByText({
        textQuery: query, fields: ['id', 'displayName', 'formattedAddress', 'addressComponents', 'location', 'types'],
        locationBias: { center: { lat: -36.8485, lng: 174.7633 }, radius: 50000 },
        region: 'nz', language: 'en', maxResultCount: 10,
    })
    // Region is a formatting/ranking hint, not a country restriction.
    return places.map(normalizePlace).filter((p): p is PlaceResult => p !== null)
}

export function hasCoordinates(location: SiteLocation): boolean {
    return location.lat != null && location.lng != null && Number.isFinite(location.lat) && Number.isFinite(location.lng)
}

export function siteLocationForSave(location: SiteLocation): SiteLocation {
    // Save the Google place ID, not a permanent cache of Google's coordinates.
    // The Google map resolves the ID at display time. Legacy/manual pins stay intact.
    return location.address_details?.place_id ? { ...location, lat: null, lng: null } : location
}
