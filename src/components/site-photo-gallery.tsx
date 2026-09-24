"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

import {
    Camera,
    ExternalLink,
    Folder,
    FolderPlus,
    ImageIcon,
    Loader2,
    Lock,
    LockOpen,
    Plus,
    Star,
    Trash2,
    UploadCloud,
} from "lucide-react"

import { toast } from "sonner"
import type {
    AssetPhoto,
    SitePhoto,
    SitePhotoAlbum,
} from "@/types/database"
import { ensureRenderable, isHeic } from "@/lib/image-prep"

interface SitePhotoGalleryProps {
    storeId: string
}

type AssetPhotoEnriched = AssetPhoto & {
    asset_label: string | null
}

const GENERAL_ALBUM = "__general__"
function publicPhotoPath(url: string): string | null {
    const marker = "/storage/v1/object/public/site-photos/"
    const index = url.indexOf(marker)
    if (index < 0) return null
    try {
        return decodeURIComponent(url.slice(index + marker.length).split("?")[0])
    } catch {
        return null
    }
}
type GalleryAudience = "client" | "internal"
type InstallerPhoto = {
    id: string
    store_id: string
    storage_path: string
    caption: string | null
    category: string
    captured_at: string
    album_id: string | null
    users?: { name: string | null } | null
    previewUrl?: string | null
}
type DisplaySitePhoto = SitePhoto & { previewUrl?: string | null }

