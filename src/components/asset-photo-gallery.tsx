"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ImageIcon, Plus, Trash2, Loader2, Camera, UploadCloud } from "lucide-react"
import { toast } from "sonner"
import type { AssetPhoto } from "@/types/database"
import { ensureRenderable, isHeic } from "@/lib/image-prep"

interface AssetPhotoGalleryProps {
    assetId: string
}

export function AssetPhotoGallery({ assetId }: AssetPhotoGalleryProps) {
    const [photos, setPhotos] = useState<AssetPhoto[]>([])
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const supabase = createClient()

    const fetchPhotos = async () => {
        try {
            const { data, error } = await supabase
                .from('asset_photos')
                .select('*')
                .eq('asset_id', assetId)
                .order('created_at', { ascending: false })

            if (error) throw error
            setPhotos(data || [])
        } catch (error: unknown) {
            console.error('Error fetching asset photos:', error instanceof Error ? error.message : error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (assetId) fetchPhotos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assetId])

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
                    const fileName = `${assetId}/${Math.random()}.${fileExt}`
                    const filePath = `photos/${fileName}`

                    const { error: uploadError } = await supabase.storage
                        .from('asset-photos')
                        .upload(filePath, file)
                    if (uploadError) throw uploadError

                    const { data: { publicUrl } } = supabase.storage
                        .from('asset-photos')
                        .getPublicUrl(filePath)

                    const { error: dbError } = await supabase
                        .from('asset_photos')
                        .insert({ asset_id: assetId, url: publicUrl, caption: file.name })
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

    const handleDelete = async (photo: AssetPhoto) => {
        if (!confirm("Are you sure you want to delete this asset photo?")) return
        try {
            const pathMatch = photo.url.match(/asset-photos\/(.+)$/)
            if (pathMatch) {
                const filePath = pathMatch[1]
                await supabase.storage.from('asset-photos').remove([decodeURIComponent(filePath)])
            }
            const { error } = await supabase.from('asset_photos').delete().eq('id', photo.id)
            if (error) throw error
            setPhotos(photos.filter(p => p.id !== photo.id))
            toast.success("Asset photo deleted")
        } catch (error: unknown) {
            toast.error(`Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`)
        }
    }

    if (loading) {
        return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Camera className="size-3.5" />
                    Asset photos
                </h3>
                <Label htmlFor="asset-photo-upload" className="cursor-pointer">
                    <div className="inline-flex items-center gap-1.5 border border-border/80 bg-card text-foreground px-2.5 py-1 rounded-md hover:bg-accent/40 transition-colors text-xs">
                        {uploading ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                        Upload
                    </div>
                    <Input
                        id="asset-photo-upload"
                        type="file"
                        accept="image/*,.heic,.heif"
                        multiple
                        className="hidden"
                        onChange={handleFileInputChange}
                        disabled={uploading}
                    />
                </Label>
            </div>

            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative rounded-md border ${isDragging ? 'border-primary border-2 bg-primary/5' : 'border-dashed border-border/60'} transition-colors`}
            >
                {isDragging && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none bg-primary/5 rounded-md">
                        <div className="flex flex-col items-center gap-1.5 text-primary">
                            <UploadCloud className="size-6" />
                            <p className="text-xs font-medium">Drop to upload</p>
                        </div>
                    </div>
                )}
                {photos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <ImageIcon className="size-6 mb-2 opacity-30" />
                        <p className="text-xs">No photos attached to this asset yet.</p>
                        <p className="text-[11px] text-muted-foreground/80">Drop an image here, or click Upload above.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 p-2">
                        {photos.map((photo) => (
                            <div key={photo.id} className="group relative aspect-square rounded-md overflow-hidden border border-border/60 bg-muted/40">
                                <Image
                                    src={photo.url}
                                    alt={photo.caption ?? "Asset photo"}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, 20vw"
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Button
                                        variant="destructive"
                                        size="icon"
                                        className="size-7 rounded-full"
                                        onClick={() => handleDelete(photo)}
                                    >
                                        <Trash2 className="size-3.5" />
                                    </Button>
                                </div>
                                {photo.caption && (
                                    <div className="absolute bottom-0 left-0 right-0 p-1 bg-gradient-to-t from-black/70 to-transparent">
                                        <p className="text-[9px] text-white truncate font-medium" title={photo.caption}>{photo.caption}</p>
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
