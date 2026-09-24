"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

type Session = { id: string; kind: string; started_at: string; stopped_at: string | null; user_id: string; users?: {name:string|null} | null }
type Photo = { id: string; storage_path: string; caption: string | null; category: string; captured_at: string; user_id: string; published_site_photo_id: string | null; users?: {name:string|null} | null; url?: string }
type InstallerNote = { id: string; body: string; created_at: string; user_id: string; users?: {name:string|null} | null }

export function InstallerActivity({ jobId, canDeletePhotos = false }: { jobId: string; canDeletePhotos?: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const [sessions, setSessions] = useState<Session[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [notes, setNotes] = useState<InstallerNote[]>([])
  const [brokenPhotoIds, setBrokenPhotoIds] = useState<string[]>([])
  const [error, setError] = useState("")
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      const [timeResult, photoResult, noteResult] = await Promise.all([
        supabase.from("installer_time_sessions").select("id,kind,started_at,stopped_at,user_id,users(name)").eq("job_id",jobId).order("started_at",{ascending:false}),
        supabase.from("installer_photos").select("id,storage_path,caption,category,captured_at,user_id,published_site_photo_id,users(name)").eq("job_id",jobId).order("captured_at",{ascending:false}),
        supabase.from("installer_job_notes").select("id,body,created_at,user_id,users(name)").eq("job_id",jobId).order("created_at",{ascending:false}),
      ])
      if (!live) return
      if (timeResult.error || photoResult.error || noteResult.error) { setError(timeResult.error?.message || photoResult.error?.message || noteResult.error?.message || "Could not load installer activity"); return }
      setSessions((timeResult.data || []) as Session[])
      setNotes((noteResult.data || []) as InstallerNote[])
      const photoRows = (photoResult.data || []) as Photo[]
      const signed = await Promise.all(photoRows.map(async photo => {
        const { data } = await supabase.storage.from("installer-photos").createSignedUrl(photo.storage_path, 300)
        return { ...photo, url: data?.signedUrl }
      }))
      if (live) setPhotos(signed)
    })()
    return () => { live = false }
  }, [supabase, jobId])

  async function deletePhoto(photo: Photo) {
    const publishedNote = photo.published_site_photo_id ? " Its separately published site gallery copy will remain." : ""
    if (!window.confirm(`Delete this job photo? This cannot be undone.${publishedNote}`)) return
    setDeletingPhotoId(photo.id)
    try {
      const { error: storageError } = await supabase.storage.from("installer-photos").remove([photo.storage_path])
      if (storageError) throw storageError
      const { error: recordError } = await supabase.from("installer_photos").delete().eq("id", photo.id).select("id").single()
      if (recordError) throw recordError
      setPhotos(current => current.filter(item => item.id !== photo.id))
      toast.success("Job photo deleted")
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not delete job photo")
    } finally {
      setDeletingPhotoId(null)
    }
  }

  return <div className="space-y-5 py-3">
    {error && <p className="text-sm text-destructive">{error}</p>}
    <section><h3 className="font-semibold">Installer notes</h3>
      {notes.length ? <div className="mt-2 divide-y rounded border">{notes.map(note => <div key={note.id} className="p-3 text-sm">
        <p className="whitespace-pre-wrap">{note.body}</p>
        <p className="mt-1 text-xs text-muted-foreground">{note.users?.name || "Installer"} · {new Date(note.created_at).toLocaleString("en-NZ")}</p>
      </div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No installer notes yet.</p>}
    </section>
    <section><h3 className="font-semibold">Travel and work</h3>
      {sessions.length ? <div className="mt-2 divide-y rounded border">{sessions.map(s => <div key={s.id} className="flex justify-between gap-3 p-3 text-sm">
        <span className="capitalize">{s.users?.name || "Installer"} · {s.kind}</span><span>{new Date(s.started_at).toLocaleString("en-NZ")}</span>
        <span>{s.stopped_at ? `${((new Date(s.stopped_at).getTime()-new Date(s.started_at).getTime())/3600000).toFixed(2)} h` : "Running"}</span>
      </div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No installer time recorded.</p>}
    </section>
    <section><h3 className="font-semibold">Job photos</h3><p className="mt-1 text-xs text-muted-foreground">Photos belong to this job, including manufacture-only work with no site.</p>
      {photos.length ? <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">{photos.map(p => <div key={p.id} className="rounded border p-2">
        {p.url && !brokenPhotoIds.includes(p.id) ? <a href={p.url} target="_blank" rel="noreferrer"><Image src={p.url} alt={p.caption || `${p.category} photo`} width={300} height={200} unoptimized className="h-40 w-full rounded object-cover" onError={() => setBrokenPhotoIds(current => [...current, p.id])} /></a> : <div className="flex h-40 items-center justify-center rounded bg-muted text-xs text-muted-foreground">Photo unavailable</div>}
        <p className="mt-1 text-xs font-medium">{p.category}</p><p className="text-xs text-muted-foreground">{p.users?.name || "RPM Mobile"} · {p.caption || new Date(p.captured_at).toLocaleString("en-NZ")}</p>
        {canDeletePhotos && <Button type="button" variant="outline" size="sm" className="mt-2 w-full" disabled={deletingPhotoId !== null} onClick={() => void deletePhoto(p)}><Trash2 className="mr-1.5 h-3.5 w-3.5" />{deletingPhotoId === p.id ? "Deleting…" : "Delete photo"}</Button>}
      </div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No job photos uploaded.</p>}
    </section>
  </div>
}
