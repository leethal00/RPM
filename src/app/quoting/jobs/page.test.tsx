import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

const mockState = vi.hoisted(() => ({ rowCount: 20 }))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/dashboard-layout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({
    from: (table: string) => ({ select: () => ({ order: async () => ({ data: table === "clients" ? [
        { id: "coates", name: "Coates Signco" }, { id: "mcd", name: "McDonald's" },
    ] : [
        { id: "coates-site", name: "Warehouse", client_id: "coates", address: "Auckland" },
        { id: "mcd-site", name: "Invercargill", client_id: "mcd", address: "Dee Street" },
        { id: "mcd-site-2", name: "Invercargill", client_id: "mcd", address: "South City" },
    ] }) }) }),
}) }))
vi.mock("@/lib/customer-filter", () => ({ useCustomerFilter: () => ({ clientId: null }) }))
vi.mock("@/lib/hooks/use-supabase-query", () => ({
    useSupabaseQuery: (key: string) => ({
        data: key.includes("-completed-") ? [{ id: "done", title: "Finished job", job_number: "INV-8", status: "complete" }] : Array.from({ length: mockState.rowCount }, (_, index) => ({
            id: String(index),
            title: `Job ${index}`,
            job_number: `INV-${index === 0 ? 9 : index === 1 ? 100 : index === 2 ? 10 : 100 + index}`,
            status: "in_progress",
        })),
        isLoading: false,
        mutate: vi.fn(),
    }),
}))