export function SitePhotoGallery({
    storeId,
}: SitePhotoGalleryProps) {
    const supabase = useMemo(() => createClient(), [])

    const [photos, setPhotos] = useState<DisplaySitePhoto[]>([])
    const [installerPhotos, setInstallerPhotos] = useState<InstallerPhoto[]>([])
    const [brokenInstallerIds, setBrokenInstallerIds] = useState<string[]>([])
    const [processingInstallerId, setProcessingInstallerId] = useState<string | null>(null)
    const [albums, setAlbums] = useState<SitePhotoAlbum[]>([])
    const [audience, setAudience] = useState<GalleryAudience>("internal")
    const [isStaff, setIsStaff] = useState<boolean | null>(null)
    const [assetPhotos, setAssetPhotos] = useState<
        AssetPhotoEnriched[]
    >([])

    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)

    const [includeAssetPhotos, setIncludeAssetPhotos] =
        useState(false)

    const [selectedAlbumId, setSelectedAlbumId] =
        useState<string>(GENERAL_ALBUM)

    const [newAlbumName, setNewAlbumName] = useState("")
    const [creatingAlbum, setCreatingAlbum] = useState(false)

    // Albums will remain unavailable until the Supabase migration
    // creating site_photo_albums has actually been applied.
    const [albumsAvailable, setAlbumsAvailable] = useState(true)

    const fetchPhotos = async () => {
        try {
            const { data, error } = await supabase
                .from("site_photos")
                .select("*")
                .eq("store_id", storeId)
                .order("created_at", { ascending: false })

            if (error) throw error

            const rows = (data ?? []) as SitePhoto[]
            const signed = await Promise.all(rows.map(async (photo) => {
                if (!photo.internal_only || !photo.private_storage_path) return photo
                const { data: url } = await supabase.storage.from("site-internal-photos")
                    .createSignedUrl(photo.private_storage_path, 3600)
                return { ...photo, previewUrl: url?.signedUrl ?? null }
            }))
            setPhotos(signed)
        } catch (error: unknown) {
            console.error(
                "Error fetching photos:",
                error instanceof Error
                    ? error.message
                    : error
            )
        } finally {
            setLoading(false)
        }
    }

    const fetchAlbums = async () => {
        try {
            const { data, error } = await supabase
                .from("site_photo_albums")
                .select("*")
                .eq("store_id", storeId)
                .order("name")

            if (error) {
                // Before the migration is applied, Supabase will
                // report that this table does not exist. Do not break
                // the existing General gallery in that situation.
                console.info(
                    "Photo albums not available yet:",
                    error.message
                )

                setAlbums([])
                setAlbumsAvailable(false)
                return
            }

            setAlbums((data ?? []) as SitePhotoAlbum[])
            setAlbumsAvailable(true)
        } catch (error: unknown) {
            console.info(
                "Photo albums not available yet:",
                error instanceof Error
                    ? error.message
                    : error
            )

            setAlbums([])
            setAlbumsAvailable(false)
        }
    }

    const fetchInstallerPhotos = async () => {
        const { data, error } = await supabase.from("installer_photos")
            .select("id,store_id,storage_path,caption,category,captured_at,album_id,users(name)")
            .eq("store_id", storeId).is("published_site_photo_id", null)
            .order("captured_at", { ascending: false })
        if (error) {
            console.error("Could not load installation photos:", error)
            return
        }
        const rows = (data ?? []) as InstallerPhoto[]
        const signed = await Promise.all(rows.map(async (photo) => {
            const { data: url } = await supabase.storage.from("installer-photos")
                .createSignedUrl(photo.storage_path, 3600)
            return { ...photo, previewUrl: url?.signedUrl ?? null }
        }))
        setInstallerPhotos(signed)
        setBrokenInstallerIds([])
    }

    const fetchAssetPhotos = async () => {
        try {
            const { data, error } = await supabase
                .from("asset_photos")
                .select(`
                    id,
                    url,
                    caption,
                    created_at,
                    asset_id,
                    internal_only,
                    assets!inner (
                        id,
                        store_id,
                        asset_types (
                            label
                        )
                    )
                `)
                .eq("assets.store_id", storeId)
                .order("created_at", {
                    ascending: false,
                })

            if (error) throw error

            type Row = {
                id: string
                url: string
                caption: string | null
                created_at: string
                asset_id: string
                internal_only: boolean
                assets: {
                    asset_types?: {
                        label?: string
                    } | null
                }
            }

            const enriched: AssetPhotoEnriched[] = (
                (data ?? []) as unknown as Row[]
            ).map((row) => ({
                id: row.id,
                asset_id: row.asset_id,
                url: row.url,
                caption: row.caption,
                created_at: row.created_at,
                internal_only: row.internal_only,
                asset_label:
                    row.assets?.asset_types?.label ?? null,
            }))

            setAssetPhotos(enriched)
        } catch (error: unknown) {
            console.error(
                "Error fetching asset photos:",
                error instanceof Error
                    ? error.message
                    : error
            )
        }
    }

    useEffect(() => {
        // Reset the selected album when the site changes.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedAlbumId(GENERAL_ALBUM)
        setLoading(true)

        fetchPhotos()
        fetchAlbums()
        void fetchInstallerPhotos()

        void (async () => {
            const { data: { user } } = await supabase.auth.getUser()
            const { data } = user ? await supabase.from("users").select("role").eq("id", user.id).single() : { data: null }
            const staff = data?.role === "super_admin" || data?.role === "rodier_admin"
            setIsStaff(staff)
            if (!staff) setAudience("client")
        })()

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeId])

    useEffect(() => {
        if (
            includeAssetPhotos &&
            assetPhotos.length === 0
        ) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            fetchAssetPhotos()
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [includeAssetPhotos])

    const createAlbum = async () => {
        const name = newAlbumName.trim()

        if (!name) {
            toast.error("Enter an album name")
            return
        }

        if (!albumsAvailable) {
            toast.error(
                "Photo albums are not active in the database yet"
            )
            return
        }

        if (
            albums.some(
                (album) =>
                    album.audience === audience &&
                    album.name.toLowerCase() ===
                    name.toLowerCase()
            )
        ) {
            toast.error(
                "An album with that name already exists"
            )
            return
        }

        setCreatingAlbum(true)

        try {
            const {
                data: { user },
            } = await supabase.auth.getUser()

            const { data, error } = await supabase
                .from("site_photo_albums")
                .insert({
                    store_id: storeId,
                    name,
                    audience,
                    created_by: user?.id ?? null,
                })
                .select("*")
                .single()

            if (error) throw error

            const album = data as SitePhotoAlbum

            setAlbums((current) =>
                [...current, album].sort((a, b) =>
                    a.name.localeCompare(b.name)
                )
            )

            setSelectedAlbumId(album.id)
            setNewAlbumName("")

            toast.success(`Album "${name}" created`)
        } catch (error: unknown) {
            toast.error(
                `Could not create album: ${
                    error instanceof Error
                        ? error.message
                        : "Unknown error"
                }`
            )
        } finally {
            setCreatingAlbum(false)
        }
    }

    const deleteAlbum = async (
        album: SitePhotoAlbum
    ) => {
        const photoCount = photos.filter(
            (photo) => photo.album_id === album.id
        ).length + installerPhotos.filter((photo) => photo.album_id === album.id).length

        const message =
            photoCount > 0
                ? `Delete "${album.name}"? Its ${photoCount} photo${
                      photoCount === 1 ? "" : "s"
                  } will return to General.`
                : `Delete album "${album.name}"?`

        if (!confirm(message)) return

        const { error } = await supabase
            .from("site_photo_albums")
            .delete()
            .eq("id", album.id)

        if (error) {
            toast.error(
                `Could not delete album: ${error.message}`
            )
            return
        }

        setAlbums((current) =>
            current.filter(
                (item) => item.id !== album.id
            )
        )

        setPhotos((current) =>
            current.map((photo) =>
                photo.album_id === album.id
                    ? {
                          ...photo,
                          album_id: null,
                      }
                    : photo
            )
        )

        setInstallerPhotos((current) => current.map((photo) =>
            photo.album_id === album.id ? { ...photo, album_id: null } : photo
        ))

        if (selectedAlbumId === album.id) {
            setSelectedAlbumId(GENERAL_ALBUM)
        }

        toast.success(
            `Album "${album.name}" deleted`
        )
    }

    const uploadFiles = async (files: File[]) => {
        if (!isStaff || uploading) return
        const images = files.filter(
            (file) =>
                file.type.startsWith("image/") ||
                isHeic(file)
        )

        if (images.length === 0) {
            toast.error("Please drop image files only")
            return
        }

        setUploading(true)

        const heicCount =
            images.filter(isHeic).length

        let convertToastId:
            | string
            | number
            | undefined

        if (heicCount > 0) {
            convertToastId = toast.loading(
                `Converting ${heicCount} HEIC photo${
                    heicCount === 1 ? "" : "s"
                }…`
            )
        }

        let succeeded = 0
        let failed = 0

        try {
            for (const raw of images) {
                try {
                    const file =
                        await ensureRenderable(raw)

                    const fileExt =
                        file.name.split(".").pop()

                    const privateUpload = audience === "internal"
                    const bucket = privateUpload ? "site-internal-photos" : "site-photos"
                    const filePath = privateUpload
                        ? `${storeId}/${crypto.randomUUID()}.${fileExt}`
                        : `photos/${storeId}/${crypto.randomUUID()}.${fileExt}`

                    const { error: uploadError } =
                        await supabase.storage
                            .from(bucket)
                            .upload(filePath, file)

                    if (uploadError) {
                        throw uploadError
                    }

                    const publicUrl = privateUpload ? "" : supabase.storage
                        .from("site-photos").getPublicUrl(filePath).data.publicUrl

                    // Important: when uploading to General we
                    // deliberately do not send album_id at all.
                    // That lets the existing gallery continue working
                    // even before the album migration is applied.
                    const insertData: Record<
                        string,
                        unknown
                    > = {
                        store_id: storeId,
                        url: publicUrl,
                        caption: file.name,
                        internal_only: privateUpload,
                    }
                    if (privateUpload) insertData.private_storage_path = filePath

                    if (
                        selectedAlbumId !==
                        GENERAL_ALBUM
                    ) {
                        insertData.album_id =
                            selectedAlbumId
                    }

                    const { error: dbError } =
                        await supabase
                            .from("site_photos")
                            .insert(insertData)

                    if (dbError) {
                        await supabase.storage.from(bucket).remove([filePath])
                        throw dbError
                    }

                    succeeded++
                } catch (error: unknown) {
                    failed++

                    console.error(
                        `Upload failed for ${raw.name}:`,
                        error
                    )
                }
            }

            if (convertToastId !== undefined) {
                toast.dismiss(convertToastId)
            }

            if (succeeded > 0) {
                toast.success(
                    `${succeeded} photo${
                        succeeded === 1 ? "" : "s"
                    } uploaded${
                        failed > 0
                            ? `, ${failed} failed`
                            : ""
                    }`
                )

                fetchPhotos()
            } else {
                toast.error(
                    `All ${failed} upload${
                        failed === 1 ? "" : "s"
                    } failed`
                )
            }
        } finally {
            setUploading(false)
        }
    }

    const handleFileInputChange = (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const files = Array.from(
            event.target.files ?? []
        )

        if (files.length > 0) {
            uploadFiles(files)
        }

        event.target.value = ""
    }

    const handleDragOver = (
        event: React.DragEvent
    ) => {
        event.preventDefault()

        if (!isDragging) {
            setIsDragging(true)
        }
    }

    const handleDragLeave = (
        event: React.DragEvent
    ) => {
        event.preventDefault()

        if (
            event.currentTarget === event.target
        ) {
            setIsDragging(false)
        }
    }

    const handleDrop = (
        event: React.DragEvent
    ) => {
        event.preventDefault()
        setIsDragging(false)

        const files = Array.from(
            event.dataTransfer.files ?? []
        )

        if (files.length > 0) {
            uploadFiles(files)
        }
    }

    const movePhoto = async (
        photo: SitePhoto,
        value: string
    ) => {
        const albumId =
            value === GENERAL_ALBUM
                ? null
                : value

        const { error } = await supabase
            .from("site_photos")
            .update({
                album_id: albumId,
            })
            .eq("id", photo.id)

        if (error) {
            toast.error(
                `Could not move photo: ${error.message}`
            )
            return
        }

        setPhotos((current) =>
            current.map((item) =>
                item.id === photo.id
                    ? {
                          ...item,
                          album_id: albumId,
                      }
                    : item
            )
        )

        const destination =
            albumId === null
                ? "General"
                : albums.find(
                      (album) =>
                          album.id === albumId
                  )?.name ?? "album"

        toast.success(
            `Photo moved to ${destination}`
        )
    }

    const moveInstallerPhoto = async (photo: InstallerPhoto, value: string) => {
        const albumId = value === GENERAL_ALBUM ? null : value
        const { error } = await supabase.from("installer_photos")
            .update({ album_id: albumId }).eq("id", photo.id)
        if (error) return toast.error(`Could not move photo: ${error.message}`)
        setInstallerPhotos((current) => current.map((item) =>
            item.id === photo.id ? { ...item, album_id: albumId } : item
        ))
        toast.success("Photo moved")
    }

    const publishInstallerPhoto = async (photo: InstallerPhoto) => {
        if (processingInstallerId) return
        setProcessingInstallerId(photo.id)
        const path = `photos/${storeId}/installation/${photo.id}.jpg`
        let uploaded = false
        try {
            const { data: file, error: downloadError } = await supabase.storage
                .from("installer-photos").download(photo.storage_path)
            if (downloadError) throw downloadError
            if (!file || file.size === 0) throw new Error("This photo upload is empty. Please take it again in RPM Mobile.")
            const { error: uploadError } = await supabase.storage.from("site-photos")
                .upload(path, file, { contentType: "image/jpeg", upsert: false })
            if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError
            uploaded = !uploadError
            const { data: publicUrl } = supabase.storage.from("site-photos").getPublicUrl(path)
            const { error: publishError } = await supabase.rpc("installer_publish_site_photo", {
                p_photo_id: photo.id, p_public_path: path, p_public_url: publicUrl.publicUrl,
            })
            if (publishError) throw publishError
            setInstallerPhotos((current) => current.filter((item) => item.id !== photo.id))
            await fetchPhotos()
            toast.success("Photo moved to Client viewable · General")
        } catch (error) {
            if (uploaded) await supabase.storage.from("site-photos").remove([path])
            toast.error(error instanceof Error ? error.message : "Could not make photo client viewable")
        } finally {
            setProcessingInstallerId(null)
        }
    }

    const deleteInstallerPhoto = async (photo: InstallerPhoto) => {
        if (!confirm("Delete this job photo?")) return
        if (processingInstallerId) return
        setProcessingInstallerId(photo.id)
        try {
            const { error } = await supabase.from("installer_photos").delete().eq("id", photo.id)
            if (error) throw error
            const { error: storageError } = await supabase.storage.from("installer-photos")
                .remove([photo.storage_path])
            if (storageError) console.warn("Photo record deleted, but file cleanup failed:", storageError)
            setInstallerPhotos((current) => current.filter((item) => item.id !== photo.id))
            toast.success("Photo deleted")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not delete photo")
        } finally {
            setProcessingInstallerId(null)
        }
    }

    const handleDelete = async (
        photo: SitePhoto
    ) => {
        if (
            !confirm(
                "Are you sure you want to delete this photo?"
            )
        ) {
            return
        }

        try {
            const publicPath = publicPhotoPath(photo.url)
            const { error } = await supabase
                .from("site_photos")
                .delete()
                .eq("id", photo.id)

            if (error) throw error

            if (publicPath) {
                const { error: storageError } = await supabase.storage.from("site-photos").remove([publicPath])
                if (storageError) console.warn("Photo record deleted, but public file cleanup failed:", storageError)
            }
            if (photo.private_storage_path) {
                const { error: storageError } = await supabase.storage.from("site-internal-photos")
                    .remove([photo.private_storage_path])
                if (storageError) console.warn("Photo record deleted, but private file cleanup failed:", storageError)
            }

            setPhotos((current) =>
                current.filter(
                    (item) =>
                        item.id !== photo.id
                )
            )

            toast.success("Photo deleted")
        } catch (error: unknown) {
            toast.error(
                `Delete failed: ${
                    error instanceof Error
                        ? error.message
                        : "Unknown error"
                }`
            )
        }
    }

    const toggleInternalOnly = async (photo: SitePhoto) => {
        try {
            if (photo.internal_only) {
                if (photo.private_storage_path) {
                    const { data: file, error: downloadError } = await supabase.storage
                        .from("site-internal-photos").download(photo.private_storage_path)
                    if (downloadError) throw downloadError
                    if (!file || file.size === 0) throw new Error("This photo file is unavailable")
                    const extension = photo.private_storage_path.split(".").pop() || "jpg"
                    const publicPath = `photos/${storeId}/shared/${crypto.randomUUID()}.${extension}`
                    const { error: uploadError } = await supabase.storage.from("site-photos")
                        .upload(publicPath, file, { contentType: file.type, upsert: false })
                    if (uploadError) throw uploadError
                    const publicUrl = supabase.storage.from("site-photos").getPublicUrl(publicPath).data.publicUrl
                    const { error } = await supabase.from("site_photos").update({
                        internal_only: false, album_id: null, url: publicUrl,
                    }).eq("id", photo.id)
                    if (error) {
                        await supabase.storage.from("site-photos").remove([publicPath])
                        throw error
                    }
                } else {
                    const { error } = await supabase.from("site_photos")
                        .update({ internal_only: false, album_id: null }).eq("id", photo.id)
                    if (error) throw error
                }
                await fetchPhotos()
                toast.success("Moved to Client viewable · General")
                return
            }

            const publicPath = publicPhotoPath(photo.url)
            if (!publicPath) throw new Error("This external photo cannot be moved to private storage")
            let privatePath = photo.private_storage_path
            let addedPrivateCopy = false
            if (!privatePath) {
                const { data: file, error: downloadError } = await supabase.storage
                    .from("site-photos").download(publicPath)
                if (downloadError) throw downloadError
                if (!file || file.size === 0) throw new Error("This photo file is unavailable")
                const extension = publicPath.split(".").pop() || "jpg"
                privatePath = `${storeId}/${crypto.randomUUID()}.${extension}`
                const { error: uploadError } = await supabase.storage.from("site-internal-photos")
                    .upload(privatePath, file, { contentType: file.type, upsert: false })
                if (uploadError) throw uploadError
                addedPrivateCopy = true
            }
            const { error } = await supabase.from("site_photos").update({
                internal_only: true, album_id: null, url: "", private_storage_path: privatePath,
                is_primary: false,
            }).eq("id", photo.id)
            if (error) {
                if (addedPrivateCopy) await supabase.storage.from("site-internal-photos").remove([privatePath])
                throw error
            }
            const { error: removeError } = await supabase.storage.from("site-photos").remove([publicPath])
            if (removeError) {
                await supabase.from("site_photos").update({
                    internal_only: false, url: photo.url, private_storage_path: photo.private_storage_path,
                    is_primary: photo.is_primary,
                }).eq("id", photo.id)
                if (addedPrivateCopy) await supabase.storage.from("site-internal-photos").remove([privatePath])
                throw removeError
            }
            await fetchPhotos()
            toast.success("Moved to Internal · General")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not change photo visibility")
        }
    }

    const secureLegacyInternalPhoto = async (photo: SitePhoto) => {
        const publicPath = publicPhotoPath(photo.url)
        if (!publicPath) return toast.error("This photo has no site storage file to move")
        try {
            const { data: file, error: downloadError } = await supabase.storage
                .from("site-photos").download(publicPath)
            if (downloadError) throw downloadError
            if (!file || file.size === 0) throw new Error("This photo file is unavailable")
            const extension = publicPath.split(".").pop() || "jpg"
            const privatePath = `${storeId}/${crypto.randomUUID()}.${extension}`
            const { error: uploadError } = await supabase.storage.from("site-internal-photos")
                .upload(privatePath, file, { contentType: file.type, upsert: false })
            if (uploadError) throw uploadError
            const { error: updateError } = await supabase.from("site_photos")
                .update({ url: "", private_storage_path: privatePath }).eq("id", photo.id)
            if (updateError) {
                await supabase.storage.from("site-internal-photos").remove([privatePath])
                throw updateError
            }
            const { error: removeError } = await supabase.storage.from("site-photos").remove([publicPath])
            if (removeError) {
                await supabase.from("site_photos").update({ url: photo.url, private_storage_path: null }).eq("id", photo.id)
                await supabase.storage.from("site-internal-photos").remove([privatePath])
                throw removeError
            }
            await fetchPhotos()
            toast.success("Photo moved into private storage")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not secure photo")
        }
    }

    const setAsPrimary = async (
        photo: SitePhoto
    ) => {
        const next = !photo.is_primary

        if (next) {
            const { error: clearError } =
                await supabase
                    .from("site_photos")
                    .update({
                        is_primary: false,
                    })
                    .eq("store_id", storeId)
                    .neq("id", photo.id)

            if (clearError) {
                toast.error(
                    `Update failed: ${clearError.message}`
                )
                return
            }
        }

        const { error } = await supabase
            .from("site_photos")
            .update({
                is_primary: next,
            })
            .eq("id", photo.id)

        if (error) {
            toast.error(
                `Update failed: ${error.message}`
            )
            return
        }

        setPhotos((current) =>
            current.map((item) => {
                if (item.id === photo.id) {
                    return {
                        ...item,
                        is_primary: next,
                    }
                }

                if (next) {
                    return {
                        ...item,
                        is_primary: false,
                    }
                }

                return item
            })
        )

        toast.success(
            next
                ? "Set as primary photo for this site"
                : "Unpinned primary photo"
        )
    }

    const toggleAssetInternalOnly = async (
        photo: AssetPhotoEnriched
    ) => {
        const next = !photo.internal_only

        const { error } = await supabase
            .from("asset_photos")
            .update({
                internal_only: next,
            })
            .eq("id", photo.id)

        if (error) {
            toast.error(
                `Update failed: ${error.message}`
            )
            return
        }

        setAssetPhotos((current) =>
            current.map((item) =>
                item.id === photo.id
                    ? {
                          ...item,
                          internal_only: next,
                      }
                    : item
            )
        )

        toast.success(
            next
                ? "Marked as service-team only"
                : "Made visible to clients"
        )
    }

    if (loading || isStaff === null) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="animate-spin text-muted-foreground" />
            </div>
        )
    }

    const selectedAlbum =
        selectedAlbumId === GENERAL_ALBUM
            ? null
            : albums.find(
                  (album) =>
                      album.id === selectedAlbumId
              ) ?? null

    const galleryAlbums = albums.filter((album) => album.audience === audience)
    const galleryPhotos = photos.filter((photo) => photo.internal_only === (audience === "internal"))
    const galleryInstallerPhotos = audience === "internal" ? installerPhotos : []

    const filteredPhotos =
        selectedAlbumId === GENERAL_ALBUM
            ? galleryPhotos.filter(
                  (photo) => !photo.album_id
              )
            : galleryPhotos.filter(
                  (photo) =>
                      photo.album_id ===
                      selectedAlbumId
              )

    const filteredInstallerPhotos = galleryInstallerPhotos.filter((photo) =>
        selectedAlbumId === GENERAL_ALBUM ? !photo.album_id : photo.album_id === selectedAlbumId
    )

    const visibleAssetPhotos =
        includeAssetPhotos &&
        selectedAlbumId === GENERAL_ALBUM
            ? assetPhotos.filter((photo) => photo.internal_only === (audience === "internal"))
            : []

    const totalCount =
        filteredPhotos.length +
        filteredInstallerPhotos.length +
        visibleAssetPhotos.length

    const generalCount = galleryPhotos.filter(
        (photo) => !photo.album_id
    ).length + galleryInstallerPhotos.filter((photo) => !photo.album_id).length

    const selectedAlbumLabel =
        selectedAlbum?.name ?? "General"

    return (
        <div className="space-y-5 mt-10 pb-12 border-t border-border/60 pt-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Camera className="size-4 text-muted-foreground" />
                        Site Photo Gallery
                    </h3>

                    <p className="text-sm text-muted-foreground mt-0.5">
                        Photos from every team, organised by who can view them.
                    </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                            <Switch
                                checked={
                                    includeAssetPhotos
                                }
                                onCheckedChange={
                                    setIncludeAssetPhotos
                                }
                            />

                            <span className="text-muted-foreground">
                                Include asset photos
                                {includeAssetPhotos &&
                                    assetPhotos.length >
                                        0 && (
                                        <span className="text-foreground font-medium ml-1">
                                            (
                                            {
                                                assetPhotos.length
                                            }
                                            )
                                        </span>
                                    )}
                            </span>
                        </label>

                        {isStaff && <Label
                            htmlFor="photo-upload"
                            className="cursor-pointer"
                        >
                            <div className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-md hover:bg-primary/90 transition-colors text-sm font-medium">
                                {uploading ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                    <Plus className="size-3.5" />
                                )}

                                Upload photo
                            </div>

                            <Input
                                id="photo-upload"
                                type="file"
                                accept="image/*,.heic,.heif"
                                multiple
                                className="hidden"
                                onChange={
                                    handleFileInputChange
                                }
                                disabled={uploading}
                            />
                        </Label>}
                    </div>

                    {isStaff && <div className="flex flex-wrap items-center justify-end gap-3">
                        <span className="text-xs text-muted-foreground">
                            Uploading to: <span className="font-medium text-foreground">
                                {audience === "internal" ? "Internal" : "Client viewable"} · {selectedAlbumLabel}
                            </span>
                        </span>
                    </div>}
                </div>
            </div>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Photo gallery visibility">
                {isStaff && <Button type="button" size="sm" variant={audience === "internal" ? "default" : "outline"}
                    onClick={() => { setAudience("internal"); setSelectedAlbumId(GENERAL_ALBUM) }}>
                    <Lock className="mr-1.5 size-3.5" /> Internal ({photos.filter((p) => p.internal_only).length + installerPhotos.length})
                </Button>}
                <Button type="button" size="sm" variant={audience === "client" ? "default" : "outline"}
                    onClick={() => { setAudience("client"); setSelectedAlbumId(GENERAL_ALBUM) }}>
                    <LockOpen className="mr-1.5 size-3.5" /> Client viewable ({photos.filter((p) => !p.internal_only).length})
                </Button>
            </div>

            {isStaff && audience === "internal" && photos.some((photo) => photo.internal_only && !photo.private_storage_path && !!photo.url) && (
                <p className="rounded-md border border-amber-300 bg-amber-50/40 px-3 py-2 text-xs text-muted-foreground">
                    Older Internal photos can be moved into private storage using the lock action on each photo.
                </p>
            )}

            {/* Album selector */}
            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant={
                            selectedAlbumId ===
                            GENERAL_ALBUM
                                ? "default"
                                : "outline"
                        }
                        onClick={() =>
                            setSelectedAlbumId(
                                GENERAL_ALBUM
                            )
                        }
                        className="gap-2"
                    >
                        <ImageIcon className="size-3.5" />
                        General
                        <span className="opacity-70">
                            ({generalCount})
                        </span>
                    </Button>

                    {galleryAlbums.map((album) => {
                        const count = galleryPhotos.filter(
                            (photo) =>
                                photo.album_id ===
                                album.id
                        ).length + galleryInstallerPhotos.filter((photo) => photo.album_id === album.id).length

                        return (
                            <div
                                key={album.id}
                                className="flex items-center"
                            >
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={
                                        selectedAlbumId ===
                                        album.id
                                            ? "default"
                                            : "outline"
                                    }
                                    onClick={() =>
                                        setSelectedAlbumId(
                                            album.id
                                        )
                                    }
                                    className="gap-2 rounded-r-none"
                                >
                                    <Folder className="size-3.5" />
                                    {album.name}

                                    <span className="opacity-70">
                                        ({count})
                                    </span>
                                </Button>

                                {isStaff && <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="px-2 rounded-l-none border-l-0"
                                    title={`Delete ${album.name}`}
                                    onClick={() =>
                                        deleteAlbum(album)
                                    }
                                >
                                    <Trash2 className="size-3.5" />
                                </Button>}
                            </div>
                        )
                    })}
                </div>

                {albumsAvailable && isStaff ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 max-w-lg">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                            <FolderPlus className="size-3.5" />
                            New album
                        </div>

                        <Input
                            value={newAlbumName}
                            onChange={(event) =>
                                setNewAlbumName(
                                    event.target.value
                                )
                            }
                            onKeyDown={(event) => {
                                if (
                                    event.key ===
                                    "Enter"
                                ) {
                                    event.preventDefault()
                                    createAlbum()
                                }
                            }}
                            placeholder="e.g. Under Construction"
                            className="h-8"
                        />

                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={createAlbum}
                            disabled={
                                creatingAlbum ||
                                !newAlbumName.trim()
                            }
                        >
                            {creatingAlbum ? (
                                <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                                <Plus className="size-3.5 mr-1" />
                            )}

                            Add
                        </Button>
                    </div>
                ) : !albumsAvailable ? (
                    <p className="text-xs text-muted-foreground">
                        Album support is ready in RPM but the Supabase album migration still needs to be applied. General photos continue to work normally.
                    </p>
                ) : null}
            </div>

            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative rounded-lg border ${
                    isDragging
                        ? "border-primary border-2 bg-primary/5"
                        : "border-dashed border-border/60"
                } transition-colors`}
            >
                {isDragging && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none bg-primary/5 rounded-lg">
                        <div className="flex flex-col items-center gap-2 text-primary">
                            <UploadCloud className="size-8" />
                            <p className="text-sm font-medium">
                                Drop to upload to{" "}
                                {selectedAlbumLabel}
                            </p>
                        </div>
                    </div>
                )}

                {totalCount === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        {selectedAlbumId ===
                        GENERAL_ALBUM ? (
                            <ImageIcon className="size-8 mb-3 opacity-30" />
                        ) : (
                            <Folder className="size-8 mb-3 opacity-30" />
                        )}

                        <p className="text-sm">
                            No photos in{" "}
                            {selectedAlbumLabel} yet.
                        </p>

                        <p className="text-xs text-muted-foreground/80">
                            {isStaff ? "Drop an image here, or click Upload above." : "No photos have been shared here yet."}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3">
                        {filteredInstallerPhotos.map((photo) => (
                            <div key={`installation-${photo.id}`} className="space-y-1.5 rounded-md border p-2">
                                <div className="relative aspect-square overflow-hidden rounded bg-muted">
                                    {photo.previewUrl && !brokenInstallerIds.includes(photo.id) ? (
                                        <Image src={photo.previewUrl} alt={photo.caption || "Job photo"}
                                            fill unoptimized className="object-cover"
                                            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                            onError={() => setBrokenInstallerIds((current) => [...current, photo.id])} />
                                    ) : (
                                        <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">Photo unavailable</div>
                                    )}
                                    <span className="absolute left-1.5 top-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                                        {photo.category || "Job photo"} · Internal
                                    </span>
                                </div>
                                <p className="truncate text-sm" title={photo.caption || "Job photo"}>{photo.caption || "Job photo"}</p>
                                <p className="text-xs text-muted-foreground">{photo.users?.name || "Installer"} · {new Date(photo.captured_at).toLocaleString("en-NZ")}</p>
                                {albumsAvailable && (
                                    <Select value={photo.album_id ?? GENERAL_ALBUM}
                                        onValueChange={(value) => void moveInstallerPhoto(photo, value)}>
                                        <SelectTrigger className="h-8 text-xs" aria-label="Move job photo to album">
                                            <SelectValue placeholder="Move to album" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={GENERAL_ALBUM}>General</SelectItem>
                                            {galleryAlbums.map((album) => <SelectItem key={album.id} value={album.id}>{album.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )}
                                <div className="flex flex-wrap gap-1">
                                    <Button type="button" size="sm" className="min-h-9 flex-1 text-xs"
                                        disabled={processingInstallerId !== null || brokenInstallerIds.includes(photo.id) || !photo.previewUrl}
                                        onClick={() => void publishInstallerPhoto(photo)}>
                                        {processingInstallerId === photo.id ? <Loader2 className="size-3.5 animate-spin" /> : "Make client viewable"}
                                    </Button>
                                    <Button type="button" size="icon" variant="outline" className="size-9"
                                        title="Delete job photo" disabled={processingInstallerId !== null}
                                        onClick={() => void deleteInstallerPhoto(photo)}><Trash2 className="size-3.5" /></Button>
                                </div>
                            </div>
                        ))}
                        {filteredPhotos.map(
                            (photo) => (
                                <div
                                    key={`site-${photo.id}`}
                                    className="space-y-1.5"
                                >
                                    <div
                                        className={`group relative aspect-square rounded-md overflow-hidden border bg-muted/40 ${
                                            photo.is_primary
                                                ? "border-primary/60 ring-1 ring-primary/40"
                                                : photo.internal_only
                                                  ? "border-amber-400/60 ring-1 ring-amber-400/30"
                                                  : "border-border/60"
                                        }`}
                                    >
                                        {photo.internal_only && photo.private_storage_path && !photo.previewUrl ? (
                                            <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">Photo unavailable</div>
                                        ) : (
                                            <Image src={photo.internal_only ? photo.previewUrl || photo.url : photo.url}
                                                alt={photo.caption ?? "Site photo"} fill className="object-cover"
                                                unoptimized={Boolean(photo.internal_only && photo.private_storage_path)}
                                                sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw" loading="lazy" />
                                        )}

                                        <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 items-start">
                                            {photo.is_primary && (
                                                <div className="inline-flex items-center gap-1 bg-primary/95 text-primary-foreground text-[10px] font-medium px-1.5 py-0.5 rounded">
                                                    <Star className="size-2.5 fill-current" />
                                                    Primary
                                                </div>
                                            )}

                                            {photo.internal_only && (
                                                <div className="inline-flex items-center gap-1 bg-amber-100/95 dark:bg-amber-900/80 text-amber-900 dark:text-amber-100 text-[10px] font-medium px-1.5 py-0.5 rounded">
                                                    <Lock className="size-2.5" />
                                                    Internal
                                                </div>
                                            )}
                                        </div>

                                        <div className="absolute inset-0 bg-black/45 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity flex items-end">
                                            <div className="w-full p-2 flex items-center justify-between gap-1">
                                                <div className="flex items-center gap-1">
                                                    {isStaff && !photo.internal_only && <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="secondary"
                                                        className="size-8"
                                                        title={
                                                            photo.is_primary
                                                                ? "Remove primary status"
                                                                : "Set as primary site photo"
                                                        }
                                                        onClick={() =>
                                                            setAsPrimary(
                                                                photo
                                                            )
                                                        }
                                                    >
                                                        <Star
                                                            className={`size-3.5 ${
                                                                photo.is_primary
                                                                    ? "fill-current"
                                                                    : ""
                                                            }`}
                                                        />
                                                    </Button>}

                                                    {isStaff && <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="secondary"
                                                        className="size-8"
                                                        title={
                                                            photo.internal_only
                                                                ? "Make visible to clients"
                                                                : "Service-team only"
                                                        }
                                                        onClick={() =>
                                                            toggleInternalOnly(
                                                                photo
                                                            )
                                                        }
                                                    >
                                                        {photo.internal_only ? (
                                                            <Lock className="size-3.5" />
                                                        ) : (
                                                            <LockOpen className="size-3.5" />
                                                        )}
                                                    </Button>}

                                                    {isStaff && photo.internal_only && !photo.private_storage_path && !!photo.url && (
                                                        <Button type="button" size="icon" variant="secondary" className="size-8"
                                                            title="Move photo to private storage"
                                                            onClick={() => void secureLegacyInternalPhoto(photo)}>
                                                            <Lock className="size-3.5" />
                                                        </Button>
                                                    )}

                                                    {(!photo.internal_only || photo.previewUrl || photo.url) && <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="secondary"
                                                        className="size-8"
                                                        asChild
                                                        title="Open full size"
                                                    >
                                                        <a
                                                            href={photo.internal_only ? photo.previewUrl || photo.url : photo.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        >
                                                            <ExternalLink className="size-3.5" />
                                                        </a>
                                                    </Button>}
                                                </div>

                                                {isStaff && <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="destructive"
                                                    className="size-8"
                                                    title="Delete photo"
                                                    onClick={() =>
                                                        handleDelete(
                                                            photo
                                                        )
                                                    }
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </Button>}
                                            </div>
                                        </div>
                                    </div>

                                    {albumsAvailable && isStaff && (
                                        <Select
                                            value={
                                                photo.album_id ??
                                                GENERAL_ALBUM
                                            }
                                            onValueChange={(
                                                value
                                            ) =>
                                                movePhoto(
                                                    photo,
                                                    value
                                                )
                                            }
                                        >
                                            <SelectTrigger className="h-7 text-xs">
                                                <SelectValue placeholder="Move to album" />
                                            </SelectTrigger>

                                            <SelectContent>
                                                <SelectItem
                                                    value={
                                                        GENERAL_ALBUM
                                                    }
                                                >
                                                    General
                                                </SelectItem>

                                                {galleryAlbums.map(
                                                    (
                                                        album
                                                    ) => (
                                                        <SelectItem
                                                            key={
                                                                album.id
                                                            }
                                                            value={
                                                                album.id
                                                            }
                                                        >
                                                            {
                                                                album.name
                                                            }
                                                        </SelectItem>
                                                    )
                                                )}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </div>
                            )
                        )}

                        {visibleAssetPhotos.map(
                            (photo) => (
                                <div
                                    key={`asset-${photo.id}`}
                                    className={`group relative aspect-square rounded-md overflow-hidden border bg-muted/40 ${
                                        photo.internal_only
                                            ? "border-amber-400/60 ring-1 ring-amber-400/30"
                                            : "border-border/60"
                                    }`}
                                >
                                    <Image
                                        src={photo.url}
                                        alt={
                                            photo.caption ??
                                            "Asset photo"
                                        }
                                        fill
                                        className="object-cover"
                                        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                        loading="lazy"
                                    />

                                    <div className="absolute top-1.5 left-1.5 flex flex-col items-start gap-1">
                                        <div className="bg-background/90 text-foreground text-[10px] font-medium px-1.5 py-0.5 rounded">
                                            Asset
                                            {photo.asset_label
                                                ? `: ${photo.asset_label}`
                                                : ""}
                                        </div>

                                        {photo.internal_only && (
                                            <div className="inline-flex items-center gap-1 bg-amber-100/95 dark:bg-amber-900/80 text-amber-900 dark:text-amber-100 text-[10px] font-medium px-1.5 py-0.5 rounded">
                                                <Lock className="size-2.5" />
                                                Internal
                                            </div>
                                        )}
                                    </div>

                                    <div className="absolute inset-0 bg-black/45 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity flex items-end">
                                        <div className="w-full p-2 flex items-center justify-between">
                                            <div className="flex gap-1">
                                                {isStaff && <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="secondary"
                                                    className="size-8"
                                                    title={
                                                        photo.internal_only
                                                            ? "Make visible to clients"
                                                            : "Service-team only"
                                                    }
                                                    onClick={() =>
                                                        toggleAssetInternalOnly(
                                                            photo
                                                        )
                                                    }
                                                >
                                                    {photo.internal_only ? (
                                                        <Lock className="size-3.5" />
                                                    ) : (
                                                        <LockOpen className="size-3.5" />
                                                    )}
                                                </Button>}

                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="secondary"
                                                    className="size-8"
                                                    asChild
                                                >
                                                    <a
                                                        href={
                                                            photo.url
                                                        }
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        <ExternalLink className="size-3.5" />
                                                    </a>
                                                </Button>
                                            </div>

                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="secondary"
                                                asChild
                                                className="h-8 text-xs"
                                            >
                                                <Link
                                                    href={`/assets/${photo.asset_id}`}
                                                >
                                                    View asset
                                                </Link>
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

