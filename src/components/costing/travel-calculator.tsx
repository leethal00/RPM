"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export type TravelResult = { oneWay: { km: number; hours: number }; returnTrip: { km: number; hours: number } }

const BASE_KEY = "rpm-travel-base-address"

export function TravelCalculator({ siteAddress, sitePoint, onApply, applying, kmLines, hourLines }: {
    siteAddress: string | null
    sitePoint: { lat: number; lng: number } | null
    onApply: (km: number, hours: number, kmLineId: string, hoursLineId: string) => Promise<void>
    applying: boolean
    kmLines: Array<{ id: string; description: string }>
    hourLines: Array<{ id: string; description: string }>
}) {
    const [start, setStart] = useState("")
    const [destination, setDestination] = useState(siteAddress || "")
    const [returnTrip, setReturnTrip] = useState(true)
    const [result, setResult] = useState<TravelResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [kmLineId, setKmLineId] = useState("")
    const [hoursLineId, setHoursLineId] = useState("")

    useEffect(() => {
        const timer = window.setTimeout(() => setStart(window.localStorage.getItem(BASE_KEY) || process.env.NEXT_PUBLIC_TRAVEL_BASE_ADDRESS || ""), 0)
        return () => window.clearTimeout(timer)
    }, [])

    function editStart(value: string) {
        setStart(value)
        window.localStorage.setItem(BASE_KEY, value)
        setResult(null)
        setError("")
    }

    async function calculate() {
        setLoading(true)
        setError("")
        setResult(null)
        try {
            const response = await fetch("/api/costing/travel-route", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    start: start.trim(), destination: destination.trim(),
                    sitePoint: destination.trim() === (siteAddress || "").trim() ? sitePoint : null,
                }),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || "Could not calculate the route.")
            setResult(data as TravelResult)
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not calculate the route.")
        } finally {
            setLoading(false)
        }
    }

    const selected = result && (returnTrip ? result.returnTrip : result.oneWay)
    const selectedKmLineId = kmLineId === "__new__" || kmLines.some((line) => line.id === kmLineId) ? kmLineId : kmLines[0]?.id || "__new__"
    const selectedHoursLineId = hoursLineId === "__new__" || hourLines.some((line) => line.id === hoursLineId) ? hoursLineId : hourLines[0]?.id || "__new__"
    return (
        <section className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3" aria-label="Travel calculator">
            <div>
                <h3 className="text-sm font-semibold">Travel &amp; Mileage calculator</h3>
                <p className="text-xs text-muted-foreground">Estimate driving distance and time, then apply them to this BOM. The base address is saved on this device.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium space-y-1">Start / base address
                    <Input value={start} onChange={(event) => editStart(event.target.value)} placeholder="Enter your base address" autoComplete="street-address" disabled={loading} />
                </label>
                <label className="text-xs font-medium space-y-1">Destination address
                    <Input value={destination} onChange={(event) => { setDestination(event.target.value); setResult(null); setError("") }} placeholder="Enter the job site address" autoComplete="off" disabled={loading} />
                </label>
            </div>
            {siteAddress && destination.trim() !== siteAddress.trim() && (
                <button type="button" className="text-xs text-primary underline disabled:opacity-50" disabled={loading} onClick={() => { setDestination(siteAddress); setResult(null) }}>Use job/site address</button>
            )}
            <div className="flex flex-wrap items-center gap-3">
                <Button type="button" size="sm" onClick={() => void calculate()} disabled={loading || !start.trim() || !destination.trim()}>
                    {loading ? "Calculating…" : "Calculate"}
                </Button>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={returnTrip} onChange={(event) => setReturnTrip(event.target.checked)} /> Include return trip</label>
            </div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            {result && selected && (
                <div className="space-y-3 border-t border-border/60 pt-3">
                    <div className="grid gap-2 sm:grid-cols-2 text-sm">
                        <div className={`rounded-md border p-2 ${!returnTrip ? "border-primary bg-background" : "border-border/60"}`}>
                            <div className="text-xs text-muted-foreground">One way</div>
                            <div className="font-semibold tabular-nums">{result.oneWay.km.toFixed(1)} km · {result.oneWay.hours.toFixed(2)} hours</div>
                        </div>
                        <div className={`rounded-md border p-2 ${returnTrip ? "border-primary bg-background" : "border-border/60"}`}>
                            <div className="text-xs text-muted-foreground">Return trip</div>
                            <div className="font-semibold tabular-nums">{result.returnTrip.km.toFixed(1)} km · {result.returnTrip.hours.toFixed(2)} hours</div>
                        </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-xs font-medium">KM BOM line
                            <select className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={selectedKmLineId} onChange={(event) => setKmLineId(event.target.value)}>
                                {kmLines.map((line) => <option key={line.id} value={line.id}>{line.description}</option>)}
                                <option value="__new__">Add new Km rate line</option>
                            </select>
                        </label>
                        <label className="text-xs font-medium">Travel hours BOM line
                            <select className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={selectedHoursLineId} onChange={(event) => setHoursLineId(event.target.value)}>
                                {hourLines.map((line) => <option key={line.id} value={line.id}>{line.description}</option>)}
                                <option value="__new__">Add new Travel Labour line</option>
                            </select>
                        </label>
                    </div>
                    <Button type="button" size="sm" variant="secondary" disabled={applying} onClick={() => void onApply(Number(selected.km.toFixed(1)), Number(selected.hours.toFixed(2)), selectedKmLineId, selectedHoursLineId)}>
                        {applying ? "Applying…" : `Apply ${selected.km.toFixed(1)} km and ${selected.hours.toFixed(2)} travel hours to BOM`}
                    </Button>
                    <p className="text-xs text-muted-foreground">Road estimate only. KM is a distance charge; travel hours count as labour time.</p>
                </div>
            )}
        </section>
    )
}
