import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mocks = vi.hoisted(() => ({
    push: vi.fn(),
    rpc: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
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
                    order: async () => ({ data: table === "costing_items" ? [{
                        id: "source-id", job_id: "library-id", name: "Road Sign", mode: "build",
                        qty: 2, unit_cost: 0, unit_price: 100, sort: 1,
                    }] : [] }),
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
})
