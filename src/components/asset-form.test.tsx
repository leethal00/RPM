import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import type { Asset } from "@/types/database"

const mocks = vi.hoisted(() => ({
    isAdmin: true, insertType: vi.fn(),
    insertAsset: vi.fn(), updateAsset: vi.fn(), insertPhoto: vi.fn(),
    upload: vi.fn(), remove: vi.fn(), prepare: vi.fn(), error: vi.fn(),
    success: vi.fn(), gallery: vi.fn(),
}))
const typeId = "55bd228b-3d2e-45b1-91e7-aa5cc466687b"
const bucket = {
    upload: mocks.upload, remove: mocks.remove,
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/asset-photos/${path}` } }),
}
const client = {
    storage: { from: (name: string) => { expect(name).toBe("asset-photos"); return bucket } },
    from: (table: string) => {
        if (table === "asset_types") return {
            select: () => ({ order: async () => ({ data: [{ id: typeId, label: "Sign" }] }) }),
            insert: (payload: unknown) => ({ select: () => ({ single: () => mocks.insertType(payload) }) }),
        }
        if (table === "asset_photos") return { insert: mocks.insertPhoto }
        return {
            insert: (payload: unknown) => ({ select: () => ({ single: () => mocks.insertAsset(payload) }) }),
            update: (payload: unknown) => ({ eq: () => mocks.updateAsset(payload) }),
        }
    },
}
vi.mock("@/lib/supabase/client", () => ({ createClient: () => client }))
vi.mock("@/lib/customer-filter", () => ({ useCustomerFilter: () => ({ isAdmin: mocks.isAdmin }) }))
vi.mock("@/lib/image-prep", () => ({ ensureRenderable: mocks.prepare, isHeic: (file: File) => /\.heic$/i.test(file.name) }))
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }))
vi.mock("./asset-photo-gallery", () => ({ AssetPhotoGallery: ({ assetId }: { assetId: string }) => { mocks.gallery(assetId); return <div>Existing gallery</div> } }))
// Native selects keep these workflow tests focused on saving rather than Radix pointer events.
vi.mock("@/components/ui/select", () => ({
    Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: ReactNode }) => <select aria-label={value === "external" || value === "internal" ? "Group" : value === "active" ? "Status" : "Type"} value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
    SelectTrigger: () => null, SelectValue: () => null,
    SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}))

import { AssetForm } from "./asset-form"

function show(asset?: Asset) {
    const success = vi.fn(), cancel = vi.fn(), busy = vi.fn()
    const view = render(<AssetForm storeId="site-1" asset={asset} onSuccess={success} onCancel={cancel} onBusyChange={busy} />)
    return { ...view, success, cancel, busy }
}
async function valid() {
    await screen.findByText("Sign")
    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), { target: { value: typeId } })
}
async function selectPhotos(...names: string[]) {
    fireEvent.change(screen.getByLabelText("Asset photos (optional)"), { target: { files: names.map(name => new File(["photo"], name, { type: "image/jpeg" })) } })
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Asset" })).toBeEnabled())
}

describe("new asset photos", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.isAdmin = true
        mocks.insertType.mockResolvedValue({ data: { id: "31f56c1a-444b-4dd7-a6ef-7142ac844602", label: "Digital menu board", icon_name: "Package" }, error: null })
        vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
        mocks.insertAsset.mockResolvedValue({ data: { id: "new-asset" }, error: null })
        mocks.updateAsset.mockResolvedValue({ error: null })
        mocks.insertPhoto.mockResolvedValue({ error: null })
        mocks.upload.mockResolvedValue({ error: null })
        mocks.remove.mockResolvedValue({ error: null })
        mocks.prepare.mockImplementation(async (file: File) => file)
        vi.stubGlobal("URL", class extends URL {
            static createObjectURL = vi.fn(() => `blob:${Math.random()}`)
            static revokeObjectURL = vi.fn()
        })
    })

    it("previews multiple files, removes one, then creates and associates the remaining photo before closing", async () => {
        const view = show()
        await valid()
        await selectPhotos("one.jpg", "two.jpg")
        expect(screen.getAllByRole("img")).toHaveLength(2)
        expect(mocks.upload).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole("button", { name: "Remove one.jpg" }))
        expect(URL.revokeObjectURL).toHaveBeenCalled()
        fireEvent.click(screen.getByLabelText("Service-team only"))
        let finish!: (result: { error: null }) => void
        mocks.upload.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
        fireEvent.click(screen.getByRole("button", { name: "Add Asset" }))
        await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1))
        expect(view.success).not.toHaveBeenCalled()
        expect(screen.getByRole("button", { name: "Close (asset already created)" })).toBeDisabled()
        expect(mocks.insertAsset).toHaveBeenCalledWith(expect.objectContaining({ store_id: "site-1", asset_type_id: typeId }))
        finish({ error: null })
        await waitFor(() => expect(view.success).toHaveBeenCalledTimes(1))
        expect(mocks.upload).toHaveBeenCalledWith(expect.stringMatching(/^photos\/new-asset\/.+\.jpg$/), expect.any(File))
        expect(mocks.insertPhoto).toHaveBeenCalledWith(expect.objectContaining({ asset_id: "new-asset", caption: "two.jpg", internal_only: true, is_thumbnail: true }))
    })

    it("retains only failed photos and retries without creating another asset or repeating successful uploads", async () => {
        const view = show()
        await valid()
        await selectPhotos("one.jpg", "two.jpg")
        mocks.upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "Network unavailable" } })
        fireEvent.click(screen.getByRole("button", { name: "Add Asset" }))
        await screen.findByText(/Asset created\. Some photos/)
        expect(view.success).not.toHaveBeenCalled()
        expect(screen.queryByAltText("one.jpg")).not.toBeInTheDocument()
        expect(screen.getByAltText("two.jpg")).toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: "Finish saving" }))
        await waitFor(() => expect(view.success).toHaveBeenCalledOnce())
        expect(mocks.insertAsset).toHaveBeenCalledTimes(1)
        expect(mocks.upload).toHaveBeenCalledTimes(3)
        expect(mocks.insertPhoto.mock.calls.map(call => call[0].is_thumbnail)).toEqual([true, false])
    })

    it("keeps the form and queue on asset insert failure and catches thrown errors", async () => {
        const view = show()
        await valid()
        await selectPhotos("one.jpg")
        mocks.insertAsset.mockRejectedValueOnce(new Error("Save unavailable"))
        fireEvent.click(screen.getByRole("button", { name: "Add Asset" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("Save unavailable")
        expect(screen.getByAltText("one.jpg")).toBeInTheDocument()
        expect(mocks.upload).not.toHaveBeenCalled()
        expect(view.success).not.toHaveBeenCalled()
        expect(screen.getByRole("button", { name: "Add Asset" })).toBeEnabled()
    })

    it("cleans up storage on association failure and retains the photo for retry", async () => {
        show()
        await valid()
        await selectPhotos("one.jpg")
        mocks.insertPhoto.mockResolvedValueOnce({ error: { message: "Association denied" } })
        fireEvent.click(screen.getByRole("button", { name: "Add Asset" }))
        await screen.findByText(/Asset created\. Some photos/)
        expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]])
        expect(screen.getByAltText("one.jpg")).toBeInTheDocument()
    })

    it("accepts dropped photos, rejects non-images, and revokes previews on unmount", async () => {
        const view = show()
        const input = screen.getByLabelText("Asset photos (optional)")
        fireEvent.drop(input.parentElement!, { dataTransfer: { files: [new File(["photo"], "drop.jpg", { type: "image/jpeg" }), new File(["text"], "notes.txt", { type: "text/plain" })] } })
        await screen.findByAltText("drop.jpg")
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("notes.txt")))
        view.unmount()
        expect(URL.revokeObjectURL).toHaveBeenCalled()
        expect(mocks.insertAsset).not.toHaveBeenCalled()
    })

    it("preserves asset validation and supports saving without photos", async () => {
        const view = show()
        fireEvent.click(screen.getByRole("button", { name: "Add Asset" }))
        await waitFor(() => expect(mocks.error).toHaveBeenCalled())
        expect(mocks.insertAsset).not.toHaveBeenCalled()
        await valid()
        fireEvent.click(screen.getByRole("button", { name: "Add Asset" }))
        await waitFor(() => expect(view.success).toHaveBeenCalledOnce())
        expect(mocks.upload).not.toHaveBeenCalled()
    })

    it("prepares HEIC previews before enabling Save and handles conversion errors", async () => {
        show()
        await valid()
        let finish!: (file: File) => void
        mocks.prepare.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
        fireEvent.change(screen.getByLabelText("Asset photos (optional)"), { target: { files: [new File(["heic"], "phone.heic")] } })
        expect(screen.getByRole("button", { name: "Add Asset" })).toBeDisabled()
        finish(new File(["converted"], "phone.jpg", { type: "image/jpeg" }))
        expect(await screen.findByAltText("phone.jpg")).toBeInTheDocument()
        await waitFor(() => expect(screen.getByRole("button", { name: "Add Asset" })).toBeEnabled())
        mocks.prepare.mockRejectedValueOnce(new Error("Invalid image"))
        await selectPhotos("broken.heic")
        expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("broken.heic: could not prepare"))
        expect(screen.getAllByRole("img")).toHaveLength(1)
    })

    it("finishes an already created asset after removing its failed photo", async () => {
        const view = show()
        await valid()
        await selectPhotos("one.jpg")
        mocks.upload.mockResolvedValueOnce({ error: { message: "Upload failed" } })
        fireEvent.click(screen.getByRole("button", { name: "Add Asset" }))
        await screen.findByText(/Asset created\. Some photos/)
        fireEvent.click(screen.getByRole("button", { name: "Remove one.jpg" }))
        fireEvent.click(screen.getByRole("button", { name: "Finish saving" }))
        await waitFor(() => expect(view.success).toHaveBeenCalledOnce())
        expect(mocks.insertAsset).toHaveBeenCalledOnce()
        expect(mocks.upload).toHaveBeenCalledOnce()
    })

    it("creates and selects a new type without losing asset details or queued photos", async () => {
        const view = show()
        await valid()
        fireEvent.change(screen.getByLabelText("Asset Dimensions"), { target: { value: "2400 x 600" } })
        await selectPhotos("one.jpg")
        fireEvent.change(screen.getByRole("combobox", { name: "Type" }), { target: { value: "__create_asset_type__" } })
        fireEvent.change(screen.getByLabelText("New asset type name"), { target: { value: "  Digital menu board  " } })
        fireEvent.keyDown(screen.getByLabelText("New asset type name"), { key: "Enter" })
        await waitFor(() => expect(screen.queryByLabelText("New asset type name")).not.toBeInTheDocument())
        expect(mocks.insertType).toHaveBeenCalledWith({ label: "Digital menu board", icon_name: "Package" })
        expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue("31f56c1a-444b-4dd7-a6ef-7142ac844602")
        expect(screen.getByLabelText("Asset Dimensions")).toHaveValue("2400 x 600")
        expect(screen.getByAltText("one.jpg")).toBeInTheDocument()
        expect(mocks.insertAsset).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole("button", { name: "Add Asset" }))
        await waitFor(() => expect(view.success).toHaveBeenCalledOnce())
        expect(mocks.insertAsset).toHaveBeenCalledWith(expect.objectContaining({ asset_type_id: "31f56c1a-444b-4dd7-a6ef-7142ac844602" }))
    })

    it("rejects blank type names, selects an existing duplicate, and supports cancelling", async () => {
        show()
        await valid()
        fireEvent.change(screen.getByRole("combobox", { name: "Type" }), { target: { value: "__create_asset_type__" } })
        fireEvent.click(screen.getByRole("button", { name: "Create type" }))
        expect(screen.getByRole("alert")).toHaveTextContent("Enter an asset type name")
        fireEvent.change(screen.getByLabelText("New asset type name"), { target: { value: " sIgN " } })
        fireEvent.click(screen.getByRole("button", { name: "Create type" }))
        expect(mocks.insertType).not.toHaveBeenCalled()
        expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue(typeId)
        fireEvent.change(screen.getByRole("combobox", { name: "Type" }), { target: { value: "__create_asset_type__" } })
        fireEvent.click(screen.getByRole("button", { name: "Cancel new type" }))
        expect(screen.queryByLabelText("New asset type name")).not.toBeInTheDocument()
        expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue(typeId)
    })

    it("retains the new name on a permission failure and allows retrying", async () => {
        show()
        await valid()
        fireEvent.change(screen.getByRole("combobox", { name: "Type" }), { target: { value: "__create_asset_type__" } })
        fireEvent.change(screen.getByLabelText("New asset type name"), { target: { value: "Digital menu board" } })
        mocks.insertType.mockResolvedValueOnce({ data: null, error: { message: "Permission denied" } })
        fireEvent.click(screen.getByRole("button", { name: "Create type" }))
        expect(await screen.findByRole("alert")).toHaveTextContent("Permission denied")
        expect(screen.getByLabelText("New asset type name")).toHaveValue("Digital menu board")
        fireEvent.click(screen.getByRole("button", { name: "Create type" }))
        await waitFor(() => expect(screen.queryByLabelText("New asset type name")).not.toBeInTheDocument())
        expect(mocks.insertType).toHaveBeenCalledTimes(2)
    })

    it("hides type creation from non-admin users", async () => {
        mocks.isAdmin = false
        show()
        await valid()
        expect(screen.queryByRole("option", { name: /Create new asset type/ })).not.toBeInTheDocument()
    })

    it("retains the existing gallery and update path for old assets", async () => {
        const view = show({ id: "old-asset", asset_type_id: typeId, pm_interval_months: null, next_service_date: null } as Asset)
        await screen.findByText("Existing gallery")
        expect(mocks.gallery).toHaveBeenCalledWith("old-asset")
        expect(screen.queryByLabelText("Asset photos (optional)")).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: "Save Changes" }))
        await waitFor(() => expect(view.success).toHaveBeenCalledOnce())
        expect(mocks.updateAsset).toHaveBeenCalledOnce()
        expect(mocks.insertAsset).not.toHaveBeenCalled()
    })
})
