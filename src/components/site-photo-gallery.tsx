"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { ImageIcon, Plus, Trash2, Loader2, Camera } from "lucide-react"
import { toast } from "sonner"

interface SitePhoto {
    id: string
    url: string
    caption: string
    created_at: string
}

interface SitePhotoGalleryProps {
    storeId: string
}

export function SitePhotoGallery({ storeId }: SitePhotoGalleryProps) {
    const [photos, setPhotos] = useState<SitePhoto[]>([])
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
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
        } catch (error: any) {
            console.error('Error fetching photos:', error.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchPhotos()
    }, [storeId])

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        try {
            // 1. Upload to storage
            const fileExt = file.name.split('.').pop()
            const fileName = `${storeId}/${Math.random()}.${fileExt}`
            const filePath = `photos/${fileName}`

            const { error: uploadError } = await supabase.storage
                .from('site-photos')
                .upload(filePath, file)

            if (uploadError) throw uploadError

            // 2. Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('site-photos')
                .getPublicUrl(filePath)

            // 3. Save to database
            const { error: dbError } = await supabase
                .from('site_photos')
                .insert({
                    store_id: storeId,
                    url: publicUrl,
                    caption: file.name
                })

            if (dbError) throw dbError

            toast.success("Photo uploaded successfully")
            fetchPhotos()
        } catch (error: any) {
            toast.error(`Upload failed: ${error.message}`)
            console.error(error)
        } finally {
            setUploading(false)
        }
    }

    const handleDelete = async (photo: SitePhoto) => {
        if (!confirm("Are you sure you want to delete this photo?")) return

        try {
            // 1. Extract path from URL (naive approach)
            const pathMatch = photo.url.match(/site-photos\/(.+)$/)
            if (pathMatch) {
                const filePath = pathMatch[1]
                await supabase.storage.from('site-photos').remove([decodeURIComponent(filePath)])
            }

            // 2. Delete from database
            const { error } = await supabase
                .from('site_photos')
                .delete()
                .eq('id', photo.id)

            if (error) throw error

            setPhotos(photos.filter(p => p.id !== photo.id))
            toast.success("Photo deleted")
        } catch (error: any) {
            toast.error(`Delete failed: ${error.message}`)
        }
    }

    if (loading) {
        return <div className="flex items-center justify-center p-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
    }

    return (
        <div className="space-y-6 mt-12 pb-12 border-t pt-8">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <Camera className="size-5 text-primary" />
                        Site Photo Gallery
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Recent photos showing what this site looks like.
                    </p>
                </div>
                <div>
                    <Label htmlFor="photo-upload" className="cursor-pointer">
                        <div className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity">
                            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                            Upload Photo
                        </div>
                        <Input
                            id="photo-upload"
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
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <ImageIcon className="size-12 mb-4 opacity-20" />
                        <p>No photos added for this site yet.</p>
                        <p className="text-xs">Upload photos of the storefront, kitchen or dining area.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {photos.map((photo) => (
                        <div key={photo.id} className="group relative aspect-square rounded-xl overflow-hidden border bg-muted shadow-sm hover:shadow-md transition-all">
                            <img
                                src={photo.url}
                                alt={photo.caption}
                                className="object-cover w-full h-full"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <Button
                                    variant="destructive"
                                    size="icon"
                                    className="size-8 rounded-full"
                                    onClick={() => handleDelete(photo)}
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                                <p className="text-[10px] text-white truncate font-medium">{photo.caption}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
