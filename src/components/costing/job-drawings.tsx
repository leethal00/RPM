"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Download, Eye, FileText, Loader2, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"

const BUCKET = "quote-job-drawings"
const MAX_SIZE = 50 * 1024 * 1024
const EXTENSIONS = new Set([
  "pdf", "dwg", "dxf", "png", "jpg", "jpeg", "webp", "gif", "tif", "tiff",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx",
])

type Drawing = {
  id: string
  file_name: string
  storage_path: string
  file_size: number
  created_at: string
  users: { name: string | null; email: string | null } | null
}

export function JobDrawings({ jobId }: { jobId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const inputRef = useRef<HTMLInputElement>(null)
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadDrawings = useCallback(async () => {
    const { data, error } = await supabase
      .from("costing_job_drawings")
      .select("id,file_name,storage_path,file_size,created_at,users:uploaded_by(name,email)")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
    setLoading(false)
    if (error) {
      toast.error(`Could not load drawings: ${error.message}`)
      return
    }
    setDrawings((data || []) as Drawing[])
  }, [jobId, supabase])

  useEffect(() => { void loadDrawings() }, [loadDrawings])

  async function uploadFiles(files: FileList | File[]) {
    if (uploading) return
    const selected = Array.from(files)
    if (!selected.length) return
    const invalid = selected.find(file => !EXTENSIONS.has(file.name.split(".").pop()?.toLowerCase() || "") || !file.size || file.size > MAX_SIZE)
    if (invalid) {
      toast.error(`Unsupported or oversized file: ${invalid.name}. Use PDF, DWG/DXF, images or Office files up to 50 MB.`)
      return
    }

    setUploading(true)
    let uploaded = 0
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error("Sign in to upload drawings.")

      for (const file of selected) {
        const extension = file.name.split(".").pop()!.toLowerCase()
        const path = `${jobId}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        })
        if (uploadError) throw uploadError

        const { error: recordError } = await supabase.from("costing_job_drawings").insert({
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
      toast.success(`${uploaded} drawing${uploaded === 1 ? "" : "s"} uploaded`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload drawings.")
      if (uploaded) toast.info(`${uploaded} drawing${uploaded === 1 ? "" : "s"} uploaded before the error.`)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
      await loadDrawings()
    }
  }

  async function openDrawing(drawing: Drawing, download = false) {
    const preview = download ? null : window.open("", "_blank")
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(
        drawing.storage_path, 60, download ? { download: drawing.file_name } : undefined,
      )
      if (error || !data?.signedUrl) throw error || new Error("Could not open drawing.")
      if (download) {
        const anchor = document.createElement("a")
        anchor.href = data.signedUrl
        anchor.download = drawing.file_name
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
      } else if (preview) {
        preview.location.href = data.signedUrl
      } else {
        window.location.href = data.signedUrl
      }
    } catch (error) {
      preview?.close()
      toast.error(error instanceof Error ? error.message : "Could not open drawing.")
    }
  }

  async function deleteDrawing(drawing: Drawing) {
    if (!window.confirm(`Delete ${drawing.file_name}? This cannot be undone.`)) return
    setDeletingId(drawing.id)
    try {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([drawing.storage_path])
      if (storageError) throw storageError
      const { error: recordError } = await supabase.from("costing_job_drawings").delete().eq("id", drawing.id).eq("job_id", jobId)
      if (recordError) throw recordError
      setDrawings(current => current.filter(item => item.id !== drawing.id))
      toast.success("Drawing deleted")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete drawing.")
      await loadDrawings()
    } finally {
      setDeletingId(null)
    }
  }

  return <div className="space-y-4 pt-4">
    <div>
      <h2 className="text-sm font-semibold">Received drawings</h2>
      <p className="text-xs text-muted-foreground mt-1">Files received for this quote or job. PDF, DWG/DXF, images and Office files, up to 50 MB each.</p>
    </div>
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload drawings"
      onClick={() => !uploading && inputRef.current?.click()}
      onKeyDown={event => { if ((event.key === "Enter" || event.key === " ") && !uploading) { event.preventDefault(); inputRef.current?.click() } }}
      onDragEnter={event => { event.preventDefault(); setDragging(true) }}
      onDragOver={event => event.preventDefault()}
      onDragLeave={event => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
      onDrop={event => { event.preventDefault(); setDragging(false); void uploadFiles(event.dataTransfer.files) }}
      className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center transition-colors focus-visible:outline-2 focus-visible:outline-primary ${dragging ? "border-primary bg-primary/5" : "border-border bg-muted/20 hover:bg-muted/40"}`}
    >
      {uploading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : <Upload className="size-5 text-muted-foreground" />}
      <span className="text-sm font-medium">{uploading ? "Uploading drawings…" : "Drop drawings here or browse files"}</span>
      <span className="text-xs text-muted-foreground">You can select multiple files</span>
      <input ref={inputRef} type="file" className="sr-only" multiple disabled={uploading}
        accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.webp,.gif,.tif,.tiff,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        onChange={event => { if (event.target.files) void uploadFiles(event.target.files) }} />
    </div>
    {loading ? <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading drawings…</div>
      : drawings.length === 0 ? <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">No drawings uploaded yet.</p>
      : <div className="overflow-hidden rounded-lg border">
        <div className="hidden grid-cols-[minmax(0,1fr)_10rem_12rem_11rem] gap-3 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground sm:grid">
          <span>Filename</span><span>Uploaded</span><span>Uploaded by</span><span>Actions</span>
        </div>
        {drawings.map(drawing => <div key={drawing.id} className="grid gap-2 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_10rem_12rem_11rem] sm:items-center sm:gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm"><FileText className="size-4 shrink-0 text-muted-foreground" /><span className="truncate" title={drawing.file_name}>{drawing.file_name}</span></div>
          <span className="text-xs text-muted-foreground">{new Date(drawing.created_at).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })}</span>
          <span className="truncate text-xs text-muted-foreground">{drawing.users?.name || drawing.users?.email || "Unknown"}</span>
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 px-2" onClick={() => void openDrawing(drawing)} title="View drawing"><Eye className="size-3.5" /><span className="sr-only">View {drawing.file_name}</span></Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 px-2" onClick={() => void openDrawing(drawing, true)} title="Download drawing"><Download className="size-3.5" /><span className="sr-only">Download {drawing.file_name}</span></Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 px-2 text-destructive hover:text-destructive" disabled={deletingId === drawing.id} onClick={() => void deleteDrawing(drawing)} title="Delete drawing"><Trash2 className="size-3.5" /><span className="sr-only">Delete {drawing.file_name}</span></Button>
          </div>
        </div>)}
      </div>}
  </div>
}
