"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import type { CostingJob } from "@/types/database"

export function CancelJobAction({ job, canCancel, onCancelled }: {
  job: CostingJob; canCancel: boolean; onCancelled: () => void | Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  if (!canCancel || job.status !== "in_progress") return null

  async function cancelJob() {
    if (saving) return
    setSaving(true)
    try {
      const response = await fetch(`/api/costing/jobs/${job.id}/cancel`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true, reason }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || "Could not cancel the job.")
      setOpen(false)
      await onCancelled()
      toast.success("Job cancelled. History preserved; Xero was not changed.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel the job.")
    } finally {
      setSaving(false)
    }
  }

  return <>
    <Button variant="outline" size="sm" onClick={() => { setReason(""); setOpen(true) }}>Cancel job</Button>
    <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel job {job.job_number || job.xero_invoice_number || job.title}?</DialogTitle>
          <DialogDescription>This removes the job from Active Jobs and active expected revenue. It will appear in Cancelled Jobs. The BOM, job history and Xero reference are kept. The Xero invoice will not be deleted or voided. Cancellation cannot be undone here. If work has started or materials have been ordered, review those commitments first.</DialogDescription>
        </DialogHeader>
        <Label htmlFor="cancellation-reason">Reason (optional)</Label>
        <Textarea id="cancellation-reason" maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} disabled={saving}/>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Keep job</Button>
          <Button variant="destructive" disabled={saving} onClick={() => void cancelJob()}>{saving ? "Cancelling…" : "Confirm cancellation"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>
}
