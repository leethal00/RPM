import type { createClient } from "@/lib/supabase/client"

// Shared storage layout with AssetPhotoGallery. Files have already been prepared
// for browser display (including HEIC conversion) before they enter the queue.
export async function uploadPendingAssetPhoto(
    supabase: ReturnType<typeof createClient>,
    assetId: string,
    file: File,
    internalOnly: boolean,
    isThumbnail: boolean,
) {
    const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "jpg"
    const path = `photos/${assetId}/${crypto.randomUUID()}.${extension}`
    const bucket = supabase.storage.from("asset-photos")
    const { error: uploadError } = await bucket.upload(path, file)
    if (uploadError) throw uploadError

    try {
        const { data: { publicUrl } } = bucket.getPublicUrl(path)
        const { error } = await supabase.from("asset_photos").insert({
            asset_id: assetId,
            url: publicUrl,
            caption: file.name,
            internal_only: internalOnly,
            is_thumbnail: isThumbnail,
        })
        if (error) throw error
    } catch (error) {
        // Do not leave an unlinked object behind when association is rejected.
        try {
            const { error: cleanupError } = await bucket.remove([path])
            if (cleanupError) console.error("Asset photo cleanup failed", cleanupError)
        } catch (cleanupError) {
            console.error("Asset photo cleanup failed", cleanupError)
        }
        throw error
    }
}
