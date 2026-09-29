import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const mocks = vi.hoisted(() => ({
    job: { id: "job-id", title: "Test job", is_template: false, status: "in_progress", stores: { address: "12 Queen Street, Auckland" } },
    item: { id: "item-id", name: "Test BOM", mode: "build", qty: 1, build_qty: 1, image_path: null as string | null },
    upload: vi.fn(),
    update: vi.fn(),
    getPublicUrl: vi.fn(),
}))

vi.mock("next/navigation", () => ({
    useParams: () => ({ id: "job-id", itemId: "item-id" }),
    useRouter: () => ({ push: vi.fn() }),
}))
vi.mock("@/components/dashboard-layout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock("@/components/costing/cost-sheet", () => ({ CostSheet: () => <div>Existing BOM cost sheet</div> }))
vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        from: (table: string) => ({
            select: () => ({ eq: () => ({ single: async () => ({ data: table === "costing_jobs" ? mocks.job : mocks.item }) }) }),
            update: mocks.update,
        }),
        storage: { from: () => ({ upload: mocks.upload, getPublicUrl: mocks.getPublicUrl }) },
    }),
}))

import ItemCostSheetPage from "./page"
import { googleMapsDirectionsUrl } from "@/lib/costing/travel-directions"

describe("BOM image upload", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        window.localStorage.clear()
        mocks.job.is_template = false
        mocks.job.stores.address = "12 Queen Street, Auckland"
        mocks.item.name = "Test BOM"
        mocks.item.mode = "build"
        mocks.item.image_path = null
        mocks.upload.mockResolvedValue({ error: null })
        mocks.update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
        mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: "https://example.com/bom.png" } })
    })

    it("shows the upload area after the cost sheet and associates a dropped image with a job BOM", async () => {
        const { container } = render(<ItemCostSheetPage />)
        const dropArea = await screen.findByRole("button", { name: "Drop or paste a BOM image" })
        expect(screen.getByText("Existing BOM cost sheet").compareDocumentPosition(dropArea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

        const file = new File(["image"], "bom.png", { type: "image/png" })
        fireEvent.drop(dropArea, { dataTransfer: { files: [file] } })

        await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith(
            expect.stringMatching(/^boms\/item-id\/.+\.png$/), file, { contentType: "image/png", upsert: false },
        ))
        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ image_path: mocks.upload.mock.calls[0][0] }))
        expect(container).toHaveTextContent("Existing BOM cost sheet")
    })

    it("keeps the existing product upload location and hides the area for simple items", async () => {
        mocks.job.is_template = true
        const { unmount } = render(<ItemCostSheetPage />)
        const file = new File(["image"], "product.png", { type: "image/png" })
        fireEvent.change(await screen.findByLabelText("Choose BOM image"), { target: { files: [file] } })
        await waitFor(() => expect(mocks.upload.mock.calls[0][0]).toMatch(/^products\/item-id\/.+\.png$/))
        unmount()

        mocks.item.mode = "simple"
        render(<ItemCostSheetPage />)
        await screen.findByText("Existing BOM cost sheet")
        expect(screen.queryByRole("button", { name: "Drop or paste a BOM image" })).not.toBeInTheDocument()
    })

    it("accepts a Snipping Tool image from clipboard items anywhere on the page", async () => {
        render(<ItemCostSheetPage />)
        await screen.findByRole("button", { name: "Drop or paste a BOM image" })
        const file = new File(["screenshot"], "image.png", { type: "image/png" })
        const clipboardData = { items: [{ kind: "file", type: "image/png", getAsFile: () => file }], files: [] }

        fireEvent.paste(window, { clipboardData })

        await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith(
            expect.stringMatching(/^boms\/item-id\/.+\.png$/), file, { contentType: "image/png", upsert: false },
        ))
        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ image_path: mocks.upload.mock.calls[0][0] }))
    })

    it("leaves clipboard paste in BOM text fields alone", async () => {
        render(<ItemCostSheetPage />)
        await screen.findByRole("button", { name: "Drop or paste a BOM image" })
        const file = new File(["screenshot"], "image.png", { type: "image/png" })
        fireEvent.paste(screen.getByPlaceholderText("Item name"), {
            clipboardData: { items: [{ kind: "file", type: "image/png", getAsFile: () => file }], files: [] },
        })

        expect(mocks.upload).not.toHaveBeenCalled()
    })
})