import ActiveJobsPage from "./page"

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe("Xero import site selection", () => {
    async function openInvoice(contactName = "Coates Signco") {
        const previewResponse = { ok: true, json: async () => ({ invoice: {
            invoiceId: "xero-1", invoiceNumber: "INV-7607", reference: "Hanging Bar Replacement", contactName,
            date: "2026-11-30", status: "DRAFT", total: 1002.17, lines: [],
        } }) }
        const fetchMock = vi.fn().mockResolvedValue(previewResponse).mockResolvedValueOnce(previewResponse)
            .mockResolvedValueOnce({ ok: true, json: async () => ({ jobId: "created-job" }) })
        vi.stubGlobal("fetch", fetchMock)
        render(<ActiveJobsPage />)
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Import from Xero" })))
        fireEvent.change(screen.getByPlaceholderText("Invoice number, e.g. INV-7569"), { target: { value: "INV-7607" } })
        fireEvent.click(screen.getByRole("button", { name: "Find invoice" }))
        await screen.findByRole("checkbox", { name: "Show all sites" })
        return fetchMock
    }

    it("defaults to client sites, searches all owners with the override, and submits the chosen site", async () => {
        const fetchMock = await openInvoice()
        const site = screen.getByRole("combobox", { name: "Site" })
        expect(screen.getByRole("checkbox", { name: "Show all sites" })).not.toBeChecked()
        expect(within(site).getByRole("option", { name: "Warehouse" })).toBeInTheDocument()
        expect(within(site).queryByRole("option", { name: /McDonald/ })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole("checkbox", { name: "Show all sites" }))
        fireEvent.change(screen.getByRole("textbox", { name: "Search sites" }), { target: { value: "mcdonald" } })
        expect(within(site).getByRole("option", { name: "McDonald's — Invercargill · Dee Street" })).toBeInTheDocument()
        expect(within(site).queryByRole("option", { name: /Warehouse/ })).not.toBeInTheDocument()
        fireEvent.change(site, { target: { value: "mcd-site" } })
        fireEvent.change(screen.getByRole("textbox", { name: "Search sites" }), { target: { value: "South City" } })
        expect(site).toHaveValue("mcd-site")
        fireEvent.click(screen.getByRole("button", { name: "Import as Job" }))
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
            clientId: "coates", storeId: "mcd-site", showAllSites: true,
        })
    })

    it("clears foreign selections when the override is disabled and resets on reopening", async () => {
        const fetchMock = await openInvoice()
        const toggle = screen.getByRole("checkbox", { name: "Show all sites" })
        const site = screen.getByRole("combobox", { name: "Site" })
        fireEvent.click(toggle)
        fireEvent.change(site, { target: { value: "mcd-site" } })
        fireEvent.click(toggle)
        expect(site).toHaveValue("none")
        fireEvent.change(site, { target: { value: "coates-site" } })
        fireEvent.click(toggle)
        fireEvent.click(toggle)
        expect(site).toHaveValue("coates-site")
        fireEvent.click(toggle)
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
        fireEvent.click(screen.getByRole("button", { name: "Import from Xero" }))
        const previewResponse = await fetchMock.mock.results[0].value
        fetchMock.mockReset().mockResolvedValue(previewResponse)
        fireEvent.click(screen.getByRole("button", { name: "Find invoice" }))
        expect(await screen.findByRole("checkbox", { name: "Show all sites" })).not.toBeChecked()
        expect(screen.getByRole("combobox", { name: "Site" })).toHaveValue("none")
    })

    it("adds multiple sites across searches and sends them with the chosen client visibility", async () => {
        const fetchMock = await openInvoice()
        fireEvent.click(screen.getByRole("checkbox", { name: "Show all sites" }))
        fireEvent.click(screen.getByRole("checkbox", { name: "Multiple sites" }))
        const site = screen.getByRole("combobox", { name: "Site" })
        fireEvent.change(site, { target: { value: "mcd-site" } })
        fireEvent.change(screen.getByRole("textbox", { name: "Search sites" }), { target: { value: "south city" } })
        fireEvent.change(site, { target: { value: "mcd-site-2" } })
        expect(within(screen.getByRole("list", { name: "Selected sites" })).getAllByRole("listitem")).toHaveLength(2)
        expect(screen.getByText("Primary site")).toBeInTheDocument()
        expect(screen.getByRole("checkbox", { name: "Show to client" })).not.toBeChecked()
        fireEvent.click(screen.getByRole("checkbox", { name: "Show to client" }))
        fireEvent.click(screen.getByRole("button", { name: "Import as Job" }))
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ clientId: "coates", storeIds: ["mcd-site", "mcd-site-2"], visibleToClient: true })
    })

    it("reviews a fetched batch one job at a time and resets site selections for the next invoice", async () => {
        const fetchMock = await openInvoice()
        const first = { invoiceId: "one", invoiceNumber: "INV-1", reference: "First job", contactName: "Coates Signco", total: 10, lines: [] }
        const second = { ...first, invoiceId: "two", invoiceNumber: "INV-2", reference: "Second job" }
        fetchMock.mockReset().mockResolvedValueOnce({ ok: true, json: async () => ({ invoices: [first, second], warnings: [] }) })
            .mockResolvedValue({ ok: true, json: async () => ({ jobId: "job-created" }) })
        fireEvent.change(screen.getByPlaceholderText("Invoice number, e.g. INV-7569"), { target: { value: "INV-1,INV-2" } })
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Find invoice" })))
        expect(screen.getByText("1 more invoice to review after this job.")).toBeInTheDocument()
        fireEvent.click(screen.getByRole("checkbox", { name: "Show all sites" }))
        fireEvent.change(screen.getByRole("combobox", { name: "Site" }), { target: { value: "mcd-site" } })
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Import as Job" })))
        expect(screen.getByDisplayValue("Second job")).toBeInTheDocument()
        expect(screen.getByRole("combobox", { name: "Site" })).toHaveValue("none")
        expect(screen.getByRole("checkbox", { name: "Show all sites" })).not.toBeChecked()
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ invoiceNumber: "INV-1", storeIds: ["mcd-site"] })
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Import as Job" })))
        expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({ invoiceNumber: "INV-2", storeIds: [] })
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it("keeps selected sites and client visibility on throttling and permits retry after the countdown", async () => {
        const fetchMock = await openInvoice()
        fireEvent.click(screen.getByRole("checkbox", { name: "Show all sites" }))
        fireEvent.change(screen.getByRole("combobox", { name: "Site" }), { target: { value: "mcd-site" } })
        fireEvent.click(screen.getByRole("checkbox", { name: "Show to client" }))
        fetchMock.mockReset().mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers({ "Retry-After": "2" }), json: async () => ({ error: "Xero is temporarily limiting requests." }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ jobId: "created-job" }) })
        vi.useFakeTimers()
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Import as Job" })))
        expect(screen.getByText(/Retry available in 0m 2s/)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Import as Job" })).toBeDisabled()
        expect(screen.getByRole("button", { name: "Find invoice" })).toBeDisabled()
        fireEvent.keyDown(screen.getByPlaceholderText("Invoice number, e.g. INV-7569"), { key: "Enter" })
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(screen.getByRole("combobox", { name: "Site" })).toHaveValue("mcd-site")
        expect(screen.getByRole("checkbox", { name: "Show to client" })).toBeChecked()
        await act(async () => { vi.advanceTimersByTime(2000) })
        expect(screen.getByRole("button", { name: "Import as Job" })).toBeEnabled()
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Import as Job" })))
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ storeIds: ["mcd-site"], visibleToClient: true })
    })

    it("blocks lookup retries including Enter and reopening during Xero's wait", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, headers: new Headers({ "Retry-After": "90" }), json: async () => ({ error: "Xero is temporarily limiting requests." }) }))
        render(<ActiveJobsPage />)
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Import from Xero" })))
        fireEvent.change(screen.getByPlaceholderText("Invoice number, e.g. INV-7569"), { target: { value: "INV-7611" } })
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Find invoice" })))
        expect(screen.getByText(/Retry available in 1m 30s/)).toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Import from Xero" })))
        fireEvent.keyDown(screen.getByPlaceholderText("Invoice number, e.g. INV-7569"), { key: "Enter" })
        expect(fetch).toHaveBeenCalledTimes(1)
        expect(screen.getByRole("button", { name: "Find invoice" })).toBeDisabled()
    })

    it("removes a selected site and clears foreign sites when the override is switched off", async () => {
        await openInvoice()
        fireEvent.click(screen.getByRole("checkbox", { name: "Show all sites" }))
        fireEvent.click(screen.getByRole("checkbox", { name: "Multiple sites" }))
        const site = screen.getByRole("combobox", { name: "Site" })
        fireEvent.change(site, { target: { value: "mcd-site" } })
        fireEvent.change(site, { target: { value: "mcd-site-2" } })
        fireEvent.click(screen.getByRole("button", { name: /Remove .*Dee Street/ }))
        expect(within(screen.getByRole("list", { name: "Selected sites" })).getAllByRole("listitem")).toHaveLength(1)
        fireEvent.click(screen.getByRole("checkbox", { name: "Show all sites" }))
        expect(screen.queryByRole("list", { name: "Selected sites" })).not.toBeInTheDocument()
    })

    it.each(["mcdonalds inver", "McDonald's Inver", "McDonald’s Inver", "inver mcdonalds", "mcdonalds — inver", "mcdonalds dee"])("finds sites by owner and partial site/address words: %s", async (search) => {
        await openInvoice()
        fireEvent.click(screen.getByRole("checkbox", { name: "Show all sites" }))
        fireEvent.change(screen.getByRole("textbox", { name: "Search sites" }), { target: { value: search } })
        const site = screen.getByRole("combobox", { name: "Site" })
        expect(within(site).getByRole("option", { name: "McDonald's — Invercargill · Dee Street" })).toBeInTheDocument()
        expect(within(site).queryByRole("option", { name: /Warehouse/ })).not.toBeInTheDocument()
        expect(screen.queryByText("No sites match your search.")).not.toBeInTheDocument()
    })

    it("requires all search words to match the same site", async () => {
        await openInvoice()
        fireEvent.click(screen.getByRole("checkbox", { name: "Show all sites" }))
        fireEvent.change(screen.getByRole("textbox", { name: "Search sites" }), { target: { value: "mcdonalds auckland" } })
        expect(within(screen.getByRole("combobox", { name: "Site" })).getAllByRole("option")).toHaveLength(1)
        expect(screen.getByText("No sites match your search.")).toBeInTheDocument()
    })

    it("allows a site override while keeping automatic Xero customer resolution", async () => {
        const fetchMock = await openInvoice("New Xero customer")
        const site = screen.getByRole("combobox", { name: "Site" })
        expect(site).toBeDisabled()
        fireEvent.click(screen.getByRole("checkbox", { name: "Show all sites" }))
        expect(site).toBeEnabled()
        fireEvent.change(site, { target: { value: "mcd-site" } })
        fireEvent.click(screen.getByRole("button", { name: "Import as Job" }))
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ clientId: null, storeId: "mcd-site", showAllSites: true })
    })
})

