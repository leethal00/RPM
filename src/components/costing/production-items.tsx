"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

type ProductionItem = {
  id: string
  job_id: string
  source_item_id: string | null
  name: string
  details: string | null
  qty: number
  sort: number
}

export function ProductionItems({ jobId }: { jobId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<ProductionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    let { data, error } = await supabase.from("production_job_items").select("*").eq("job_id", jobId).order("sort")
    if (error) { toast.error(error.message); setLoading(false); return }

    if (!data?.length) {
      const { data: quoted, error: quotedError } = await supabase.from("costing_items").select("id,name,details,qty,sort").eq("job_id", jobId).order("sort")
      if (quotedError) { toast.error(quotedError.message); setLoading(false); return }
      if (quoted?.length) {
        const rows = quoted.map((q) => ({ job_id: jobId, source_item_id: q.id, name: q.name || "", details: q.details || null, qty: Number(q.qty || 1), sort: q.sort || 0 }))
        const inserted = await supabase.from("production_job_items").insert(rows).select("*").order("sort")
        if (inserted.error) { toast.error(inserted.error.message); setLoading(false); return }
        data = inserted.data
      }
    }
    setItems((data as ProductionItem[]) || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [jobId])

  function patch(id: string, changes: Partial<ProductionItem>) {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, ...changes } : item))
  }

  async function save(item: ProductionItem) {
    setSaving(item.id)
    const { error } = await supabase.from("production_job_items").update({
      name: item.name.trim(), details: item.details?.trim() || null, qty: Number(item.qty || 1), updated_at: new Date().toISOString(),
    }).eq("id", item.id)
    setSaving(null)
    if (error) toast.error(error.message)
    else toast.success("Production item saved")
  }

  async function addItem() {
    const sort = items.length ? Math.max(...items.map((i) => i.sort)) + 10 : 0
    const { data, error } = await supabase.from("production_job_items").insert({ job_id: jobId, name: "New production item", qty: 1, sort }).select("*").single()
    if (error) toast.error(error.message)
    else setItems((prev) => [...prev, data as ProductionItem])
  }

  async function remove(item: ProductionItem) {
    if (!window.confirm(`Delete production item “${item.name}”? The original quoted item will remain unchanged.`)) return
    const { error } = await supabase.from("production_job_items").delete().eq("id", item.id)
    if (error) toast.error(error.message)
    else setItems((prev) => prev.filter((x) => x.id !== item.id))
  }

  if (loading) return <div className="py-10 text-sm text-muted-foreground">Preparing production items…</div>

  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="font-medium">Production items</div>
        <p className="text-sm text-muted-foreground">Working job version. Changes here do not alter the approved quote.</p>
      </div>
      <Button size="sm" variant="outline" onClick={addItem} className="gap-1.5"><Plus className="size-3.5"/> Add line</Button>
    </div>

    <div className="rounded-lg border border-border/60 overflow-hidden">
      {items.length === 0 ? <div className="p-8 text-sm text-center text-muted-foreground">No production items yet.</div> : items.map((item, index) => (
        <div key={item.id} className={`grid grid-cols-[minmax(180px,1.1fr)_minmax(260px,2fr)_90px_auto] gap-3 p-3 items-start ${index ? "border-t border-border/60" : ""}`}>
          <Input value={item.name} onChange={(e) => patch(item.id, { name: e.target.value })} />
          <Textarea value={item.details || ""} onChange={(e) => patch(item.id, { details: e.target.value })} className="min-h-[60px]" placeholder="Production description / instructions…" />
          <Input type="number" min="0" step="any" value={item.qty} onChange={(e) => patch(item.id, { qty: Number(e.target.value) })} />
          <div className="flex gap-1.5 pt-0.5">
            <Button size="icon-sm" variant="outline" title="Save" onClick={() => save(item)} disabled={saving === item.id}><Save className="size-3.5"/></Button>
            <Button size="icon-sm" variant="ghost" title="Delete" onClick={() => remove(item)}><Trash2 className="size-3.5 text-destructive"/></Button>
          </div>
        </div>
      ))}
    </div>
  </div>
}
