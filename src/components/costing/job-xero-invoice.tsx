"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { CostingJob } from "@/types/database"
import { toast } from "sonner"

type Preview = {
  invoice: {
    invoiceId: string
    invoiceNumber: string
    status: string
    contactName: string
    total: number
    updatedAt: string
    lines: Array<{ description: string; quantity: number | null; unitAmount: number | null }>
  }
  proposedLines: Array<{ Description: string; Quantity?: number; UnitAmount?: number }>
}

export function JobXeroInvoice({ job, onChanged }: { job: CostingJob; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [number, setNumber] = useState(job.xero_invoice_number || "")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const linked = !!job.xero_invoice_id
  const baseUrl = "/api/xero/invoices/" + encodeURIComponent(job.id)

  async function showPreview() {
    setBusy(true)
    setError("")
    setPreview(null)
    try {
      const query = linked ? "" : "?number=" + encodeURIComponent(number.trim())
      const response = await fetch(baseUrl + query, { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not load the invoice.")
      setPreview(body as Preview)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the invoice.")
    } finally {
      setBusy(false)
    }
  }

  async function submit(action: "link" | "push") {
    if (!preview) return
    setBusy(true)
    setError("")
    try {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "link"
          ? { action, invoiceNumber: preview.invoice.invoiceNumber }
          : { action, expectedUpdatedAt: preview.invoice.updatedAt }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not update the invoice.")
      toast.success(action === "link"
        ? "Xero invoice " + preview.invoice.invoiceNumber + " linked to this job"
        : "Xero invoice " + preview.invoice.invoiceNumber + " updated")
      setOpen(false)
      setPreview(null)
      onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the invoice.")
      if (action === "push") setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  return <>
    <Button variant="outline" size="sm" className="h-8" onClick={() => { setOpen(true); setError(""); setPreview(null); setNumber(job.xero_invoice_number || "") }}>
      {linked ? "Update Xero invoice" : "Link existing Xero invoice"}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{linked ? "Update linked Xero invoice" : "Link existing Xero invoice"}</DialogTitle>
          <DialogDescription>
            {linked
              ? "Review both sets of lines. Pushing replaces every line on this draft invoice with the RPM selling lines."
              : "Find the draft sales invoice by its existing number. Linking does not change it in Xero."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!linked && <div className="flex gap-2">
            <Input aria-label="Xero invoice number" value={number} onChange={(event) => { setNumber(event.target.value); setPreview(null) }} placeholder="Existing invoice number" />
            <Button variant="secondary" onClick={showPreview} disabled={busy || !number.trim()}>Find</Button>
          </div>}
          {linked && !preview && <Button variant="secondary" onClick={showPreview} disabled={busy}>{busy ? "Loading…" : "Preview changes"}</Button>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {preview && <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3">
              <div className="font-medium">{preview.invoice.invoiceNumber} · {preview.invoice.status}</div>
              <div className="text-muted-foreground">{preview.invoice.contactName || "No Xero contact"} · Current total: {preview.invoice.total.toFixed(2)}</div>
            </div>
            {linked && <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border p-3">
                <div className="mb-2 font-medium">Currently in Xero ({preview.invoice.lines.length})</div>
                <div className="max-h-44 overflow-auto space-y-1">
                  {preview.invoice.lines.map((line, index) => <div key={index} className="border-t pt-1 whitespace-pre-wrap">{line.description || "Blank line"}{line.quantity != null ? " · " + line.quantity + " × " + Number(line.unitAmount || 0).toFixed(2) : ""}</div>)}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="mb-2 font-medium">From RPM ({preview.proposedLines.length})</div>
                <div className="max-h-44 overflow-auto space-y-1">
                  {preview.proposedLines.map((line, index) => <div key={index} className="border-t pt-1 whitespace-pre-wrap">{line.Description}{line.Quantity != null ? " · " + line.Quantity + " × " + Number(line.UnitAmount || 0).toFixed(2) : ""}</div>)}
                </div>
              </div>
            </div>}
            {linked && <p className="text-xs text-muted-foreground">The invoice number, customer, dates and status stay in Xero. Xero calculates the final tax and total.</p>}
          </div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          {preview && <Button onClick={() => void submit(linked ? "push" : "link")} disabled={busy}>
            {busy ? "Working…" : linked ? "Replace draft invoice lines" : "Link this invoice"}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
