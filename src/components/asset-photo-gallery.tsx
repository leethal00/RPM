"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { ImageIcon, Plus, Trash2, Loader2, Camera } from "lucide-react"
import { toast } from "sonner"

interface AssetPhoto {
    id: string
    url: string
    caption: string
    created_at: string
}

interface AssetPhotoGalleryProps {
    assetId: string
}

export function AssetPhotoGallery({ assetId }: AssetPhotoGalleryProps) {
    const [photos, setPhotos] = useState<AssetPhoto[]>([])
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
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
        } catch (error: any) {
            console.error('Error fetching asset photos:', error.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (assetId) fetchPhotos()
    }, [assetId])

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        try {
            // 1. Upload to storage
            const fileExt = file.name.split('.').pop()
            const fileName = `${assetId}/${Math.random()}.${fileExt}`
            const filePath = `photos/${fileName}`

            const { error: uploadError } = await supabase.storage
                .from('asset-photos')
                .upload(filePath, file)

            if (uploadError) throw uploadError

            // 2. Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('asset-photos')
                .getPublicUrl(filePath)

            // 3. Save to database
            const { error: dbError } = await supabase
                .from('asset_photos')
                .insert({
                    asset_id: assetId,
                    url: publicUrl,
                    caption: file.name
                })

            if (dbError) throw dbError

            toast.success("Asset photo uploaded successfully")
            fetchPhotos()
        } catch (error: any) {
            toast.error(`Upload failed: ${error.message}`)
            console.error(error)
        } finally {
            setUploading(false)
        }
    }

    const handleDelete = async (photo: AssetPhoto) => {
        if (!confirm("Are you sure you want to delete this asset photo?")) return

        try {
            // 1. Extract path from URL
            const pathMatch = photo.url.match(/asset-photos\/(.+)$/)
            if (pathMatch) {
                const filePath = pathMatch[1]
                await supabase.storage.from('asset-photos').remove([decodeURIComponent(filePath)])
            }

            // 2. Delete from database
            const { error } = await supabase
                .from('asset_photos')
                .delete()
                .eq('id', photo.id)

            if (error) throw error

            setPhotos(photos.filter(p => p.id !== photo.id))
            toast.success("Asset photo deleted")
        } catch (error: any) {
            toast.error(`Delete failed: ${error.message}`)
        }
    }

    if (loading) {
        return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
                        <Camera className="size-4 text-primary" />
                        Asset Photos
                    </h3>
                </div>
                <div>
                    <Label htmlFor="asset-photo-upload" className="cursor-pointer">
                        <div className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-md hover:bg-primary/20 transition-colors text-xs font-bold uppercase">
                            {uploading ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                            Upload
                        </div>
                        <Input
                            id="asset-photo-upload"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleUpload}
                            disabled={uploading}
                        />
                    </Label>
                </div>
            </div>

            {photos.length === 0 ? (
                <Card className="border-dashed bg-muted/30">
                    <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <ImageIcon className="size-8 mb-2 opacity-20" />
                        <p className="text-xs">No photos attached to this asset yet.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {photos.map((photo) => (
                        <div key={photo.id} className="group relative aspect-square rounded-lg overflow-hidden border bg-muted shadow-sm hover:shadow-md transition-all">
                            <img
                                src={photo.url}
                                alt={photo.caption}
                                className="object-cover w-full h-full"
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
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