describe("Active Jobs list", () => {
    beforeEach(() => { mockState.rowCount = 20 })

    it("starts with numeric Job # order and keeps a sticky header over 20 scrolling rows", () => {
        render(<ActiveJobsPage />)

        const rows = screen.getAllByRole("row")
        expect(rows).toHaveLength(21)
        expect(rows[1]).toHaveTextContent("INV-119")
        expect(rows.at(-1)).toHaveTextContent("INV-9")

        const table = screen.getByRole("table")
        expect(table.parentElement).toHaveClass("overflow-auto", "lg:flex-1")
        expect(screen.getByRole("columnheader", { name: /Job #/ })).toHaveClass("sticky", "top-0")
        expect(table.querySelectorAll("col")).toHaveLength(6)
        expect(rows[1].querySelectorAll("td")).toHaveLength(6)
        expect(screen.getByRole("button", { name: /Reset columns/ })).toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: /Job #/ }))
        expect(screen.getAllByRole("row")[1]).toHaveTextContent("INV-9")
    })

    it("keeps the Completed Jobs tab and restores the default order on return", () => {
        render(<ActiveJobsPage />)
        fireEvent.click(screen.getByRole("button", { name: /Job #/ }))
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Completed Jobs" }), { button: 0 })
        expect(screen.getByText("Finished job")).toBeInTheDocument()
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Active Jobs" }), { button: 0 })
        expect(screen.getAllByRole("row")[1]).toHaveTextContent("INV-119")
    })

    it("prints every matching job in the current sort order, beyond the visible page", () => {
        mockState.rowCount = 25
        const print = vi.spyOn(window, "print").mockImplementation(() => {})
        render(<ActiveJobsPage />)

        expect(screen.getAllByRole("row")).toHaveLength(21)
        fireEvent.click(screen.getByRole("button", { name: "Print report" }))

        const report = document.getElementById("rpm-jobs-print-report")
        expect(print).toHaveBeenCalledOnce()
        expect(report).not.toBeNull()
        const reportRows = report!.querySelectorAll("tbody tr")
        expect(reportRows).toHaveLength(25)
        expect(reportRows[0]).toHaveTextContent("INV-124")
        expect(reportRows[24]).toHaveTextContent("INV-9")
        expect(report).toHaveTextContent("25 jobs")

        act(() => window.dispatchEvent(new Event("afterprint")))
        expect(document.getElementById("rpm-jobs-print-report")).toBeNull()
        print.mockRestore()
    })

    it("applies the current search to the report", () => {
        const print = vi.spyOn(window, "print").mockImplementation(() => {})
        render(<ActiveJobsPage />)
        fireEvent.change(screen.getByPlaceholderText("Search active jobs…"), { target: { value: "Job 19" } })
        fireEvent.click(screen.getByRole("button", { name: "Print report" }))
        const report = document.getElementById("rpm-jobs-print-report")
        expect(report?.querySelectorAll("tbody tr")).toHaveLength(1)
        expect(report).toHaveTextContent("Search: Job 19")
        act(() => window.dispatchEvent(new Event("afterprint")))
        print.mockRestore()
    })
})
