import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const mocks = vi.hoisted(() => ({
    role: "rodier_admin", photos: [] as object[], albums: [] as object[], installers: [] as object[],
    upload: vi.fn(), insert: vi.fn(), update: vi.fn(), remove: vi.fn(),
}))

vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }))
vi.mock("@/lib/image-prep", () => ({ ensureRenderable: async (file: File) => file, isHeic: () => false }))
vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
        storage: { from: (bucket: string) => ({
            createSignedUrl: async () => ({ data: { signedUrl: "https://example.com/private.jpg" } }),
            upload: (path: string, file: File) => mocks.upload(bucket, path, file),
            getPublicUrl: () => ({ data: { publicUrl: "https://example.com/public.jpg" } }),
            download: async () => ({ data: new Blob(["photo"], { type: "image/jpeg" }), error: null }),
            remove: (paths: string[]) => mocks.remove(bucket, paths),
        }) },
        from: (table: string) => {
            const query = {
                select: () => query,
                eq: () => query,
                is: () => query,
                order: async () => ({ data: table === "site_photos" ? mocks.photos : table === "site_photo_albums" ? mocks.albums : mocks.installers, error: null }),
                single: async () => ({ data: { role: mocks.role }, error: null }),
                insert: (row: object) => mocks.insert(table, row),
                update: (patch: object) => ({ eq: async () => mocks.update(table, patch) }),
            }
            return query
        },
    }),
}))

import { SitePhotoGallery } from "./site-photo-gallery"

describe("site photo galleries", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.upload.mockResolvedValue({ error: null })
        mocks.insert.mockResolvedValue({ error: null })
        mocks.update.mockResolvedValue({ error: null })
        mocks.remove.mockResolvedValue({ error: null })
        mocks.role = "rodier_admin"
        mocks.photos = [
            { id: "internal-1", store_id: "site-1", album_id: null, url: "/internal.jpg", caption: "Workshop photo", internal_only: true, is_primary: false },
            { id: "client-1", store_id: "site-1", album_id: null, url: "/client.jpg", caption: "Finished photo", internal_only: false, is_primary: false },
        ]
        mocks.albums = [
            { id: "album-internal", store_id: "site-1", name: "Workshop", audience: "internal" },
            { id: "album-client", store_id: "site-1", name: "Completion", audience: "client" },
        ]
        mocks.installers = [{ id: "installer-1", store_id: "site-1", storage_path: "job/user/one.jpg", caption: "Site visit", category: "Site Survey", captured_at: "2026-09-24T00:00:00Z", album_id: null, users: { name: "Installer" } }]
    })

    it("shows installer and other staff photos together, with albums scoped to Internal", async () => {
        render(<SitePhotoGallery storeId="site-1" />)
        expect(await screen.findByText("Site visit")).toBeInTheDocument()
        expect(screen.getByRole("img", { name: "Workshop photo" })).toBeInTheDocument()
        expect(screen.queryByRole("img", { name: "Finished photo" })).not.toBeInTheDocument()
        expect(screen.getByText("Workshop")).toBeInTheDocument()
        expect(screen.queryByText("Completion")).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: /Client viewable \(/ }))
        expect(screen.getByRole("img", { name: "Finished photo" })).toBeInTheDocument()
        expect(screen.queryByText("Site visit")).not.toBeInTheDocument()
        expect(screen.getByText("Completion")).toBeInTheDocument()
        expect(screen.queryByText("Workshop")).not.toBeInTheDocument()
    })

    it("shows clients only the viewable gallery and hides upload controls", async () => {
        mocks.role = "client_hq"
        mocks.photos = mocks.photos.filter((photo) => !(photo as { internal_only: boolean }).internal_only)
        mocks.albums = mocks.albums.filter((album) => (album as { audience: string }).audience === "client")
        mocks.installers = []
        render(<SitePhotoGallery storeId="site-1" />)

        await waitFor(() => expect(screen.getByRole("img", { name: "Finished photo" })).toBeInTheDocument())
        expect(screen.queryByRole("button", { name: /Internal \(/ })).not.toBeInTheDocument()
        expect(screen.queryByText("Upload photo")).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Delete photo" })).not.toBeInTheDocument()
    })

    it("saves a new staff upload to private storage in Internal", async () => {
        render(<SitePhotoGallery storeId="site-1" />)
        await screen.findByText("Site visit")
        const input = document.getElementById("photo-upload") as HTMLInputElement
        fireEvent.change(input, { target: { files: [new File(["image"], "workshop.png", { type: "image/png" })] } })

        await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith("site_photos", expect.objectContaining({
            store_id: "site-1", url: "", internal_only: true, private_storage_path: expect.stringMatching(/^site-1\//),
        })))
        expect(mocks.upload).toHaveBeenCalledWith("site-internal-photos", expect.stringMatching(/^site-1\//), expect.any(File))
    })

    it("copies an internal photo to public storage only when sharing it with clients", async () => {
        mocks.photos = [{ id: "internal-1", store_id: "site-1", album_id: null, url: "", private_storage_path: "site-1/private.jpg", caption: "Workshop photo", internal_only: true, is_primary: false }]
        mocks.installers = []
        render(<SitePhotoGallery storeId="site-1" />)
        const share = await screen.findByTitle("Make visible to clients")
        fireEvent.click(share)

        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("site_photos", expect.objectContaining({
            internal_only: false, album_id: null, url: "https://example.com/public.jpg",
        })))
        expect(mocks.upload).toHaveBeenCalledWith("site-photos", expect.stringMatching(/^photos\/site-1\/shared\//), expect.any(Blob))
    })

    it("moves a client photo into private storage before hiding it", async () => {
        mocks.photos = [{ id: "client-1", store_id: "site-1", album_id: null,
            url: "https://example.com/storage/v1/object/public/site-photos/photos/site-1/client.jpg",
            private_storage_path: null, caption: "Finished photo", internal_only: false, is_primary: false }]
        mocks.installers = []
        render(<SitePhotoGallery storeId="site-1" />)
        fireEvent.click(await screen.findByRole("button", { name: /Client viewable \(/ }))
        fireEvent.click(screen.getByTitle("Service-team only"))

        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("site_photos", expect.objectContaining({
            internal_only: true, album_id: null, url: "", private_storage_path: expect.stringMatching(/^site-1\//),
        })))
        expect(mocks.upload).toHaveBeenCalledWith("site-internal-photos", expect.stringMatching(/^site-1\//), expect.any(Blob))
        await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("site-photos", ["photos/site-1/client.jpg"]))
    })

    it("offers to secure older internal photos stored at a public URL", async () => {
        mocks.photos = [{ id: "internal-1", store_id: "site-1", album_id: null,
            url: "https://example.com/storage/v1/object/public/site-photos/photos/site-1/older.jpg",
            private_storage_path: null, caption: "Older photo", internal_only: true, is_primary: false }]
        mocks.installers = []
        render(<SitePhotoGallery storeId="site-1" />)
        fireEvent.click(await screen.findByTitle("Move photo to private storage"))

        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("site_photos", expect.objectContaining({
            url: "", private_storage_path: expect.stringMatching(/^site-1\//),
        })))
        expect(mocks.upload).toHaveBeenCalledWith("site-internal-photos", expect.stringMatching(/^site-1\//), expect.any(Blob))
        await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("site-photos", ["photos/site-1/older.jpg"]))
    })
})
