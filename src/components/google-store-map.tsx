"use client"

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import Image from 'next/image'
import { BrandChips, brandsFromStore } from '@/components/brand-chip'
import { computeTrafficLight } from '@/lib/health-score'
import type { StoreMapProps } from './store-map'
import type { Store } from '@/types/database'
import { loadGoogleMaps } from '@/lib/google-maps'
import { googleMapsMapId } from '@/lib/google-maps-config'
import { hasCoordinates } from '@/lib/site-address'

const NZ_CENTER = { lat: -40.9006, lng: 174.8860 }
interface LocatedStore { store: Store; position: google.maps.LatLngLiteral }
const TRAFFIC = {
    green: { color: '#2D6A4F', label: 'Healthy' }, orange: { color: '#F59E0B', label: 'Overdue' },
    red: { color: '#DC2626', label: 'Needs attention' }, muted: { color: '#94A3B8', label: 'No data' },
    unknown: { color: '#94A3B8', label: 'No data' },
}
function trafficFor(store: Store) {
    return TRAFFIC[store.status === 'inactive' ? 'muted' : computeTrafficLight({ assets: store.assets, jobs: store.jobs })]
}

function StoreDetails({ store }: { store: Store }) {
    const photos = (store.site_photos || []).filter(photo => !photo.internal_only && !!photo.url)
    const photo = photos.find(photo => photo.is_primary) || [...photos].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0]
    const traffic = trafficFor(store)
    return <div className="min-w-52 max-w-72 p-1 text-black">
        <div className="flex items-center justify-between gap-3 mb-1">
            <h3 className="font-bold text-sm">{store.name}</h3>
            <BrandChips brands={brandsFromStore(store)} size="md" />
        </div>
        <p className="text-xs my-2">{store.address}</p>
        {photo && <div className="relative w-full aspect-video rounded overflow-hidden mb-2"><Image src={photo.url} alt={store.name} fill sizes="300px" className="object-cover" /></div>}
        <Link href={`/stores/${store.id}`} className="flex items-center gap-2 text-xs font-bold mb-2">
            <span className="size-2 rounded-full" style={{ backgroundColor: traffic.color }} />{traffic.label}
        </Link>
        <Link href={`/stores/${store.id}`} className="text-xs font-bold text-primary">VIEW SITE DETAILS →</Link>
    </div>
}

export default function GoogleStoreMap({ stores, center, zoom = 5.5, selectedStoreId }: StoreMapProps) {
    const container = useRef<HTMLDivElement>(null)
    const [map, setMap] = useState<google.maps.Map | null>(null)
    const [locations, setLocations] = useState<LocatedStore[]>([])
    const [selected, setSelected] = useState<{ store: Store; content: HTMLDivElement } | null>(null)
    const [error, setError] = useState('')

    useEffect(() => {
        let cancelled = false
        loadGoogleMaps().then(async () => {
            const { Map } = await google.maps.importLibrary('maps') as google.maps.MapsLibrary
            if (!cancelled && container.current) setMap(new Map(container.current, {
                center: NZ_CENTER, zoom: 5.5,
                mapId: googleMapsMapId(),
                minZoom: 5, restriction: { latLngBounds: { south: -48, west: 165, north: -33.5, east: 180 }, strictBounds: false },
                mapTypeControl: false, streetViewControl: false,
            }))
        }).catch(() => { if (!cancelled) setError('Google Maps could not load. Site records are still available in the list.') })
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        if (!map) return
        let cancelled = false
        const markers: google.maps.marker.AdvancedMarkerElement[] = []
        const listeners: google.maps.MapsEventListener[] = []
        const info = new google.maps.InfoWindow()
        async function renderMarkers() {
            const [{ AdvancedMarkerElement, PinElement }, { Place }] = await Promise.all([
                google.maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
                google.maps.importLibrary('places') as Promise<google.maps.PlacesLibrary>,
            ])
            const found: LocatedStore[] = []
            let failed = false
            // Sequential refreshes avoid a burst of Place Details requests for old sites.
            for (const store of stores) {
                if (cancelled) return
                let position: google.maps.LatLngLiteral | null = null
                if (store.address_details?.place_id) {
                    try {
                        const place = new Place({ id: store.address_details.place_id })
                        await place.fetchFields({ fields: ['location'] })
                        if (place.location) position = place.location.toJSON()
                        else failed = true
                    } catch { failed = true }
                } else if (hasCoordinates({ address: store.address || '', lat: store.lat, lng: store.lng })) position = { lat: store.lat!, lng: store.lng! }
                if (!position || cancelled) continue
                found.push({ store, position })
                const color = trafficFor(store).color
                const pin = new PinElement({ background: color, borderColor: '#ffffff', glyphColor: '#ffffff' })
                const marker = new AdvancedMarkerElement({ map, position, title: store.name, content: pin.element })
                markers.push(marker)
                const open = () => {
                    const content = document.createElement('div')
                    setSelected({ store, content })
                    info.setContent(content)
                    info.open({ map, anchor: marker })
                }
                listeners.push(marker.addListener('click', open))
                pin.element.addEventListener('mouseenter', open)
            }
            if (!cancelled) {
                setLocations(found)
                setError(failed ? 'Some map pins could not be loaded. Please retry later.' : '')
            }
        }
        void renderMarkers().catch(() => { if (!cancelled) setError('Map pins could not be loaded. Please retry later.') })
        return () => {
            cancelled = true
            info.close()
            listeners.forEach(listener => listener.remove())
            markers.forEach(marker => { marker.map = null })
        }
    }, [map, stores])

    const lat = center?.[0] ?? NZ_CENTER.lat, lng = center?.[1] ?? NZ_CENTER.lng
    useEffect(() => {
        if (!map) return
        const selectedLocation = locations.find(location => location.store.id === selectedStoreId)
        map.setZoom(zoom)
        // Zoom before panning so NZ bounds do not clamp the destination at the old zoom.
        map.panTo(selectedLocation?.position || { lat, lng })
    }, [map, locations, selectedStoreId, lat, lng, zoom])

    return <div className="h-full w-full rounded-lg overflow-hidden border shadow-inner relative">
        <div ref={container} className="h-full w-full" aria-label="Sites map" />
        {error && <p role="status" className="absolute top-2 left-2 right-2 rounded bg-background p-2 text-sm shadow">{error}</p>}
        {map && <button type="button" className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white text-black p-2 rounded shadow"
            onClick={() => { map.panTo(NZ_CENTER); map.setZoom(5.5) }}>Reset View</button>}
        {selected && createPortal(<StoreDetails store={selected.store} />, selected.content)}
    </div>
}
