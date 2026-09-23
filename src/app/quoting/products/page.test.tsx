import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mocks = vi.hoisted(() => ({
    push: vi.fn(),
    rpc: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    items: [] as Array<Record<string, unknown>>,
    lines: [] as Array<Record<string, unknown>>,
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("@/components/dashboard-layout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }))
vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        rpc: mocks.rpc,
        from: (table: string) => ({
            select: () => ({
                eq: () => ({
                    limit: () => ({ maybeSingle: async () => ({ data: { id: "library-id" } }) }),
                    order: async () => ({ data: table === "costing_items" ? mocks.items : mocks.lines }),
                    then: (resolve: (value: { data: Array<Record<string, unknown>> }) => void) => resolve({ data: mocks.lines }),
                }),
            }),
        }),
    }),
}))

import ProductsPage from "./page"

describe("RPM product copy action", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.rpc.mockResolvedValue({ data: "duplicate-id", error: null })
        mocks.items = [{
            id: "source-id", job_id: "library-id", name: "Road Sign", mode: "build",
            qty: 2, unit_cost: 0, unit_price: 100, sort: 1,
        }]
        mocks.lines = []
    })

    it("duplicates the selected product and opens the returned copy in Edit", async () => {
        const user = userEvent.setup()
        render(<ProductsPage />)

        await user.click(await screen.findByRole("button", { name: "Copy" }))

        await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("duplicate_library_product", { src_item: "source-id" }))
        expect(mocks.push).toHaveBeenCalledWith("/quoting/library-id/item/duplicate-id")
        expect(mocks.toastSuccess).toHaveBeenCalled()
    })

    it("keeps the source page open when duplication fails", async () => {
        mocks.rpc.mockResolvedValue({ data: null, error: { message: "Copy failed" } })
        const user = userEvent.setup()
        render(<ProductsPage />)

        await user.click(await screen.findByRole("button", { name: "Copy" }))

        await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Could not copy product: Copy failed"))
        expect(mocks.push).not.toHaveBeenCalled()
    })

    it("sorts by calculated cost and combines type and catalogue search filters", async () => {
        mocks.items = [
            { id: "simple-id", job_id: "library-id", name: "Alpha Sign", sign_code: "S40", mode: "simple", unit_cost: 10, unit_price: 20, sort: 1 },
            { id: "build-id", job_id: "library-id", name: "Beta Panel", mode: "build", unit_cost: 0, unit_price: 0, sort: 2 },
        ]
        mocks.lines = [{ item_id: "build-id", qty: 1, unit_cost: 40, markup: 0, unit_sell_override: null }]
        const user = userEvent.setup()
        render(<ProductsPage />)

        await screen.findByText("Beta Panel")
        await user.selectOptions(screen.getByRole("combobox", { name: "Sort RPM products" }), "cost-desc")
        expect(screen.getAllByRole("row")[1]).toHaveTextContent("Beta Panel")

        await user.selectOptions(screen.getByRole("combobox", { name: "Filter RPM products by type" }), "simple")
        expect(screen.getByText("Alpha Sign")).toBeInTheDocument()
        expect(screen.queryByText("Beta Panel")).not.toBeInTheDocument()

        await user.type(screen.getByRole("textbox", { name: "Search RPM products" }), "S40")
        expect(screen.getByText("Alpha Sign")).toBeInTheDocument()
        await user.clear(screen.getByRole("textbox", { name: "Search RPM products" }))
        await user.type(screen.getByRole("textbox", { name: "Search RPM products" }), "missing")
        expect(screen.getByText("No RPM products match your search or filter.")).toBeInTheDocument()
    })
})
