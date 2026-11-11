export type GoogleMapsConfig = { apiKey: string; mapId: string }

let pending: Promise<GoogleMapsConfig | null> | undefined
let loaded: GoogleMapsConfig | null = null

export function googleMapsMapId() {
    return loaded?.mapId || process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || 'DEMO_MAP_ID'
}

/** Public, HTTP-referrer-restricted browser settings; never a server API key. */
export function getGoogleMapsConfig(): Promise<GoogleMapsConfig | null> {
    const envKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
    if (envKey) {
        loaded = { apiKey: envKey, mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || 'DEMO_MAP_ID' }
        return Promise.resolve(loaded)
    }
    if (!pending) {
        pending = fetch('/api/maps/config', { cache: 'no-store', signal: AbortSignal.timeout(10000) }).then(async response => {
            if (!response.ok) throw new Error('Map configuration could not be loaded. Please retry.')
            const config: unknown = await response.json()
            if (!config || typeof config !== 'object' || !('apiKey' in config)) throw new Error('Invalid map configuration.')
            if (config.apiKey === null) return null
            if (typeof config.apiKey !== 'string' || !config.apiKey.trim()) throw new Error('Invalid map configuration.')
            loaded = {
                apiKey: config.apiKey.trim(),
                mapId: 'mapId' in config && typeof config.mapId === 'string' && config.mapId.trim() ? config.mapId.trim() : 'DEMO_MAP_ID',
            }
            return loaded
        }).catch(error => { pending = undefined; throw error })
    }
    return pending
}
