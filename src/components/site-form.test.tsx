import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { SiteForm } from "./site-form"
import type { Store } from "@/types/database"
import { formatDayHours, formatHoursShort, parseHours } from "@/lib/hours"
import { searchSitePlaces } from "@/lib/site-address"

vi.mock("@/lib/site-address", async original => ({ ...await original<typeof import("@/lib/site-address")>(), searchSitePlaces: vi.fn() }))

const mocks = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn(), existingSites: [] as Array<{ id: string; name: string; address: string; client_id: string }> }))

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        from: (table: string) => ({
            select: () => ({
                order: () => Promise.resolve({ data: table === "clients" ? [{ id: "11111111-1111-4111-8111-111111111111", name: "Client" }] : [] }),
                ilike: () => Promise.resolve({ data: mocks.existingSites, error: null }),
                eq: () => ({
                    order: () => Promise.resolve({ data: [] }),
                    then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
                }),
            }),
            insert: (payload: unknown) => {
                mocks.insert(table, payload)
                return { select: () => ({ single: () => Promise.resolve({ data: { id: "site-1" }, error: null }) }), then: (resolve: (value: unknown) => void) => resolve({ error: null }) }
            },
            update: (payload: unknown) => {
                mocks.update(table, payload)
                return { eq: () => Promise.resolve({ error: null }) }
            },
            delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }),
    }),
}))

beforeEach(() => {
    mocks.insert.mockClear()
    mocks.update.mockClear()
    mocks.existingSites = []
})
afterEach(cleanup)

it("creates a site with Saturday and Sunday explicitly closed, then loads and edits those hours", async () => {
    const onSuccess = vi.fn()
    const { unmount } = render(<SiteForm initialClientId="11111111-1111-4111-8111-111111111111" onSuccess={onSuccess} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Site Name/), { target: { value: "Test site" } })
    fireEvent.click(screen.getByRole("button", { name: /Enter address manually/ }))
    fireEvent.change(screen.getByLabelText(/Site Address/), { target: { value: "1 Test Street" } })
    fireEvent.click(screen.getByRole("button", { name: "Specific days" }))
    fireEvent.click(screen.getByLabelText("Saturday closed"))
    fireEvent.click(screen.getByLabelText("Sunday closed"))
    expect(screen.getByLabelText("Saturday open")).toBeDisabled()
    expect(screen.getByLabelText("Sunday close")).toBeDisabled()
    expect(screen.getByLabelText("Friday open")).toBeEnabled()
    fireEvent.submit(screen.getByRole("button", { name: "Add Site" }).closest("form")!)
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith("stores", expect.objectContaining({ hours_of_operation: expect.any(String) })))
    const created = mocks.insert.mock.calls.find(call => call[0] === "stores")![1]
    const saved = parseHours(created.hours_of_operation)
    expect(saved).toMatchObject({ type: "weekly", days: { Friday: { start: "09:00", end: "17:00" }, Saturday: { closed: true }, Sunday: { closed: true } } })
    expect(formatHoursShort(created.hours_of_operation)).toContain("Sat Closed · Sun Closed")
    expect(onSuccess).toHaveBeenCalledWith("site-1")
    unmount()

    const site = { id: "site-1", client_id: "11111111-1111-4111-8111-111111111111", name: "Test site", address: "1 Test Street", hours_of_operation: created.hours_of_operation } as Store
    render(<SiteForm site={site} onSuccess={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText("Saturday closed")).toBeChecked()
    expect(screen.getByLabelText("Sunday closed")).toBeChecked()
    fireEvent.click(screen.getByLabelText("Saturday closed"))
    expect(screen.getByLabelText("Saturday open")).toBeEnabled()
    fireEvent.change(screen.getByLabelText("Saturday open"), { target: { value: "10:00" } })
    fireEvent.submit(screen.getByRole("button", { name: "Save Changes" }).closest("form")!)
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("stores", expect.objectContaining({ hours_of_operation: expect.any(String) })))
    const updated = parseHours(mocks.update.mock.calls[0][1].hours_of_operation)
    expect(updated).toMatchObject({ type: "weekly", days: { Saturday: { start: "10:00", end: "17:00" }, Sunday: { closed: true } } })
    fireEvent.click(screen.getByRole("button", { name: "All days same" }))
    fireEvent.submit(screen.getByRole("button", { name: "Save Changes" }).closest("form")!)
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2))
    expect(parseHours(mocks.update.mock.calls[1][1].hours_of_operation)).toMatchObject({ type: "daily", hours: { start: "09:00", end: "17:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Specific days" }))
    expect(screen.getByLabelText("Sunday closed")).toBeChecked()
})

