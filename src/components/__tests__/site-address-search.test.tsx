import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SiteAddressSearch } from '../site-address-search'
import { searchSitePlaces, type SiteLocation, type PlaceResult } from '@/lib/site-address'

vi.mock('@/lib/site-address', async importOriginal => ({
    ...await importOriginal<typeof import('@/lib/site-address')>(), searchSitePlaces: vi.fn(),
}))
const search = vi.mocked(searchSitePlaces)
const result: PlaceResult = {
    id: 'timezone', name: 'TimeZone Sylvia Park', address: '286 Mount Wellington Highway, Auckland 1060, New Zealand',
    locality: 'Mount Wellington, Auckland', lat: -36.915, lng: 174.842, selectable: true,
    address_details: { street_number: '286', street: 'Mount Wellington Highway', suburb: 'Mount Wellington', locality: 'Auckland', region: 'Auckland', postal_code: '1060', country_code: 'NZ', place_id: 'timezone' },
}
function Form({ initial = { address: '', lat: null, lng: null } }: { initial?: SiteLocation }) {
    const [value, setValue] = useState(initial)
    return <><SiteAddressSearch value={value} onChange={setValue} /><output aria-label="Saved location">{JSON.stringify(value)}</output></>
}
const query = () => screen.getByLabelText(/Site Address/)
const saved = () => JSON.parse(screen.getByLabelText('Saved location').textContent!)
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('site address search', () => {
    it('selects a fallback address with its pin and OpenStreetMap attribution', async () => {
        search.mockResolvedValue([{ ...result, id: 'osm:N:123', address_details: { ...result.address_details!, place_id: null } }])
        render(<Form />)
        fireEvent.change(query(), { target: { value: '286 Mount Wellington Highway' } })
        expect(search).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: 'Search' }))
        fireEvent.click(await screen.findByRole('button', { name: /TimeZone Sylvia Park/ }))
        expect(saved()).toMatchObject({ lat: result.lat, lng: result.lng, address_details: { place_id: null } })
        expect(screen.getByRole('link', { name: /OpenStreetMap contributors/ })).toBeInTheDocument()
        expect(screen.queryByAltText('Powered by Google')).not.toBeInTheDocument()
    })
    it('searches on Enter, displays business/address/locality and selects structured location', async () => {
        search.mockResolvedValue([result]); render(<Form />)
        fireEvent.change(query(), { target: { value: 'Timezone Sylvia Park' } })
        expect(saved().address).toBe('') // Business query cannot be saved as an address.
        fireEvent.keyDown(query(), { key: 'Enter' })
        fireEvent.click(await screen.findByRole('button', { name: /TimeZone Sylvia Park/ }))
        expect(saved()).toMatchObject({ address: result.address, lat: result.lat, lng: result.lng, address_details: result.address_details })
        expect(screen.getByAltText('Powered by Google')).toBeInTheDocument()
    })
    it('clears a selected location after editing, and ignores late search responses', async () => {
        let resolve!: (value: PlaceResult[]) => void
        search.mockImplementation(() => new Promise(r => { resolve = r }))
        render(<Form initial={result} />)
        fireEvent.click(screen.getByRole('button', { name: 'Search' }))
        fireEvent.change(query(), { target: { value: 'Another premise' } })
        await act(async () => resolve([result]))
        expect(screen.queryByRole('button', { name: /TimeZone Sylvia Park/ })).not.toBeInTheDocument()
        expect(saved()).toMatchObject({ address: '', lat: null, lng: null, address_details: null })
    })
    it.each(['empty', 'failure'])('keeps manual entry usable on %s search', async kind => {
        if (kind === 'empty') search.mockResolvedValue([])
        else search.mockRejectedValue(new Error('Unavailable'))
        render(<Form />)
        fireEvent.change(query(), { target: { value: '123 Unlisted Road, Auckland' } })
        fireEvent.click(screen.getByRole('button', { name: 'Search' }))
        await waitFor(() => expect(screen.getByText(kind === 'empty' ? /No NZ locations/ : /Address search is unavailable/)).toBeInTheDocument())
        fireEvent.click(screen.getByRole('button', { name: /Enter address manually/ }))
        expect(saved()).toMatchObject({ address: '123 Unlisted Road, Auckland', lat: null, lng: null })
        fireEvent.change(query(), { target: { value: '125 Unlisted Road, Auckland' } })
        expect(saved().address).toBe('125 Unlisted Road, Auckland')
    })
    it('leaves an existing address and pin unchanged on mount or mode switches', () => {
        const existing = { address: 'Existing street address', lat: -36.8, lng: 174.7 }
        render(<Form initial={existing} />)
        expect(search).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: /Enter address manually/ }))
        fireEvent.click(screen.getByRole('button', { name: /Search by business/ }))
        expect(saved()).toEqual(existing)
    })
    it('does not allow selecting a place without a street address', async () => {
        search.mockResolvedValue([{ ...result, selectable: false }]); render(<Form />)
        fireEvent.change(query(), { target: { value: 'Sylvia Park' } })
        fireEvent.click(screen.getByRole('button', { name: 'Search' }))
        expect(await screen.findByRole('button', { name: /TimeZone Sylvia Park/ })).toBeDisabled()
    })
})
