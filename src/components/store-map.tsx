"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import Link from "next/link"

import type { Store } from "@/types/database"
import { BrandChips, brandsFromStore } from "@/components/brand-chip"
import { computeTrafficLight } from "@/lib/health-score"

// Default marker icons (kept for any non-status fallback paths)
const DefaultIcon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
})

L.Marker.prototype.options.icon = DefaultIcon

// Memoised status icons — created once at module load, reused across every marker.
//
// Markers reflect the traffic-light tier computed from assets + jobs:
//   green  → no active faults, all PMs current
//   orange → at least one asset overdue for service
//   red    → at least one open/in_progress fault job
//   muted  → no data joined or lifecycle inactive
const TRAFFIC_COLORS: Record<string, string> = {
    green: "#2D6A4F",
    orange: "#F59E0B",
    red: "#DC2626",
    muted: "#94A3B8",
}

const buildStatusIcon = (color: string) =>
    L.divIcon({
        className: "custom-div-icon",
        html: `<div style="background-color: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 8px ${color}88;"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    })

const TRAFFIC_ICONS: Record<string, L.DivIcon> = {
    green: buildStatusIcon(TRAFFIC_COLORS.green),
    orange: buildStatusIcon(TRAFFIC_COLORS.orange),
    red: buildStatusIcon(TRAFFIC_COLORS.red),
    muted: buildStatusIcon(TRAFFIC_COLORS.muted),
}

const TRAFFIC_LABELS: Record<string, string> = {
    green: "Healthy",
    orange: "Overdue",
    red: "Needs attention",
    muted: "No data",
}

const TRAFFIC_DOT_CLASS: Record<string, string> = {
    green: "bg-emerald-500",
    orange: "bg-amber-500",
    red: "bg-red-500",
    muted: "bg-muted-foreground/40",
}

// NZ panning guard — generous box around the country
const NZ_BOUNDS: L.LatLngBoundsLiteral = [
    [-48.0, 165.0],
    [-33.5, 180.0],
]

interface StoreMapProps {
    stores: Store[]
    center?: [number, number]
    zoom?: number
}

function ChangeView({
    center,
    zoom,
}: {
    center: [number, number]
    zoom: number
}) {
    const map = useMap()
    const initialised = useRef(false)

    useEffect(() => {
        if (!initialised.current) {
            initialised.current = true
            return
        }

        map.flyTo(center, zoom, { duration: 1.2 })
    }, [center, zoom, map])

    return null
}

function ResetViewControl({
    nzCenter,
    nzZoom,
}: {
    nzCenter: [number, number]
    nzZoom: number
}) {
    const map = useMap()

    return (
        <button
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-white p-2 rounded-md shadow-md text-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={() => {
                map.flyTo(nzCenter, nzZoom, { duration: 1.5 })
            }}
        >
            Reset View
        </button>
    )
}

function StoreMarker({
    store,
    closeTimerRef,
}: {
    store: Store
    closeTimerRef: React.MutableRefObject<NodeJS.Timeout | null>
}) {
    const map = useMap()

    const traffic =
        store.status === "inactive"
            ? "muted"
            : computeTrafficLight({
                  assets: store.assets,
                  jobs: store.jobs,
              })

    const icon = TRAFFIC_ICONS[traffic] ?? TRAFFIC_ICONS.green

    const photos = store.site_photos ?? []

    const popupPhoto =
        photos.find((p) => p.is_primary) ??
        [...photos].sort((a, b) =>
            (b.created_at ?? "").localeCompare(a.created_at ?? "")
        )[0]

    return (
        <Marker
            position={[store.lat!, store.lng!]}
            icon={icon}
            eventHandlers={{
                mouseover: (e) => {
                    if (closeTimerRef.current) {
                        clearTimeout(closeTimerRef.current)
                    }

                    e.target.openPopup()
                },

                mouseout: (e) => {
                    const marker = e.target

                    closeTimerRef.current = setTimeout(() => {
                        marker.closePopup()
                    }, 300)
                },
            }}
        >
            <Popup closeButton={false} className="custom-hover-popup">
                <div
                    className="p-1 min-w-[200px]"
                    onMouseEnter={() => {
                        if (closeTimerRef.current) {
                            clearTimeout(closeTimerRef.current)
                        }
                    }}
                    onMouseLeave={() => {
                        closeTimerRef.current = setTimeout(() => {
                            map.closePopup()
                        }, 200)
                    }}
                >
                    <div className="flex items-center justify-between gap-3 mb-1">
                        <h3 className="font-bold text-sm tracking-tight">
                            {store.name}
                        </h3>

                        <BrandChips
                            brands={brandsFromStore(store)}
                            size="md"
                            className="shrink-0"
                        />
                    </div>

                    <p className="text-xs text-muted-foreground mb-2">
                        {store.address}
                    </p>

                    {popupPhoto && (
                        <div className="relative w-full aspect-video rounded-lg overflow-hidden mb-2 border shadow-sm">
                            <Image
                                src={popupPhoto.url}
                                alt={store.name}
                                fill
                                className="object-cover"
                                sizes="300px"
                                loading="lazy"
                            />
                        </div>
                    )}

                    <Link
                        href={`/stores/${store.id}`}
                        className="flex items-center gap-2 group rounded-sm py-1"
                    >
                        <div
                            className={`size-2 rounded-full ${
                                TRAFFIC_DOT_CLASS[traffic] ??
                                TRAFFIC_DOT_CLASS.green
                            } group-hover:ring-4 group-hover:ring-primary/15 transition-all`}
                        />

                        <span className="text-[10px] uppercase font-bold tracking-wider group-hover:text-primary group-hover:underline">
                            {TRAFFIC_LABELS[traffic] ??
                                TRAFFIC_LABELS.green}
                        </span>
                    </Link>

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

export default function StoreMap({
    stores,
    center = [-40.9006, 174.8860],
    zoom = 5.5,
}: StoreMapProps) {
    const [isMounted, setIsMounted] = useState(false)
    const closeTimerRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        setIsMounted(true)

        const timer = closeTimerRef.current

        return () => {
            if (timer) {
                clearTimeout(timer)
            }
        }
    }, [])

    if (!isMounted) {
        return (
            <div className="h-full w-full bg-muted animate-pulse rounded-lg" />
        )
    }

    const nzCenter: [number, number] = [-40.9006, 174.8860]
    const nzZoom = 5.5

    return (
        <div className="h-full w-full rounded-lg overflow-hidden border shadow-inner relative">
            <MapContainer
                center={center}
                zoom={zoom}
                minZoom={5}
                maxBounds={NZ_BOUNDS}
                maxBoundsViscosity={0.9}
                scrollWheelZoom={true}
                preferCanvas={true}
                zoomSnap={0.5}
                zoomDelta={0.5}
                wheelDebounceTime={40}
                wheelPxPerZoomLevel={100}
                className="h-full w-full"
                zoomControl={true}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <ChangeView center={center} zoom={zoom} />

                <ResetViewControl
                    nzCenter={nzCenter}
                    nzZoom={nzZoom}
                />

                {stores
                    .filter((s) => s.lat && s.lng)
                    .map((store) => (
                        <StoreMarker
                            key={store.id}
                            store={store}
                            closeTimerRef={closeTimerRef}
                        />
                    ))}
            </MapContainer>
        </div>
    )
}
