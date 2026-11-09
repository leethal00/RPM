// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const state = vi.hoisted(() => ({ signedIn: true, role: "rodier_admin", found: true, error: false, update: vi.fn(), filters: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.signedIn ? { id: "admin" } : null } }) },
  from: (table: string) => {
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { state.filters(key, value); return query },
      update: (value: unknown) => { state.update(value); return query },
      single: async () => ({ data: { role: state.role }, error: null }),
      maybeSingle: async () => ({ data: state.found ? { id: "job", status: "cancelled" } : null, error: state.error ? { message: "db error" } : null }),
    }
    if (!["users", "costing_jobs"].includes(table)) throw new Error("Unexpected table")
    return query
  },
}) }))
import { POST } from "./route"

function cancel(body: unknown = { confirmed: true }) {
  return POST(new NextRequest("http://localhost/api/costing/jobs/job/cancel", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "job" }) })
}
beforeEach(() => { state.signedIn = true; state.role = "rodier_admin"; state.found = true; state.error = false; vi.clearAllMocks() })

describe("Cancel job API", () => {
  it("requires sign-in", async () => {
    state.signedIn = false
    expect((await cancel()).status).toBe(401)
    expect(state.update).not.toHaveBeenCalled()
  })
  it.each(["technician", "installer", "mobile_admin", "client_hq"])("rejects %s", async (role) => {
    state.role = role
    expect((await cancel()).status).toBe(403)
    expect(state.update).not.toHaveBeenCalled()
  })
  it.each([{}, { confirmed: false }, { confirmed: true, reason: 5 }, { confirmed: true, reason: "a".repeat(2001) }])("requires valid confirmation and reason: %j", async (body) => {
    expect((await cancel(body)).status).toBe(400)
    expect(state.update).not.toHaveBeenCalled()
  })
  it.each(["super_admin", "rodier_admin"])("allows %s and only updates cancellation fields on an active non-template job", async (role) => {
    state.role = role
    const response = await cancel({ confirmed: true, reason: "  Customer request  " })
    expect(response.status).toBe(200)
    expect(state.update).toHaveBeenCalledExactlyOnceWith({ status: "cancelled", cancellation_reason: "Customer request" })
    expect(state.filters.mock.calls).toEqual(expect.arrayContaining([["id", "job"], ["status", "in_progress"], ["is_template", false]]))
    expect(await response.json()).toMatchObject({ xeroUntouched: true })
  })
  it("allows a blank optional reason", async () => {
    expect((await cancel()).status).toBe(200)
    expect(state.update).toHaveBeenCalledWith({ status: "cancelled", cancellation_reason: null })
  })
  it("reports a status race, repeated cancellation or missing job without claiming success", async () => {
    state.found = false
    expect((await cancel()).status).toBe(409)
  })
  it("reports database failures", async () => {
    state.error = true
    expect((await cancel()).status).toBe(500)
  })
})
