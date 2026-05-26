"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ImageIcon, Plus, Trash2, Loader2, Camera, UploadCloud, ExternalLink, Lock, LockOpen } from "lucide-react"
import { toast } from "sonner"
import type { SitePhoto, AssetPhoto } from "@/types/database"
import { ensureRenderable, isHeic } from "@/lib/image-prep"

interface SitePhotoGalleryProps {
    storeId: string
}

type AssetPhotoEnriched = AssetPhoto & {
    asset_label: string | null
}

export function SitePhotoGallery({ storeId }: SitePhotoGalleryProps) {
    const [photos, setPhotos] = useState<SitePhoto[]>([])
    const [assetPhotos, setAssetPhotos] = useState<AssetPhotoEnriched[]>([])
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [includeAssetPhotos, setIncludeAssetPhotos] = useState(false)
    const [uploadInternalOnly, setUploadInternalOnly] = useState(false)
    const supabase = createClient()

    const fetchPhotos = async () => {
        try {
            const { data, error } = await supabase
                .from('site_photos')
                .select('*')
                .eq('store_id', storeId)
                .order('created_at', { ascending: false })

            if (error) throw error
            setPhotos(data || [])
        } catch (error: unknown) {
            console.error('Error fetching photos:', error instanceof Error ? error.message : error)
        } finally {
            setLoading(false)
        }
    }

    const fetchAssetPhotos = async () => {
        try {
            const { data, error } = await supabase
                .from('asset_photos')
                .select(`
                    id, url, caption, created_at, asset_id, internal_only,
                    assets!inner ( id, store_id, asset_types ( label ) )
                `)
                .eq('assets.store_id', storeId)
                .order('created_at', { ascending: false })

            if (error) throw error
            type Row = {
                id: string
                url: string
                caption: string | null
                created_at: string
                asset_id: string
                internal_only: boolean
                assets: { asset_types?: { label?: string } | null }
            }
            const enriched: AssetPhotoEnriched[] = ((data ?? []) as unknown as Row[]).map((r) => ({
                id: r.id,
                asset_id: r.asset_id,
                url: r.url,
                caption: r.caption,
                created_at: r.created_at,
                internal_only: r.internal_only,
                asset_label: r.assets?.asset_types?.label ?? null,
            }))
            setAssetPhotos(enriched)
        } catch (error: unknown) {
            console.error('Error fetching asset photos:', error instanceof Error ? error.message : error)
        }
    }

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchPhotos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeId])

    useEffect(() => {
        if (includeAssetPhotos && assetPhotos.length === 0) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            fetchAssetPhotos()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [includeAssetPhotos])

    const uploadFiles = async (files: File[]) => {
        const images = files.filter(f => f.type.startsWith("image/") || isHeic(f))
        if (images.length === 0) {
            toast.error("Please drop image files only")
            return
        }
        setUploading(true)
        const heicCount = images.filter(isHeic).length
        let convertToastId: string | number | undefined
        if (heicCount > 0) {
            convertToastId = toast.loading(`Converting ${heicCount} HEIC photo${heicCount === 1 ? '' : 's'}…`)
        }
        let succeeded = 0
        let failed = 0
        try {
            for (const raw of images) {
                try {
                    const file = await ensureRenderable(raw)
                    const fileExt = file.name.split('.').pop()
                    const fileName = `${storeId}/${Math.random()}.${fileExt}`
                    const filePath = `photos/${fileName}`

                    const { error: uploadError } = await supabase.storage
                        .from('site-photos')
                        .upload(filePath, file)
                    if (uploadError) throw uploadError

                    const { data: { publicUrl } } = supabase.storage
                        .from('site-photos')
                        .getPublicUrl(filePath)

                    const { error: dbError } = await supabase
                        .from('site_photos')
                        .insert({
                            store_id: storeId,
                            url: publicUrl,
                            caption: file.name,
                            internal_only: uploadInternalOnly,
                        })
                    if (dbError) throw dbError

                    succeeded++
                } catch (err: unknown) {
                    failed++
                    console.error(`Upload failed for ${raw.name}:`, err)
                }
            }
            if (convertToastId !== undefined) toast.dismiss(convertToastId)

            if (succeeded > 0) {
                toast.success(`${succeeded} photo${succeeded === 1 ? '' : 's'} uploaded${failed > 0 ? `, ${failed} failed` : ''}`)
                fetchPhotos()
            } else {
                toast.error(`All ${failed} upload${failed === 1 ? '' : 's'} failed`)
            }
        } finally {
            setUploading(false)
        }
    }

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? [])
        if (files.length > 0) uploadFiles(files)
        e.target.value = ""
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        if (!isDragging) setIsDragging(true)
    }
    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        if (e.currentTarget === e.target) setIsDragging(false)
    }
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        const files = Array.from(e.dataTransfer.files ?? [])
        if (files.length > 0) uploadFiles(files)
    }

    const handleDelete = async (photo: SitePhoto) => {
        if (!confirm("Are you sure you want to delete this photo?")) return
        try {
            const pathMatch = photo.url.match(/site-photos\/(.+)$/)
            if (pathMatch) {
                const filePath = pathMatch[1]
                await supabase.storage.from('site-photos').remove([decodeURIComponent(filePath)])
            }
            const { error } = await supabase.from('site_photos').delete().eq('id', photo.id)
            if (error) throw error
            setPhotos(photos.filter(p => p.id !== photo.id))
            toast.success("Photo deleted")
        } catch (error: unknown) {
            toast.error(`Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`)
        }
    }

    const toggleInternalOnly = async (photo: SitePhoto) => {
        const next = !photo.internal_only
        const { error } = await supabase
            .from('site_photos')
            .update({ internal_only: next })
            .eq('id', photo.id)
        if (error) {
            toast.error(`Update failed: ${error.message}`)
            return
        }
        setPhotos(photos.map(p => p.id === photo.id ? { ...p, internal_only: next } : p))
        toast.success(next ? "Marked as service-team only" : "Made visible to clients")
    }

    // Asset photos surface in this gallery via the "Include asset photos" toggle.
    // Mirroring the per-photo lock toggle here saves admins from drilling into
    // each asset just to flip the flag.
    const toggleAssetInternalOnly = async (photo: AssetPhotoEnriched) => {
        const next = !photo.internal_only
        const { error } = await supabase
            .from('asset_photos')
            .update({ internal_only: next })
            .eq('id', photo.id)
        if (error) {
            toast.error(`Update failed: ${error.message}`)
            return
        }
        setAssetPhotos(assetPhotos.map(p => p.id === photo.id ? { ...p, internal_only: next } : p))
        toast.success(next ? "Marked as service-team only" : "Made visible to clients")
    }

    if (loading) {
        return <div className="flex items-center justify-center p-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
    }

    const visibleAssetPhotos = includeAssetPhotos ? assetPhotos : []
    const totalCount = photos.length + visibleAssetPhotos.length

    return (
        <div className="space-y-4 mt-10 pb-12 border-t border-border/60 pt-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Camera className="size-4 text-muted-foreground" />
                        Site Photo Gallery
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Recent photos showing what this site looks like. Drag &amp; drop or click Upload.
                    </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                            <Switch
                                checked={includeAssetPhotos}
                                onCheckedChange={setIncludeAssetPhotos}
                            />
                            <span className="text-muted-foreground">
                                Include asset photos
                                {includeAssetPhotos && assetPhotos.length > 0 && (
                                    <span className="text-foreground font-medium ml-1">({assetPhotos.length})</span>
                                )}
                            </span>
                        </label>
                        <Label htmlFor="photo-upload" className="cursor-pointer">
                            <div className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-md hover:bg-primary/90 transition-colors text-sm font-medium">
                                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                                Upload photo
                            </div>
                            <Input
                                id="photo-upload"
                                type="file"
                                accept="image/*,.heic,.heif"
                                multiple
                                className="hidden"
                                onChange={handleFileInputChange}
                                disabled={uploading}
                            />
                        </Label>
                    </div>
                    {/* Internal-only toggle — applies to the *next* upload(s) so the
                        service team can flag photos before dropping them in. */}
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none text-muted-foreground">
                        <input
                            type="checkbox"
                            checked={uploadInternalOnly}
                            onChange={(e) => setUploadInternalOnly(e.target.checked)}
                            className="size-3.5 accent-amber-500"
                        />
                        <Lock className="size-3" />
                        <span>
                            Mark next upload as <span className="font-medium text-foreground">service-team only</span>
                        </span>
                    </label>
                </div>
            </div>

            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative rounded-lg border ${isDragging ? 'border-primary border-2 bg-primary/5' : 'border-dashed border-border/60'} transition-colors`}
            >
                {isDragging && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none bg-primary/5 rounded-lg">
                        <div className="flex flex-col items-center gap-2 text-primary">
                            <UploadCloud className="size-8" />
                            <p className="text-sm font-medium">Drop to upload</p>
                        </div>
                    </div>
                )}
                {totalCount === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <ImageIcon className="size-8 mb-3 opacity-30" />
                        <p className="text-sm">
                            {includeAssetPhotos
                                ? "No photos for this site or its assets yet."
                                : "No photos added for this site yet."}
                        </p>
                        <p className="text-xs text-muted-foreground/80">Drop an image here, or click Upload above.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3">
                        {photos.map((photo) => (
                            <div key={`site-${photo.id}`} className={`group relative aspect-square rounded-md overflow-hidden border bg-muted/40 ${photo.internal_only ? 'border-amber-400/60 ring-1 ring-amber-400/30' : 'border-border/60'}`}>
                                <Image
                                    src={photo.url}
                                    alt={photo.caption ?? "Site photo"}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                    loading="lazy"
                                />
                                {photo.internal_only && (
                                    <div className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 bg-amber-100/95 dark:bg-amber-900/80 text-amber-900 dark:text-amber-100 text-[10px] font-medium px-1.5 py-0.5 rounded">
                                        <Lock className="size-2.5" />
                                        Internal
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        className="size-8 rounded-full"
                                        title={photo.internal_only ? "Make visible to clients" : "Mark as service-team only"}
                                        onClick={() => toggleInternalOnly(photo)}
                                    >
                                        {photo.internal_only ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="icon"
                                        className="size-8 rounded-full"
                                        title="Delete photo"
                                        onClick={() => handleDelete(photo)}
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                                {photo.caption && (
                                    <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/70 to-transparent">
                                        <p className="text-[10px] text-white truncate font-medium" title={photo.caption}>{photo.caption}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                        {visibleAssetPhotos.map((photo) => (
                            <div key={`asset-${photo.id}`} className={`group relative aspect-square rounded-md overflow-hidden border bg-muted/40 ${photo.internal_only ? 'border-amber-400/60 ring-1 ring-amber-400/30' : 'border-primary/30'}`}>
                                <Image
                                    src={photo.url}
                                    alt={photo.caption ?? "Asset photo"}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                    loading="lazy"
                                />
                                <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 items-start">
                                    <div className="inline-flex items-center gap-1 bg-card/95 border border-border/60 text-foreground text-[10px] font-medium px-1.5 py-0.5 rounded">
                                        {photo.asset_label ?? "Asset"}
                                    </div>
                                    {photo.internal_only && (
                                        <div className="inline-flex items-center gap-1 bg-amber-100/95 dark:bg-amber-900/80 text-amber-900 dark:text-amber-100 text-[10px] font-medium px-1.5 py-0.5 rounded">
                                            <Lock className="size-2.5" />
                                            Internal
                                        </div>
                                    )}
                                </div>
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        className="size-8 rounded-full"
                                        title={photo.internal_only ? "Make visible to clients" : "Mark as service-team only"}
                                        onClick={() => toggleAssetInternalOnly(photo)}
                                    >
                                        {photo.internal_only ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
                                    </Button>
                                    <Button
                                        asChild
                                        variant="secondary"
                                        size="icon"
                                        className="size-8 rounded-full"
                                        title="Open asset"
                                    >
                                        <Link href={`/stores/${storeId}/assets/${photo.asset_id}`}>
                                            <ExternalLink className="size-4" />
                                        </Link>
                                    </Button>
                                </div>
                                {photo.caption && (
                                    <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/70 to-transparent">
                                        <p className="text-[10px] text-white truncate" title={photo.caption}>{photo.caption}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
