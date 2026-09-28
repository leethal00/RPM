"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { Download, Eye, ImageIcon, Loader2, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

const BUCKET = "quote-job-photos"
const MAX_SIZE = 50 * 1024 * 1024
const EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "tif", "tiff"])

type Photo = {
  id: string
  file_name: string
  storage_path: string
  created_at: string
  users: { name: string | null; email: string | null } | null
  previewUrl?: string
}

export function JobPhotos({ jobId }: { jobId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const inputRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [brokenIds, setBrokenIds] = useState<string[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadPhotos = useCallback(async () => {
    const { data, error } = await supabase
      .from("costing_job_photos")
      .select("id,file_name,storage_path,created_at,users:uploaded_by(name,email)")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
    if (error) {
      setLoading(false)
      toast.error(`Could not load photos: ${error.message}`)
      return
    }
    const rows = (data || []) as Photo[]
    const signed = await Promise.all(rows.map(async photo => {
      const { data: url } = await supabase.storage.from(BUCKET).createSignedUrl(photo.storage_path, 600)
      return { ...photo, previewUrl: url?.signedUrl }
    }))
    setPhotos(signed)
    setLoading(false)
  }, [jobId, supabase])

  useEffect(() => { void Promise.resolve().then(loadPhotos) }, [loadPhotos])

  async function uploadFiles(files: FileList | File[]) {
    if (uploading) return
    const selected = Array.from(files)
    if (!selected.length) return
    const invalid = selected.find(file => {
      const extension = file.name.split(".").pop()?.toLowerCase() || ""
      return !EXTENSIONS.has(extension) || !file.size || file.size > MAX_SIZE || file.name.length > 255
    })
    if (invalid) {
      toast.error(`Unsupported or oversized photo: ${invalid.name}. Choose an image up to 50 MB.`)
      return
    }
    setUploading(true)
    let uploaded = 0
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error("Sign in to upload photos.")
      for (const file of selected) {
        const extension = file.name.split(".").pop()!.toLowerCase()
        const path = `${jobId}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        })
        if (uploadError) throw uploadError
        const { error: recordError } = await supabase.from("costing_job_photos").insert({
          job_id: jobId,
          file_name: file.name,
          storage_path: path,
          mime_type: file.type || null,
          file_size: file.size,
          uploaded_by: user.id,
        })
        if (recordError) {
          await supabase.storage.from(BUCKET).remove([path])
          throw recordError
        }
        uploaded += 1
      }
      toast.success(`${uploaded} photo${uploaded === 1 ? "" : "s"} uploaded`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload photos.")
      if (uploaded) toast.info(`${uploaded} photo${uploaded === 1 ? "" : "s"} uploaded before the error.`)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
      await loadPhotos()
    }
  }

  async function openPhoto(photo: Photo, download = false) {
    const preview = download ? null : window.open("", "_blank")
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(
        photo.storage_path, 60, download ? { download: photo.file_name } : undefined,
      )
      if (error || !data?.signedUrl) throw error || new Error("Could not open this photo.")
      if (download) {
        const anchor = document.createElement("a")
        anchor.href = data.signedUrl
        anchor.download = photo.file_name
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
      } else if (preview) {
        preview.location.href = data.signedUrl
      } else {
        window.location.assign(data.signedUrl)
      }
    } catch (error) {
      preview?.close()
      toast.error(error instanceof Error ? error.message : "Could not open this photo.")
    }
  }

  async function deletePhoto(photo: Photo) {
    if (!window.confirm(`Delete ${photo.file_name}? This cannot be undone.`)) return
    setDeletingId(photo.id)
    try {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([photo.storage_path])
      if (storageError) throw storageError
      const { error: recordError } = await supabase.from("costing_job_photos").delete().eq("id", photo.id).eq("job_id", jobId)
      if (recordError) throw recordError
      setPhotos(current => current.filter(item => item.id !== photo.id))
      toast.success("Photo deleted")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the photo.")
      await loadPhotos()
    } finally {
      setDeletingId(null)
    }
  }

  return <div className="space-y-4 pt-4">
    <div>
      <h2 className="text-sm font-semibold">Received photos</h2>
      <p className="mt-1 text-xs text-muted-foreground">Photos received for this quote or job. JPG, PNG, WebP, GIF, HEIC and TIFF, up to 50 MB each.</p>
    </div>
    <div role="button" tabIndex={0} aria-label="Upload photos"
      onClick={() => !uploading && inputRef.current?.click()}
      onKeyDown={event => { if ((event.key === "Enter" || event.key === " ") && !uploading) { event.preventDefault(); inputRef.current?.click() } }}
      onDragEnter={event => { event.preventDefault(); setDragging(true) }}
      onDragOver={event => event.preventDefault()}
      onDragLeave={event => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
      onDrop={event => { event.preventDefault(); setDragging(false); void uploadFiles(event.dataTransfer.files) }}
      className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center transition-colors focus-visible:outline-2 focus-visible:outline-primary ${dragging ? "border-primary bg-primary/5" : "border-border bg-muted/20 hover:bg-muted/40"}`}
    >
      {uploading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : <Upload className="size-5 text-muted-foreground" />}
      <span className="text-sm font-medium">{uploading ? "Uploading photos…" : "Drop photos here or browse files"}</span>
      <span className="text-xs text-muted-foreground">You can select multiple photos</span>
      <input ref={inputRef} type="file" className="sr-only" multiple disabled={uploading}
        accept="image/*,.heic,.heif,.tif,.tiff"
        onChange={event => { if (event.target.files) void uploadFiles(event.target.files) }} />
    </div>
    {loading ? <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading photos…</div>
      : photos.length === 0 ? <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">No photos uploaded yet.</p>
      : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {photos.map(photo => <div key={photo.id} className="min-w-0 overflow-hidden rounded-lg border">
          <div className="relative flex h-44 items-center justify-center bg-muted/30">
            {photo.previewUrl && !brokenIds.includes(photo.id) ? <Image src={photo.previewUrl} alt={photo.file_name} fill unoptimized className="object-cover" onError={() => setBrokenIds(current => [...current, photo.id])} /> : <ImageIcon className="size-8 text-muted-foreground" />}
          </div>
          <div className="space-y-1 p-3">
            <p className="truncate text-sm font-medium" title={photo.file_name}>{photo.file_name}</p>
            <p className="text-xs text-muted-foreground">{new Date(photo.created_at).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })} · {photo.users?.name || photo.users?.email || "Unknown"}</p>
            <div className="flex gap-1 pt-1">
              <Button size="sm" variant="ghost" className="h-8 px-2" title="View photo" aria-label={`View ${photo.file_name}`} onClick={() => void openPhoto(photo)}><Eye className="size-3.5" /></Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" title="Download photo" aria-label={`Download ${photo.file_name}`} onClick={() => void openPhoto(photo, true)}><Download className="size-3.5" /></Button>
              <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive hover:text-destructive" title="Delete photo" aria-label={`Delete ${photo.file_name}`} disabled={deletingId === photo.id} onClick={() => void deletePhoto(photo)}><Trash2 className="size-3.5" /></Button>
            </div>
          </div>
        </div>)}
      </div>}
  </div>
}