describe("Travel and Mileage directions", () => {
    beforeEach(() => {
        window.localStorage.clear()
        mocks.job.is_template = false
        mocks.job.stores.address = "12 Queen Street, Auckland"
        mocks.item.name = "Travel & Mileage"
        mocks.item.mode = "build"
    })

    it("opens driving directions to the selected site and remembers the entered base address", async () => {
        render(<ItemCostSheetPage />)
        const link = await screen.findByRole("link", { name: /Open in Google Maps/ })
        expect(link).toHaveAttribute("href", googleMapsDirectionsUrl("12 Queen Street, Auckland"))
        expect(link).toHaveAttribute("target", "_blank")

        fireEvent.change(screen.getByLabelText("Rodier/base address (optional)"), { target: { value: "5 Base Road, Auckland" } })
        expect(link).toHaveAttribute("href", googleMapsDirectionsUrl("12 Queen Street, Auckland", "5 Base Road, Auckland"))
        expect(window.localStorage.getItem("rpm-travel-base-address")).toBe("5 Base Road, Auckland")
    })

    it("does not offer a directions link without a site address", async () => {
        mocks.job.stores.address = ""
        render(<ItemCostSheetPage />)
        expect(await screen.findByText("No site address on this job")).toBeInTheDocument()
        expect(screen.queryByRole("link", { name: /Open in Google Maps/ })).not.toBeInTheDocument()
    })
})

 describe("Travel panel visibility and placement", () => {
    beforeEach(() => {
        window.localStorage.clear()
        mocks.job.is_template = false
        mocks.job.stores.address = "12 Queen Street, Auckland"
        mocks.item.mode = "build"
        mocks.item.name = "Travel & mileage"
    })

    it("shows the reusable product panel under the title and before the quote description", async () => {
        render(<ItemCostSheetPage />)
        const panel = await screen.findByRole("region", { name: "Travel and mileage directions" })
        expect(screen.getByPlaceholderText("Item name").compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(panel.compareDocumentPosition(screen.getByText("Quote description — customer facing")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(panel).toHaveTextContent("12 Queen Street, Auckland")
    })

    it.each(["Sign fabrication", "Travel signage", "Mileage", "Travel", "Travel & mileage sign", "Electrical"])('hides the panel for %s', async (name) => {
        mocks.item.name = name
        render(<ItemCostSheetPage />)
        await screen.findByText("Existing BOM cost sheet")
        expect(screen.queryByRole("region", { name: "Travel and mileage directions" })).not.toBeInTheDocument()
    })

    it.each(["template", "simple"])("hides the panel for a %s item", async (kind) => {
        mocks.job.is_template = kind === "template"
        mocks.item.mode = kind === "simple" ? "simple" : "build"
        render(<ItemCostSheetPage />)
        await screen.findByText("Existing BOM cost sheet")
        expect(screen.queryByRole("region", { name: "Travel and mileage directions" })).not.toBeInTheDocument()
    })

    it("uses a remembered base address and safely encodes the current site's address", async () => {
        mocks.job.stores.address = "  Unit 2/5 Queen & King St, Māngere #1  "
        window.localStorage.setItem("rpm-travel-base-address", "  5 Base Road, Auckland  ")
        render(<ItemCostSheetPage />)
        const link = await screen.findByRole("link", { name: /Open in Google Maps/ })
        const url = new URL(link.getAttribute("href")!)
        expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/")
        expect(Object.fromEntries(url.searchParams)).toEqual({ api: "1", destination: "Unit 2/5 Queen & King St, Māngere #1", origin: "5 Base Road, Auckland", travelmode: "driving" })
        expect(url.hash).toBe("")
        expect(link).toHaveAttribute("rel", "noopener noreferrer")
    })
})