it("keeps legacy weekly hours and all-days-same display compatible", () => {
    const legacy = JSON.stringify({ type: "weekly", days: { Saturday: { start: "09:00", end: "17:00" } } })
    expect(parseHours(legacy)).toMatchObject({ type: "weekly" })
    expect(formatHoursShort(legacy)).toBe("Weekly schedule")
    expect(formatDayHours({ closed: true })).toBe("Closed")
    expect(formatHoursShort(JSON.stringify({ type: "daily", hours: { start: "08:00", end: "17:00" } }))).toBe("08:00–17:00")
    expect(formatHoursShort(JSON.stringify({ type: "always" }))).toBe("24 hours")
})

it("reuses a physical site owned by another customer during Xero import", async () => {
    mocks.existingSites = [{ id: "parent-site", name: "Wanaka, 3 Parks", address: "3 Parks, Wanaka", client_id: "parent-client" }]
    const onSuccess = vi.fn()
    render(<SiteForm initialClientId="11111111-1111-4111-8111-111111111111" initialClientName="McDonalds Wanaka, 3 Parks" initialSiteName="McDonalds Wanaka, 3 Parks" checkAllClientsForDuplicates onSuccess={onSuccess} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: /Enter address manually/ }))
    fireEvent.change(screen.getByLabelText(/Site Address/), { target: { value: "3 Parks, Wanaka" } })
    fireEvent.submit(screen.getByRole("button", { name: "Add Site" }).closest("form")!)
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("parent-site"))
    expect(mocks.insert).not.toHaveBeenCalledWith("stores", expect.anything())
})

it("saves a Google business selection from the locked-client modal with structured address and persistent place ID", async () => {
    vi.mocked(searchSitePlaces).mockResolvedValue([{
        id: "timezone", name: "TimeZone Sylvia Park", address: "286 Mount Wellington Highway, Auckland 1060, New Zealand",
        locality: "Mount Wellington, Auckland", lat: -36.915, lng: 174.842, selectable: true,
        address_details: { street_number: "286", street: "Mount Wellington Highway", suburb: "Mount Wellington", locality: "Auckland", region: "Auckland", postal_code: "1060", country_code: "NZ", place_id: "timezone" },
    }])
    const done = vi.fn()
    render(<SiteForm initialClientId="11111111-1111-4111-8111-111111111111" lockClient checkAllClientsForDuplicates onSuccess={done} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Site Name/), { target: { value: "TimeZone Sylvia Park" } })
    fireEvent.change(screen.getByLabelText(/Site Address/), { target: { value: "Timezone Sylvia Park" } })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    fireEvent.click(await screen.findByRole("button", { name: /TimeZone Sylvia Park/ }))
    fireEvent.submit(screen.getByRole("button", { name: "Add Site" }).closest("form")!)
    await waitFor(() => expect(done).toHaveBeenCalledWith("site-1"))
    expect(mocks.insert).toHaveBeenCalledWith("stores", expect.objectContaining({
        client_id: "11111111-1111-4111-8111-111111111111", address: "286 Mount Wellington Highway, Auckland 1060, New Zealand",
        lat: null, lng: null, location_approximate: false,
        address_details: expect.objectContaining({ place_id: "timezone", street_number: "286", locality: "Auckland" }),
    }))
})

it("leaves existing address and approximate pin unchanged until an explicit save", async () => {
    const site = { id: "site-1", client_id: "11111111-1111-4111-8111-111111111111", name: "Existing", address: "Existing address", lat: -36.85, lng: 174.7, location_approximate: true } as Store
    render(<SiteForm site={site} onSuccess={vi.fn()} onCancel={vi.fn()} />)
    expect(mocks.update).not.toHaveBeenCalled()
    fireEvent.submit(screen.getByRole("button", { name: "Save Changes" }).closest("form")!)
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("stores", expect.objectContaining({ address: site.address, lat: site.lat, lng: site.lng, location_approximate: true })))
})

it("does not save an unselected business-name query", async () => {
    render(<SiteForm initialClientId="11111111-1111-4111-8111-111111111111" initialSiteName="Timezone" onSuccess={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Site Address/), { target: { value: "Timezone Sylvia Park" } })
    fireEvent.submit(screen.getByRole("button", { name: "Add Site" }).closest("form")!)
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Site" })).toBeEnabled())
    expect(mocks.insert).not.toHaveBeenCalledWith("stores", expect.anything())
})
