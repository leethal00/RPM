"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { FolderLock, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

type InstallerPhoto = {
    id: string
    store_id: string
    storage_path: string
    caption: string | null
    captured_at: string
    users?: { name: string | null } | null
    previewUrl?: string | null
}

export function InstallerSitePhotos({ storeId, onPublished }: { storeId: string; onPublished: () => void }) {
    const supabase = useMemo(() => createClient(), [])
    const [photos, setPhotos] = useState<InstallerPhoto[]>([])
    const [publishingId, setPublishingId] = useState<string | null>(null)
    const [brokenIds, setBrokenIds] = useState<string[]>([])

    useEffect(() => {
        let live = true
        void (async () => {
            const { data, error } = await supabase.from("installer_photos")
                .select("id,store_id,storage_path,caption,captured_at,users(name)")
                .eq("store_id", storeId).is("published_site_photo_id", null)
                .order("captured_at", { ascending: false })
            if (error) {
                toast.error(`Could not load installation photos: ${error.message}`)
                return
            }
            const rows = (data || []) as InstallerPhoto[]
            const signed = await Promise.all(rows.map(async photo => {
                const { data: url } = await supabase.storage.from("installer-photos")
                    .createSignedUrl(photo.storage_path, 300)
                return { ...photo, previewUrl: url?.signedUrl || null }
            }))
            if (live) { setPhotos(signed); setBrokenIds([]) }
        })()
        return () => { live = false }
    }, [storeId, supabase])

    async function publish(photo: InstallerPhoto) {
        if (publishingId) return
        setPublishingId(photo.id)
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
            setPhotos(current => current.filter(item => item.id !== photo.id))
            toast.success("Photo moved to the site gallery and made visible to clients")
            onPublished()
        } catch (error) {
            if (uploaded) await supabase.storage.from("site-photos").remove([path])
            toast.error(error instanceof Error ? error.message : "Could not approve photo")
        } finally {
            setPublishingId(null)
        }
    }

    if (!photos.length) return null
    return <section className="rounded-lg border border-amber-300 bg-amber-50/40 p-4">
        <h4 className="flex items-center gap-2 font-semibold"><FolderLock className="size-4" /> Installation folder · staff only</h4>
        <p className="mt-1 text-sm text-muted-foreground">Photos from RPM Mobile stay private here until you review and move them to the site gallery.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {photos.map(photo => <div key={photo.id} className="rounded border bg-background p-2">
                {photo.previewUrl && !brokenIds.includes(photo.id)
                    ? <a href={photo.previewUrl} target="_blank" rel="noreferrer">
                        <Image src={photo.previewUrl} alt={photo.caption || "Installation photo"} width={300} height={200}
                            unoptimized className="h-40 w-full rounded object-cover"
                            onError={() => setBrokenIds(current => [...current, photo.id])} />
                    </a>
                    : <div className="flex h-40 items-center justify-center rounded bg-muted p-3 text-center text-xs text-muted-foreground">Photo unavailable</div>}
                <p className="mt-2 text-sm">{photo.caption || "Installation photo"}</p>
                <p className="text-xs text-muted-foreground">{photo.users?.name || "Installer"} · {new Date(photo.captured_at).toLocaleString("en-NZ")}</p>
                <Button className="mt-3 w-full" size="sm" disabled={publishingId !== null || brokenIds.includes(photo.id)}
                    onClick={() => void publish(photo)}>
                    {publishingId === photo.id ? <Loader2 className="size-4 animate-spin" /> : "Approve to site gallery"}
                </Button>
            </div>)}
        </div>
    </section>
}

