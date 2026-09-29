import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

const mockState = vi.hoisted(() => ({ rowCount: 20 }))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/dashboard-layout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }))
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
