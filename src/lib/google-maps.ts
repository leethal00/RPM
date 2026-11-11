import { getGoogleMapsConfig } from './google-maps-config'

let loading: Promise<void> | undefined

/** One SDK load shared by Places search and the Sites map. Key is referrer-restricted. */
export async function loadGoogleMaps(): Promise<void> {
    if (typeof google !== 'undefined' && google.maps) return Promise.resolve()
    if (loading) return loading
    const key = (await getGoogleMapsConfig())?.apiKey
    if (!key) return Promise.reject(new Error('Google Maps is not configured. You can enter an address manually.'))
    // Configuration is asynchronous; another caller may have started the SDK.
    if (loading) return loading
    loading = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        const callback = '__rpmGoogleMapsReady'
        const target = window as unknown as Record<string, unknown>
        const timeout = setTimeout(() => finish(new Error('Google Maps took too long to load. Please retry or enter the address manually.')), 15000)
        function finish(error?: Error) {
            clearTimeout(timeout)
            delete target[callback]
            if (error) {
                script.remove()
                loading = undefined
                reject(error)
            } else resolve()
        }
        target[callback] = () => finish()
        const params = new URLSearchParams({ key, v: 'weekly', loading: 'async', language: 'en', region: 'NZ', callback })
        script.src = `https://maps.googleapis.com/maps/api/js?${params}`
        script.async = true
        script.onerror = () => finish(new Error('Google Maps could not load. Please retry or enter the address manually.'))
        document.head.appendChild(script)
    })
    return loading
}
