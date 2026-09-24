import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const mocks = vi.hoisted(() => ({
    rows: [] as Record<string, string>[],
    upload: vi.fn(),
    insert: vi.fn(),
    getUser: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }))
vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        auth: { getUser: mocks.getUser },
        storage: { from: () => ({ upload: mocks.upload, remove: vi.fn().mockResolvedValue({ error: null }) }) },
        from: () => ({
            select: () => ({ eq: () => ({ order: async () => ({ data: [...mocks.rows], error: null }) }) }),
            insert: mocks.insert,
        }),
    }),
}))

import { SiteConstructionSet } from "./site-construction-set"

describe("site drawings upload", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.rows = []
        mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null })
        mocks.upload.mockResolvedValue({ error: null })
        mocks.insert.mockImplementation(async (row) => {
            mocks.rows.push({ id: String(mocks.rows.length + 1), ...row })
            return { error: null }
        })
    })

    it("uploads multiple dropped PDFs and images to the current site and refreshes the list", async () => {
        render(<SiteConstructionSet storeId="site-1" />)
        const area = await screen.findByLabelText("Drawings upload area")
        expect(screen.getByRole("button", { name: "Add Drawing" })).toBeInTheDocument()

        fireEvent.dragEnter(area, { dataTransfer: { types: ["Files"] } })
        expect(screen.getByText("Drop PDF or image drawings here")).toBeInTheDocument()
        fireEvent.drop(area, { dataTransfer: { files: [
            new File(["pdf"], "Plan.pdf", { type: "application/pdf" }),
            new File(["image"], "Plan.png", { type: "image/png" }),
        ] } })

        await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(2))
        expect(mocks.insert).toHaveBeenNthCalledWith(1, expect.objectContaining({ store_id: "site-1", drawing_number: "Plan", drawing_title: "Plan", uploaded_by: "user-1" }))
        expect(mocks.insert).toHaveBeenNthCalledWith(2, expect.objectContaining({ store_id: "site-1", drawing_number: "Plan-2", drawing_title: "Plan" }))
        expect(mocks.upload).toHaveBeenNthCalledWith(2, expect.stringMatching(/^site-1\//), expect.any(File), { contentType: "image/png", upsert: false })
        await waitFor(() => expect(screen.getAllByText("Plan-2")).toHaveLength(1))
        expect(mocks.success).toHaveBeenCalledWith("2 drawings added.")
    })

    it("rejects unsupported files without uploading them", async () => {
        render(<SiteConstructionSet storeId="site-1" />)
        const area = await screen.findByLabelText("Drawings upload area")
        fireEvent.drop(area, { dataTransfer: { files: [new File(["text"], "notes.txt", { type: "text/plain" })] } })

        expect(mocks.upload).not.toHaveBeenCalled()
        expect(mocks.error).toHaveBeenCalledWith("1 file skipped. Use PDF, PNG, JPG, WebP or GIF files.")
    })

    it("keeps the Add Drawing form available for a PDF with an entered number and title", async () => {
        render(<SiteConstructionSet storeId="site-1" />)
        await screen.findByLabelText("Drawings upload area")
        fireEvent.click(screen.getByRole("button", { name: "Add Drawing" }))
        fireEvent.change(screen.getByLabelText("Drawing Number"), { target: { value: "A101" } })
        fireEvent.change(screen.getByLabelText("Drawing Title"), { target: { value: "Site Plan" } })
        fireEvent.change(screen.getByLabelText("Drawing File"), { target: { files: [new File(["pdf"], "A101.pdf", { type: "application/pdf" })] } })
        fireEvent.click(screen.getByRole("button", { name: "Add Drawing" }))

        await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
            store_id: "site-1", drawing_number: "A101", drawing_title: "Site Plan", file_name: "A101.pdf",
        })))
        expect(mocks.success).toHaveBeenCalledWith("Drawing added.")
    })
})
