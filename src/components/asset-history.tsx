"use client"

import { useMemo, useRef, useState, type FormEvent } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import { useCustomerFilter } from "@/lib/customer-filter"
import { JobTimeline } from "@/components/job-timeline"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { AssetHistoryEntry, Job } from "@/types/database"

function today() {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function AssetHistory({ assetId, jobs }: { assetId: string; jobs: Job[] }) {
    const supabase = useMemo(() => createClient(), [])
    const { isAdmin } = useCustomerFilter()
    const { data: entries, error, isLoading, mutate } = useSupabaseQuery<AssetHistoryEntry[]>(
        `asset-${assetId}-history`,
        () => supabase.from("asset_history_entries").select("*").eq("asset_id", assetId)
            .order("occurred_on", { ascending: false }).order("created_at", { ascending: false }),
        { keepPreviousData: false },
    )
    const [open, setOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const submitting = useRef(false)
    const [date, setDate] = useState(today)
    const [title, setTitle] = useState("")
    const [notes, setNotes] = useState("")

    function changeOpen(next: boolean) {
        if (submitting.current) return
        setOpen(next)
        if (next) {
            setDate(today())
            setTitle("")
            setNotes("")
        }
    }

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (submitting.current || !isAdmin || !title.trim() || !date) return
        submitting.current = true
        setSaving(true)
        try {
            const { data, error: saveError } = await supabase.from("asset_history_entries").insert({
                asset_id: assetId, occurred_on: date, title: title.trim(), notes: notes.trim(),
            }).select("*").single()
            if (saveError) throw saveError
            // Show the saved row immediately, then refresh in the background.
            await mutate((current) => [data as AssetHistoryEntry, ...(current || [])], { revalidate: false })
            setOpen(false)
            toast.success("History entry added")
            void mutate()
        } catch {
            toast.error("Could not save the history entry. Your details are still here; please try again.")
        } finally {
            submitting.current = false
            setSaving(false)
        }
    }

    return <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold italic">Service Log &amp; Asset History</h3>
            {isAdmin && <Dialog open={open} onOpenChange={changeOpen}>
                <DialogTrigger asChild><Button size="sm" className="gap-2"><Plus className="size-4" />Add history entry</Button></DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add history entry</DialogTitle>
                        <DialogDescription>Record work, an inspection, or a note for this asset. Use the date it happened.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={save} className="space-y-4">
                        <fieldset disabled={saving} className="space-y-4">
                            <div className="space-y-2"><Label htmlFor="history-date">Date</Label><Input id="history-date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></div>
                            <div className="space-y-2"><Label htmlFor="history-title">Title</Label><Input id="history-title" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Height restrictor repaired" /></div>
                            <div className="space-y-2"><Label htmlFor="history-notes">Notes (optional)</Label><Textarea id="history-notes" maxLength={10000} rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
                        </fieldset>
                        <DialogFooter>
                            <Button type="button" variant="outline" disabled={saving} onClick={() => changeOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={saving || !title.trim() || !date}>{saving ? "Saving…" : "Save entry"}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>}
        </div>
        {isLoading && <p className="text-sm text-muted-foreground" role="status">Loading history entries…</p>}
        {error && <div role="alert" className="flex items-center gap-3 text-sm text-destructive">Could not load manual history entries.<Button variant="outline" size="sm" onClick={() => void mutate()}>Retry</Button></div>}
        <JobTimeline jobs={jobs} historyEntries={entries || []} hideEmpty={isLoading || Boolean(error)} />
    </div>
}
