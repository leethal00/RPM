import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/dashboard-layout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }))
vi.mock("@/lib/customer-filter", () => ({ useCustomerFilter: () => ({ clientId: null }) }))
vi.mock("@/lib/hooks/use-supabase-query", () => ({
    useSupabaseQuery: (key: string) => ({
        data: key.includes("-completed-") ? [{ id: "done", title: "Finished job", job_number: "INV-8", status: "complete" }] : Array.from({ length: 20 }, (_, index) => ({
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
})
