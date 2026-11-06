import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import GoogleStoreMap from '../google-store-map'
import type { Store } from '@/types/database'

vi.mock('@/lib/google-maps', () => ({ loadGoogleMaps: vi.fn().mockResolvedValue(undefined) }))
const pan = vi.fn(), setZoom = vi.fn(), markers: Record<string, unknown>[] = [], details = vi.fn()
beforeEach(() => {
    markers.length = 0
    details.mockResolvedValue(undefined)
    class Map {
        panTo = pan
        setZoom = setZoom
    }
    class InfoWindow { close() {} }
    class Place {
        location = { toJSON: () => ({ lat: -36.915, lng: 174.842 }) }
        fetchFields = details
    }
    class AdvancedMarkerElement {
        map: unknown
        constructor(options: Record<string, unknown>) { markers.push(options); this.map = options.map }
        addListener() { return { remove() {} } }
    }
    class PinElement { element = document.createElement('div') }
    vi.stubGlobal('google', { maps: { InfoWindow, importLibrary: async (name: string) =>
        name === 'maps' ? { Map } : name === 'marker' ? { AdvancedMarkerElement, PinElement } : { Place } } })
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

it('reopens Google-linked sites using a fresh location and keeps legacy coordinates intact', async () => {
    const stores = [
        { id: 'google', name: 'Timezone', address: '286 Mount Wellington Highway', lat: null, lng: null, status: 'active', address_details: { place_id: 'timezone' } },
        { id: 'legacy', name: 'Existing', address: 'Old address', lat: -41.28, lng: 174.77, status: 'maintenance' },
        { id: 'manual', name: 'Unlisted', address: 'Manual address', lat: null, lng: null },
    ] as Store[]
    const before = JSON.stringify(stores)
    render(<GoogleStoreMap stores={stores} selectedStoreId="google" zoom={14} />)
    await waitFor(() => expect(markers).toHaveLength(2))
    expect(markers.map(m => m.position)).toEqual([{ lat: -36.915, lng: 174.842 }, { lat: -41.28, lng: 174.77 }])
    expect(details).toHaveBeenCalledWith({ fields: ['location'] })
    await waitFor(() => expect(pan).toHaveBeenLastCalledWith({ lat: -36.915, lng: 174.842 }))
    expect(JSON.stringify(stores)).toBe(before)
})

it('keeps legacy pins visible and explains an unavailable Google location', async () => {
    details.mockRejectedValue(new Error('Unavailable'))
    const stores = [
        { id: 'google', name: 'Timezone', address: 'Address', lat: null, lng: null, address_details: { place_id: 'timezone' } },
        { id: 'legacy', name: 'Existing', address: 'Address', lat: -41, lng: 174 },
    ] as Store[]
    render(<GoogleStoreMap stores={stores} />)
    expect(await screen.findByRole('status')).toHaveTextContent('Some map pins could not be loaded')
    expect(markers).toHaveLength(1)
})

it('zooms before centering a selected Google site from the NZ overview', async () => {
    const stores = [{ id: 'google', name: 'Sylvia Park', lat: null, lng: null,
        address_details: { place_id: 'sylvia-park' } }] as Store[]
    const { rerender } = render(<GoogleStoreMap stores={stores} zoom={5.5} />)
    await waitFor(() => expect(markers).toHaveLength(1))
    pan.mockClear()
    setZoom.mockClear()
    rerender(<GoogleStoreMap stores={stores} selectedStoreId="google" zoom={14} />)
    await waitFor(() => expect(pan).toHaveBeenLastCalledWith({ lat: -36.915, lng: 174.842 }))
    expect(setZoom).toHaveBeenLastCalledWith(14)
    expect(setZoom.mock.invocationCallOrder[0]).toBeLessThan(pan.mock.invocationCallOrder[0])
    expect(markers).toHaveLength(1)
})
