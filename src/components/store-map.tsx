"use client"

import { useEffect, useState, useRef } from "react"
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import Link from "next/link"

// Fix for default marker icons in Leaflet with Next.js
const DefaultIcon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
})

L.Marker.prototype.options.icon = DefaultIcon

// Helper to create colored icons based on status
const getStatusIcon = (status: string) => {
    let color = "#2D6A4F" // Default Green
    if (status === "maintenance") color = "#F59E0B" // Amber
    if (status === "inactive") color = "#DC2626" // Red

    return L.divIcon({
        className: "custom-div-icon",
        html: `<div style="background-color: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 8px ${color}88;"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    })
}

interface Store {
    id: string
    name: string
    address: string
    lat: number
    lng: number
    status: string
    region: string
    brand_st_pierres?: boolean
    brand_bento_bowl?: boolean
    brand_k10?: boolean
    site_photos?: {
        url: string
    }[]
}

interface StoreMapProps {
    stores: Store[]
    center?: [number, number]
    zoom?: number
}

function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
    const map = useMap()
    useEffect(() => {
        map.flyTo(center, zoom, {
            duration: 1.5
        })
    }, [center, zoom, map])
    return null
}

function ResetViewControl({ nzCenter, nzZoom }: { nzCenter: [number, number]; nzZoom: number }) {
    const map = useMap();
    return (
        <button
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-white p-2 rounded-md shadow-md text-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={() => {
                map.flyTo(nzCenter, nzZoom, { duration: 1.5 });
            }}
        >
            Reset View
        </button>
    );
}

function StoreMarker({ store, closeTimerRef }: { store: Store; closeTimerRef: React.MutableRefObject<NodeJS.Timeout | null> }) {
    const map = useMap()

    return (
        <Marker
            position={[store.lat, store.lng]}
            icon={getStatusIcon(store.status)}
            eventHandlers={{
                mouseover: (e) => {
                    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
                    e.target.openPopup()
                },
                mouseout: (e) => {
                    const marker = e.target
                    closeTimerRef.current = setTimeout(() => {
                        marker.closePopup()
                    }, 300)
                }
            }}
        >
            <Popup closeButton={false} className="custom-hover-popup">
                <div
                    className="p-1 min-w-[200px]"
                    onMouseEnter={() => {
                        if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
                    }}
                    onMouseLeave={() => {
                        closeTimerRef.current = setTimeout(() => {
                            map.closePopup()
                        }, 200)
                    }}
                >
                    <div className="flex items-center justify-between gap-3 mb-1">
                        <h3 className="font-bold text-sm tracking-tight">{store.name}</h3>
                        <div className="flex items-center gap-1 shrink-0">
                            {store.brand_st_pierres !== false && (
                                <div className="h-10 w-10 rounded-lg bg-white p-1 border-2 shadow-sm flex items-center justify-center">
                                    <img src="/brands/st-pierres.png" alt="SP" className="h-full w-full object-contain" title="St Pierre's Sushi" />
                                </div>
                            )}
                            {store.brand_bento_bowl && (
                                <div className="h-10 w-10 rounded-lg bg-white p-1 border-2 shadow-sm flex items-center justify-center">
                                    <img src="/brands/bento-bowl.png" alt="BB" className="h-full w-full object-contain" title="Bento Bowl" />
                                </div>
                            )}
                            {store.brand_k10 && (
                                <div className="h-10 w-10 rounded-lg bg-white p-1 border-2 shadow-sm flex items-center justify-center">
                                    <img src="/brands/k10.png" alt="K10" className="h-full w-full object-contain" title="K10 Sushi Train" />
                                </div>
                            )}
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{store.address}</p>

                    {store.site_photos && store.site_photos.length > 0 && (
                        <div className="w-full aspect-video rounded-lg overflow-hidden mb-2 border shadow-sm">
                            <img
                                src={store.site_photos[0].url}
                                alt={store.name}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <div className={`size-2 rounded-full ${store.status === 'active' ? 'bg-green-500' :
                            store.status === 'maintenance' ? 'bg-amber-500' : 'bg-red-500'
                            }`} />
                        <span className="text-[10px] uppercase font-bold tracking-wider">
                            {store.status}
                        </span>
                    </div>
                    <div className="mt-3 pt-2 border-t">
                        <Link
                            href={`/stores/${store.id}`}
                            className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                        >
                            VIEW SITE DETAILS →
                        </Link>
                    </div>
                </div>
            </Popup>
        </Marker>
    )
}

export default function StoreMap({ stores, center = [-40.9006, 174.8860], zoom = 5.5 }: StoreMapProps) {
    const [isMounted, setIsMounted] = useState(false)
    const closeTimerRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        setIsMounted(true)
        return () => {
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
        }
    }, [])

    if (!isMounted) return <div className="h-full w-full bg-muted animate-pulse rounded-lg" />

    const nzCenter: [number, number] = [-40.9006, 174.8860];
    const nzZoom = 5.5;

    return (
        <div className="h-full w-full rounded-lg overflow-hidden border shadow-inner relative">
            <MapContainer
                center={center}
                zoom={zoom}
                scrollWheelZoom={true}
                className="h-full w-full"
                zoomControl={false}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                />
                <ChangeView center={center} zoom={zoom} />
                <ResetViewControl nzCenter={nzCenter} nzZoom={nzZoom} />
                {stores.filter(s => s.lat && s.lng).map((store) => (
                    <StoreMarker key={store.id} store={store} closeTimerRef={closeTimerRef} />
                ))}
            </MapContainer>
        </div>
    )
}
