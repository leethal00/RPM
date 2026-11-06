"use client"

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import Image from 'next/image'
import { searchSitePlaces, hasCoordinates, type SiteLocation, type PlaceResult } from '@/lib/site-address'

interface Props {
    value: SiteLocation
    onChange: (location: SiteLocation) => void
    approximate?: boolean
}

export function SiteAddressSearch({ value, onChange, approximate = false }: Props) {
    const [query, setQuery] = useState(value.address)
    const [manual, setManual] = useState(false)
    const [results, setResults] = useState<PlaceResult[]>([])
    const [searching, setSearching] = useState(false)
    const [message, setMessage] = useState('')
    const request = useRef(0)
    useEffect(() => () => { request.current++ }, [])

    function invalidate() {
        request.current++
        setSearching(false)
        setResults([])
        setMessage('')
    }

    async function lookup() {
        if (query.trim().length < 3) { setMessage('Enter at least 3 characters.'); return }
        const id = ++request.current
        setSearching(true)
        setResults([])
        setMessage('')
        try {
            const found = await searchSitePlaces(query.trim())
            if (id !== request.current) return
            setResults(found)
            if (!found.length) setMessage('No NZ locations found. Add a suburb or enter the street address manually.')
        } catch {
            if (id === request.current) setMessage('Google search is unavailable. Please retry or enter the street address manually.')
        } finally {
            if (id === request.current) setSearching(false)
        }
    }

    return <div className="grid gap-2">
        <Label htmlFor="site-location-query" className="text-xs font-medium text-muted-foreground">
            Site Address <span className="text-red-500">*</span>
        </Label>
        <div className="flex gap-2">
            <Input id="site-location-query" value={query} required autoComplete="off"
                placeholder={manual ? 'Full street address, suburb and town/city' : 'Business/site name or street address'}
                aria-describedby="site-location-help site-location-status"
                onChange={e => {
                    const text = e.target.value
                    invalidate()
                    setQuery(text)
                    onChange({ address: manual ? text : '', lat: null, lng: null, address_details: null })
                }}
                onKeyDown={e => {
                    if (e.key === 'Enter' && !manual) { e.preventDefault(); void lookup() }
                    if (e.key === 'Escape') invalidate()
                }} />
            {!manual && <Button type="button" onClick={lookup} disabled={searching || query.trim().length < 3}>
                {searching ? 'Searching…' : 'Search'}
            </Button>}
        </div>
        <p id="site-location-help" className="text-xs text-muted-foreground">
            {manual ? 'Enter the full address. This site will have no map pin until a location is selected.' : 'Try “TimeZone Sylvia Park” or “286 Mount Wellington Highway”. Select a result to capture its map location.'}
        </p>
        <div id="site-location-status" role="status" className="text-xs">
            {message || (value.address ? (approximate ? 'Approximate location — review the address and select a result to confirm the pin.' : hasCoordinates(value) || value.address_details?.place_id ? 'Map location captured. Check and confirm the address by saving the site.' : 'Address entered. Search and select a location to add a map pin.') : 'Select a search result or enter an address manually before saving.')}
        </div>
        {results.length > 0 && <ul aria-label="Matching NZ locations" className="border rounded-lg max-h-52 overflow-y-auto divide-y">
            {results.map(result => <li key={result.id}>
                <button type="button" disabled={!result.selectable} className="w-full text-left p-3 hover:bg-muted focus-visible:bg-muted disabled:opacity-60"
                    onClick={() => {
                        invalidate()
                        setQuery(result.address)
                        onChange({ address: result.address, lat: result.lat, lng: result.lng, address_details: result.address_details })
                    }}>
                    <span className="block text-sm font-semibold">{result.name}</span>
                    <span className="block text-xs">{result.address}</span>
                    <span className="block text-xs text-muted-foreground">{result.locality}</span>
                    {!result.selectable && <span className="block text-xs">Street address unavailable — enter it manually.</span>}
                </button>
            </li>)}
        </ul>}
        {(results.length > 0 || value.address_details?.place_id) && <Image src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" width={120} height={14} unoptimized className="bg-white" />}
        <Button type="button" variant="link" className="justify-self-start h-auto p-0 text-xs" onClick={() => {
            invalidate()
            setManual(!manual)
            if (!manual && query !== value.address) onChange({ address: query, lat: null, lng: null, address_details: null })
            // Switching modes alone does not alter an unchanged site's address or pin.
        }}>{manual ? 'Search by business name or address' : 'Can’t find it? Enter address manually'}</Button>
    </div>
}
