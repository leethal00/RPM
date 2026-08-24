/**
 * Image preparation helpers.
 *
 * Browsers (and Next.js Image) can't render HEIC/HEIF inline — anything
 * dropped from an iPhone in its native format would upload fine but show
 * as a broken image. We convert HEIC → JPEG client-side before upload
 * using `heic-to` (loaded dynamically so it stays out of the SSR bundle).
 */

const HEIC_EXTENSIONS = /\.(heic|heif)$/i
const HEIC_MIMES = ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]

export function isHeic(file: File): boolean {
    if (HEIC_MIMES.includes(file.type.toLowerCase())) return true
    // Safari sometimes ships HEIC files with an empty mime type — fall back to extension.
    if (HEIC_EXTENSIONS.test(file.name)) return true
    return false
}

/**
 * If `file` is HEIC/HEIF, convert to a JPEG `File`; otherwise return the
 * original. Conversion runs entirely in the browser. Throws if the
 * conversion fails so the caller can flag the upload as failed for that
 * specific file.
 */
export async function ensureRenderable(file: File): Promise<File> {
    if (!isHeic(file)) return file
    const { heicTo } = await import("heic-to")
    const jpegBlob = await heicTo({
        blob: file,
        type: "image/jpeg",
        quality: 0.9,
    })
    const newName = file.name.replace(HEIC_EXTENSIONS, ".jpg")
    return new File([jpegBlob], newName, { type: "image/jpeg", lastModified: file.lastModified })
}
