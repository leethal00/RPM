import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    suppliers: [] as object[],
    materials: [] as { supplier: string | null }[],
    update: vi.fn(),
    remove: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
}))

vi.mock("@/components/dashboard-layout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock("@/components/page-shell", () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock("@/components/page-header", () => ({ PageHeader: ({ title, actions }: { title: string; actions: React.ReactNode }) => <header><h1>{title}</h1>{actions}</header> }))
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({
    from: (table: string) => {
        let columns = "*"
        let id = ""
        let action = "select"
        let payload: object = {}
        const query = {
            select: (next: string) => { columns = next; return query },
            order: () => table === "supplier_directory" && action === "select"
                ? Promise.resolve({ data: mocks.suppliers, error: null }) : query,
            eq: (_column: string, value: string | boolean) => { if (typeof value === "string") id = value; return query },
            range: async (from: number, to: number) => ({
                data: columns === "supplier" ? mocks.materials.slice(from, to + 1) : [], error: null,
            }),
            update: (next: object) => { action = "update"; payload = next; return query },
            delete: () => { action = "delete"; return query },
            insert: (next: object) => { action = "insert"; payload = next; return query },
            maybeSingle: async () => action === "delete" ? mocks.remove(id) : mocks.update(id, payload),
        }
        return query
    },
}) }))

import SuppliersPage from "./page"

const rod = {
    id: "rod", name: "Rod", aliases: [], import_identifiers: [], account_number: null,
    contact_name: null, phone: null, email: null, website: null, ordering_email: null,
    physical_address: null, postal_address: null, notes: null, active: true,
}

describe("supplier editing", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.suppliers = [rod]
        mocks.materials = []
        mocks.update.mockResolvedValue({ data: { id: "rod" }, error: null })
        mocks.remove.mockResolvedValue({ data: { id: "rod" }, error: null })
    })

    it("opens the editor and confirms a saved supplier row", async () => {
        render(<SuppliersPage />)
        fireEvent.click(await screen.findByRole("button", { name: "Edit Rod" }))
        expect(screen.getByText("Edit Rod")).toBeInTheDocument()
        fireEvent.change(screen.getByDisplayValue("Rod"), { target: { value: "Rod Supplies" } })
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("rod", expect.objectContaining({ name: "Rod Supplies" })))
        await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Supplier updated"))
    })

    it("reports when an edit changed no row", async () => {
        mocks.update.mockResolvedValue({ data: null, error: null })
        render(<SuppliersPage />)
        fireEvent.click(await screen.findByRole("button", { name: "Edit Rod" }))
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("No supplier was saved")))
        expect(mocks.success).not.toHaveBeenCalled()
    })

    it("blocks deletion when catalogue items still name the supplier", async () => {
        mocks.materials = [{ supplier: "ROD" }]
        render(<SuppliersPage />)
        fireEvent.click(await screen.findByRole("button", { name: "Edit Rod" }))
        fireEvent.click(screen.getByRole("button", { name: "Delete supplier" }))
        fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete supplier" }))

        expect(await screen.findByRole("alert")).toHaveTextContent("1 catalogue item is linked")
        expect(mocks.remove).not.toHaveBeenCalled()
    })

    it("deletes an unlinked supplier after confirmation", async () => {
        render(<SuppliersPage />)
        fireEvent.click(await screen.findByRole("button", { name: "Edit Rod" }))
        fireEvent.click(screen.getByRole("button", { name: "Delete supplier" }))
        fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete supplier" }))

        await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("rod"))
        await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Rod deleted"))
    })
})
