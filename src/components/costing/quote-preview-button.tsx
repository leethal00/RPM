"use client"

import { useMemo, useState } from "react"
import { Eye, RefreshCw } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { buildXeroQuoteLines, type QuoteCostLine, type QuoteItem, type QuoteLine } from "@/lib/xero-quote-lines"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const money = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" })

export function QuotePreviewButton({ jobId }: { jobId: string }) {
    const supabase = useMemo(() => createClient(), [])
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [lines, setLines] = useState<QuoteLine[] | null>(null)

    async function loadPreview() {
        setLoading(true)
        setError("")
        setLines(null)
        try {
            const [{ data: job, error: jobError }, { data: items, error: itemsError }, { data: costs, error: costsError }] = await Promise.all([
                supabase.from("costing_jobs").select("title,details,contact_name").eq("id", jobId).single(),
                supabase.from("costing_items").select("id,name,size,details,delivery,sign_code,mode,qty,build_qty,unit_price,sort").eq("job_id", jobId).order("sort"),
                supabase.from("costing_lines").select("item_id,qty,unit_cost,markup,unit_sell_override").eq("job_id", jobId),
            ])
            if (jobError) throw jobError
            if (itemsError) throw itemsError
            if (costsError) throw costsError
            if (!job) throw new Error("Quote not found.")
            if (!items?.length) throw new Error("Add an item to this quote to preview it.")
            setLines(buildXeroQuoteLines(job, items as QuoteItem[], (costs || []) as QuoteCostLine[]))
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not load quote preview.")
        } finally {
            setLoading(false)
        }
    }

    const subtotal = (lines || []).reduce((sum, line) => sum + Number(line.Quantity || 0) * Number(line.UnitAmount || 0), 0)

    return <>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => { setOpen(true); void loadPreview() }}>
            <Eye className="size-3.5" /> Preview quote
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[820px]">
                <DialogHeader>
                    <DialogTitle>Quote preview</DialogTitle>
                    <DialogDescription>Shows the current RPM wording and prices that will be sent on the next Xero quote update. This preview does not contact or change Xero.</DialogDescription>
                </DialogHeader>
                {loading && <p className="py-8 text-center text-sm text-muted-foreground">Loading quote…</p>}
                {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
                {lines && <div className="max-h-[65vh] overflow-auto rounded-md border text-sm">
                    <div className="grid min-w-[600px] grid-cols-[minmax(0,1fr)_70px_105px_110px] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                        <span>Description</span><span className="text-right">Qty</span><span className="text-right">Unit price</span><span className="text-right">Amount</span>
                    </div>
                    {lines.map((line, index) => <div key={index} className="grid min-w-[600px] grid-cols-[minmax(0,1fr)_70px_105px_110px] gap-2 border-b px-3 py-2 last:border-b-0">
                        <span className="whitespace-pre-wrap break-words">{line.Description}</span>
                        <span className="text-right tabular-nums">{line.Quantity == null ? "" : line.Quantity}</span>
                        <span className="text-right tabular-nums">{line.UnitAmount == null ? "" : money.format(line.UnitAmount)}</span>
                        <span className="text-right tabular-nums">{line.Quantity == null || line.UnitAmount == null ? "" : money.format(line.Quantity * line.UnitAmount)}</span>
                    </div>)}
                    <div className="flex min-w-[600px] justify-end gap-8 bg-muted/30 px-3 py-2 font-medium"><span>Subtotal before GST</span><span className="min-w-[110px] text-right tabular-nums">{money.format(subtotal)}</span></div>
                </div>}
                <DialogFooter>
                    <Button variant="outline" onClick={() => void loadPreview()} disabled={loading} className="gap-1.5"><RefreshCw className="size-3.5" /> Refresh</Button>
                    <Button onClick={() => setOpen(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </>
}
