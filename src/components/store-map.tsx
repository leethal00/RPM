"use client"

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import type { Store } from '@/types/database'
import { getGoogleMapsConfig } from '@/lib/google-maps-config'

export interface StoreMapProps {
    stores: Store[]
    center?: [number, number]
    zoom?: number
    selectedStoreId?: string
}

const GoogleStoreMap = dynamic(() => import('./google-store-map'), { ssr: false })
const LeafletStoreMap = dynamic(() => import('./leaflet-store-map'), { ssr: false })

export default function StoreMap(props: StoreMapProps) {
    const [useGoogle, setUseGoogle] = useState(Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()))
    useEffect(() => {
        let cancelled = false
        getGoogleMapsConfig().then(config => { if (!cancelled) setUseGoogle(Boolean(config)) }).catch(() => undefined)
        return () => { cancelled = true }
    }, [])
    if (useGoogle) return <GoogleStoreMap {...props} />
    // Keep the existing map usable before Google is configured. Google-derived
    // locations must only be displayed on a Google map.
    return <LeafletStoreMap {...props} stores={props.stores.filter(s => !s.address_details?.place_id)} />
}
