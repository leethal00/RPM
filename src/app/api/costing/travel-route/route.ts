import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

type Point = { lat: number; lng: number }
type Route = { distance: number; duration: number }

const geocodeCache = new Map<string, Point>()
let lastGeocode = 0

async function geocode(address: string): Promise<Point> {
    const key = address.trim().toLowerCase()
    const cached = geocodeCache.get(key)
    if (cached) return cached
    const wait = Math.max(0, lastGeocode + 1100 - Date.now())
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
    lastGeocode = Date.now()
    const url = new URL("https://nominatim.openstreetmap.org/search")
    url.searchParams.set("q", address)
    url.searchParams.set("format", "json")
    url.searchParams.set("limit", "1")
    url.searchParams.set("countrycodes", "nz")
    const response = await fetch(url, {
        headers: { "User-Agent": "RPM-Travel-Calculator/1.0 (https://rpm-git-stu-dev-leethal00s-projects.vercel.app)", Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error("Address lookup is unavailable. Please try again.")
    const rows = await response.json() as Array<{ lat: string; lon: string }>
    if (!rows[0]) throw new Error(`Could not find address: ${address}`)
    const point = { lat: Number(rows[0].lat), lng: Number(rows[0].lon) }
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) throw new Error(`Could not locate address: ${address}`)
    geocodeCache.set(key, point)
    if (geocodeCache.size > 200) geocodeCache.delete(geocodeCache.keys().next().value as string)
    return point
}

async function drive(from: Point, to: Point): Promise<Route> {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&steps=false`
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) })
    if (!response.ok) throw new Error("Road routing is unavailable. Please try again.")
    const result = await response.json() as { code?: string; routes?: Route[] }
    const route = result.routes?.[0]
    if (result.code !== "Ok" || !route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
        throw new Error("No driving route was found between these addresses.")
    }
    return route
}

export async function POST(request: Request) {
    const server = await createClient()
    if (!server) return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
    const { data: auth } = await server.auth.getUser()
    if (!auth.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
    try {
        const body = await request.json() as { start?: unknown; destination?: unknown; sitePoint?: Point | null }
        const start = typeof body.start === "string" ? body.start.trim() : ""
        const destination = typeof body.destination === "string" ? body.destination.trim() : ""
        if (start.length < 5 || destination.length < 5 || start.length > 300 || destination.length > 300) {
            return NextResponse.json({ error: "Enter complete start and destination addresses." }, { status: 400 })
        }
        const from = await geocode(start)
        const supplied = body.sitePoint
        const to = supplied && Number.isFinite(supplied.lat) && Number.isFinite(supplied.lng)
            && Math.abs(supplied.lat) <= 90 && Math.abs(supplied.lng) <= 180
            ? supplied : await geocode(destination)
        const outward = await drive(from, to)
        const homeward = await drive(to, from)
        return NextResponse.json({
            oneWay: { km: outward.distance / 1000, hours: outward.duration / 3600 },
            returnTrip: { km: (outward.distance + homeward.distance) / 1000, hours: (outward.duration + homeward.duration) / 3600 },
        })
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not calculate the route." }, { status: 502 })
    }
}
