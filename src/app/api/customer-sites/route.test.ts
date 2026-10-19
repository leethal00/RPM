import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ signedIn: true, role: "rodier_admin", requestedClientId: "" }))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.signedIn ? { id: "user-1" } : null } }) } }),
}))

vi.mock("@/lib/xero", () => ({
  xeroAdmin: () => ({ from: (table: string) => table === "users"
    ? { select: () => ({ eq: () => ({ single: async () => ({ data: { role: state.role }, error: null }) }) }) }
    : { select: () => ({ eq: (_column: string, id: string) => {
      state.requestedClientId = id
      return { not: async () => ({ data: [{ store_id: "site-1" }, { store_id: "site-1" }, { store_id: "site-2" }], error: null }) }
    } }) },
  }),
}))

import { GET } from "./route"

const clientId = "12196d71-6d26-4e8a-995a-a9d349f5bb6d"

describe("linked customer sites", () => {
  beforeEach(() => { state.signedIn = true; state.role = "rodier_admin"; state.requestedClientId = "" })

  it("returns unique linked physical sites to a staff administrator", async () => {
    const response = await GET(new Request(`http://localhost/api/customer-sites?clientId=${clientId}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ siteIds: ["site-1", "site-2"] })
    expect(state.requestedClientId).toBe(clientId)
  })

  it("does not reveal another customer's sites to a client user", async () => {
    state.role = "client_admin"
    const response = await GET(new Request(`http://localhost/api/customer-sites?clientId=${clientId}`))
    expect(response.status).toBe(403)
    expect(state.requestedClientId).toBe("")
  })
})
