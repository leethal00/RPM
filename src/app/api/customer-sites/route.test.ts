import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ signedIn: true, role: "rodier_admin", requestedClientIds: [] as string[], failLinks: false, paginate: false }))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.signedIn ? { id: "user-1" } : null } }) } }),
}))

vi.mock("@/lib/xero", () => ({
  xeroAdmin: () => ({ from: (table: string) => table === "users"
    ? { select: () => ({ eq: () => ({ single: async () => ({ data: { role: state.role }, error: null }) }) }) }
    : { select: () => ({ eq: (_column: string, id: string) => {
      state.requestedClientIds.push(id)
      return { not: () => ({ order: () => ({ range: async (from: number) => {
        if (table === "customer_site_links" && state.failLinks) return { data: null, error: { message: "unavailable" } }
        if (table === "customer_site_links" && state.paginate && from === 0) return { data: Array.from({ length: 500 }, () => ({ store_id: "site-2" })), error: null }
        return { data: table === "customer_site_links" ? [{ store_id: "site-2" }, { store_id: "linwood" }] : [{ store_id: "site-1" }, { store_id: "site-1" }, { store_id: "site-2" }], error: null }
      } }) }) }
    } }) },
  }),
}))

import { GET } from "./route"

const clientId = "12196d71-6d26-4e8a-995a-a9d349f5bb6d"

describe("linked customer sites", () => {
  beforeEach(() => { state.signedIn = true; state.role = "rodier_admin"; state.requestedClientIds = []; state.failLinks = false; state.paginate = false })

  it("returns unique linked physical sites to a staff administrator", async () => {
    const response = await GET(new Request(`http://localhost/api/customer-sites?clientId=${clientId}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ siteIds: ["site-1", "site-2", "linwood"] })
    expect(state.requestedClientIds).toEqual([clientId, clientId])
  })

  it("does not reveal another customer's sites to a client user", async () => {
    state.role = "client_admin"
    const response = await GET(new Request(`http://localhost/api/customer-sites?clientId=${clientId}`))
    expect(response.status).toBe(403)
    expect(state.requestedClientIds).toEqual([])
  })

  it("loads operational sites beyond the first page without duplicates", async () => {
    state.paginate = true
    const response = await GET(new Request(`http://localhost/api/customer-sites?clientId=${clientId}`))
    expect(await response.json()).toEqual({ siteIds: ["site-1", "site-2", "linwood"] })
  })

  it("reports failed operational links instead of presenting a partial fleet", async () => {
    state.failLinks = true
    const response = await GET(new Request(`http://localhost/api/customer-sites?clientId=${clientId}`))
    expect(response.status).toBe(500)
  })

  it("rejects unsigned requests before reading either link source", async () => {
    state.signedIn = false
    const response = await GET(new Request(`http://localhost/api/customer-sites?clientId=${clientId}`))
    expect(response.status).toBe(401)
    expect(state.requestedClientIds).toEqual([])
  })
})
