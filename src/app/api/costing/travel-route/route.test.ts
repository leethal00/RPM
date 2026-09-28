import { beforeEach, describe, expect, it, vi } from "vitest"

const getUser = vi.fn()
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }))

import { POST } from "./route"

describe("travel road route", () => {
    beforeEach(() => {
        getUser.mockResolvedValue({ data: { user: { id: "user" } } })
        vi.restoreAllMocks()
    })

    it("uses each road direction for the return total", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
            const target = String(url)
            if (target.includes("nominatim")) return Response.json([{ lat: "-36.8", lon: "174.7" }])
            if (target.includes("174.7,-36.8;175,-37")) return Response.json({ code: "Ok", routes: [{ distance: 12500, duration: 1800 }] })
            return Response.json({ code: "Ok", routes: [{ distance: 13000, duration: 1900 }] })
        })
        const response = await POST(new Request("http://localhost/api/costing/travel-route", {
            method: "POST", body: JSON.stringify({ start: "123 Test Street", destination: "456 Site Street", sitePoint: { lat: -37, lng: 175 } }),
        }))
        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result.oneWay).toEqual({ km: 12.5, hours: 0.5 })
        expect(result.returnTrip.km).toBe(25.5)
        expect(result.returnTrip.hours).toBeCloseTo(3700 / 3600)
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it("requires a signed-in user", async () => {
        getUser.mockResolvedValue({ data: { user: null } })
        const fetchMock = vi.spyOn(globalThis, "fetch")
        const response = await POST(new Request("http://localhost/api/costing/travel-route", { method: "POST", body: "{}" }))
        expect(response.status).toBe(401)
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
