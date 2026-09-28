"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, NotebookPen, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"

type InternalNote = {
  id: string
  body: string
  created_at: string
  users: { name: string | null; email: string | null } | null
}

export function JobInternalNotes({ jobId }: { jobId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [notes, setNotes] = useState<InternalNote[]>([])
  const [body, setBody] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadNotes = useCallback(async () => {
    const { data, error } = await supabase
      .from("costing_job_internal_notes")
      .select("id,body,created_at,users:created_by(name,email)")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
    setLoading(false)
    if (error) {
      toast.error(`Could not load notes: ${error.message}`)
      return
    }
    setNotes((data || []) as InternalNote[])
  }, [jobId, supabase])

  useEffect(() => { void Promise.resolve().then(loadNotes) }, [loadNotes])

  async function addNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = body.trim()
    if (!content || saving) return
    setSaving(true)
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error("Sign in to add a note.")
      const { error } = await supabase.from("costing_job_internal_notes").insert({
        job_id: jobId,
        body: content,
        created_by: user.id,
      })
      if (error) throw error
      setBody("")
      toast.success("Internal note added")
      await loadNotes()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the note.")
    } finally {
      setSaving(false)
    }
  }

  async function deleteNote(note: InternalNote) {
    if (!window.confirm("Delete this internal note? This cannot be undone.")) return
    setDeletingId(note.id)
    try {
      const { error } = await supabase.from("costing_job_internal_notes").delete().eq("id", note.id).eq("job_id", jobId)
      if (error) throw error
      setNotes(current => current.filter(item => item.id !== note.id))
      toast.success("Internal note deleted")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the note.")
    } finally {
      setDeletingId(null)
    }
  }

  return <div className="space-y-4 pt-4">
    <div>
      <h2 className="text-sm font-semibold">Internal notes</h2>
      <p className="mt-1 text-xs text-muted-foreground">For the RPM team only. These notes are not included in the customer quote, Xero, or the job pack.</p>
    </div>
    <form onSubmit={event => void addNote(event)} className="space-y-2 rounded-lg border bg-muted/15 p-4">
      <label htmlFor="internal-job-note" className="text-sm font-medium">Add a note</label>
      <Textarea id="internal-job-note" value={body} onChange={event => setBody(event.target.value)} maxLength={10000} className="min-h-28" placeholder="Write an internal note for this quote or job" required />
      <div className="flex justify-end"><Button type="submit" size="sm" disabled={saving || !body.trim()}>{saving ? <><Loader2 className="mr-2 size-4 animate-spin" />Saving…</> : "Add note"}</Button></div>
    </form>
    {loading ? <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading notes…</div>
      : notes.length === 0 ? <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">No internal notes yet.</p>
      : <div className="space-y-2">
        {notes.map(note => <div key={note.id} className="rounded-lg border px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><NotebookPen className="size-4" /><span>{note.users?.name || note.users?.email || "Unknown"} · {new Date(note.created_at).toLocaleString("en-NZ", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</span></div>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" title="Delete note" aria-label="Delete note" disabled={deletingId === note.id} onClick={() => void deleteNote(note)}><Trash2 className="size-3.5" /></Button>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{note.body}</p>
        </div>)}
      </div>}
  </div>
}
