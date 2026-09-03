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

export function SitePhotoGallery({
    storeId,
}: SitePhotoGalleryProps) {
    const supabase = useMemo(() => createClient(), [])

    const [photos, setPhotos] = useState<SitePhoto[]>([])
    const [albums, setAlbums] = useState<SitePhotoAlbum[]>([])
    const [assetPhotos, setAssetPhotos] = useState<
        AssetPhotoEnriched[]
    >([])

    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)

    const [includeAssetPhotos, setIncludeAssetPhotos] =
        useState(false)

    const [uploadInternalOnly, setUploadInternalOnly] =
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

            setPhotos((data ?? []) as SitePhoto[])
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
        setSelectedAlbumId(GENERAL_ALBUM)
        setLoading(true)

        fetchPhotos()
        fetchAlbums()

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeId])

    useEffect(() => {
        if (
            includeAssetPhotos &&
            assetPhotos.length === 0
        ) {
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
        ).length

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

        if (selectedAlbumId === album.id) {
            setSelectedAlbumId(GENERAL_ALBUM)
        }

        toast.success(
            `Album "${album.name}" deleted`
        )
    }

    const uploadFiles = async (files: File[]) => {
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

                    const fileName =
                        `${storeId}/${Math.random()}.${fileExt}`

                    const filePath =
                        `photos/${fileName}`

                    const { error: uploadError } =
                        await supabase.storage
                            .from("site-photos")
                            .upload(filePath, file)

                    if (uploadError) {
                        throw uploadError
                    }

                    const {
                        data: { publicUrl },
                    } = supabase.storage
                        .from("site-photos")
                        .getPublicUrl(filePath)

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
                        internal_only:
                            uploadInternalOnly,
                    }

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

                    if (dbError) throw dbError

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
            const pathMatch = photo.url.match(
                /site-photos\/(.+)$/
            )

            if (pathMatch) {
                const filePath = pathMatch[1]

                await supabase.storage
                    .from("site-photos")
                    .remove([
                        decodeURIComponent(filePath),
                    ])
            }

            const { error } = await supabase
                .from("site_photos")
                .delete()
                .eq("id", photo.id)

            if (error) throw error

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

    const toggleInternalOnly = async (
        photo: SitePhoto
    ) => {
        const next = !photo.internal_only

        const { error } = await supabase
            .from("site_photos")
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

        setPhotos((current) =>
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

    if (loading) {
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

    const filteredPhotos =
        selectedAlbumId === GENERAL_ALBUM
            ? photos.filter(
                  (photo) => !photo.album_id
              )
            : photos.filter(
                  (photo) =>
                      photo.album_id ===
                      selectedAlbumId
              )

    const visibleAssetPhotos =
        includeAssetPhotos &&
        selectedAlbumId === GENERAL_ALBUM
            ? assetPhotos
            : []

    const totalCount =
        filteredPhotos.length +
        visibleAssetPhotos.length

    const generalCount = photos.filter(
        (photo) => !photo.album_id
    ).length

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
                        Organise site photos into optional albums, or leave them in General.
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

                        <Label
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
                        </Label>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3">
                        <span className="text-xs text-muted-foreground">
                            Uploading to:{" "}
                            <span className="font-medium text-foreground">
                                {selectedAlbumLabel}
                            </span>
                        </span>

                        <label className="flex items-center gap-2 text-xs cursor-pointer select-none text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={
                                    uploadInternalOnly
                                }
                                onChange={(event) =>
                                    setUploadInternalOnly(
                                        event.target
                                            .checked
                                    )
                                }
                                className="size-3.5 accent-amber-500"
                            />

                            <Lock className="size-3" />

                            <span>
                                Mark next upload as{" "}
                                <span className="font-medium text-foreground">
                                    service-team only
                                </span>
                            </span>
                        </label>
                    </div>
                </div>
            </div>

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

                    {albums.map((album) => {
                        const count = photos.filter(
                            (photo) =>
                                photo.album_id ===
                                album.id
                        ).length

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

                                <Button
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
                                </Button>
                            </div>
                        )
                    })}
                </div>

                {albumsAvailable ? (
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
                ) : (
                    <p className="text-xs text-muted-foreground">
                        Album support is ready in RPM but the Supabase album migration still needs to be applied. General photos continue to work normally.
                    </p>
                )}
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
                            Drop an image here, or click
                            Upload above.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3">
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
                                        <Image
                                            src={
                                                photo.url
                                            }
                                            alt={
                                                photo.caption ??
                                                "Site photo"
                                            }
                                            fill
                                            className="object-cover"
                                            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                            loading="lazy"
                                        />

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

                                        <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-end">
                                            <div className="w-full p-2 flex items-center justify-between gap-1">
                                                <div className="flex items-center gap-1">
                                                    <Button
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
                                                    </Button>

                                                    <Button
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
                                                    </Button>

                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="secondary"
                                                        className="size-8"
                                                        asChild
                                                        title="Open full size"
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
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    {albumsAvailable && (
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

                                                {albums.map(
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

                                    <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-end">
                                        <div className="w-full p-2 flex items-center justify-between">
                                            <div className="flex gap-1">
                                                <Button
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
                                                </Button>

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
