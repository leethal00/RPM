"use client"

import dynamic from 'next/dynamic'
import type { Store } from '@/types/database'

export interface StoreMapProps {
    stores: Store[]
    center?: [number, number]
    zoom?: number
    selectedStoreId?: string
}

const GoogleStoreMap = dynamic(() => import('./google-store-map'), { ssr: false })
const LeafletStoreMap = dynamic(() => import('./leaflet-store-map'), { ssr: false })

export default function StoreMap(props: StoreMapProps) {
    if (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) return <GoogleStoreMap {...props} />
    // Keep the existing map usable before Google is configured. Google-derived
    // locations must only be displayed on a Google map.
    return <LeafletStoreMap {...props} stores={props.stores.filter(s => !s.address_details?.place_id)} />
}
