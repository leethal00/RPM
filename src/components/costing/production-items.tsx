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

type QuotedItemSeed = {
  id: string
  name: string | null
  details: string | null
  qty: number | string | null
  sort: number | null
}

export function ProductionItems({ jobId }: { jobId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<ProductionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function initialise() {
      const existingResult = await supabase
        .from("production_job_items")
        .select("id,job_id,source_item_id,name,details,qty,sort")
        .eq("job_id", jobId)
        .order("sort")

      if (!active) return
      if (existingResult.error) {
        toast.error(existingResult.error.message)
        setLoading(false)
        return
      }

      const existing = (existingResult.data ?? []) as ProductionItem[]
      if (existing.length > 0) {
        setItems(existing)
        setLoading(false)
        return
      }

      const quotedResult = await supabase
        .from("costing_items")
        .select("id,name,details,qty,sort")
        .eq("job_id", jobId)
        .order("sort")

      if (!active) return
      if (quotedResult.error) {
        toast.error(quotedResult.error.message)
        setLoading(false)
        return
      }

      const quoted = (quotedResult.data ?? []) as QuotedItemSeed[]
      if (quoted.length === 0) {
        setItems([])
        setLoading(false)
        return
      }

      const seedRows = quoted.map((item) => ({
        job_id: jobId,
        source_item_id: item.id,
        name: item.name || "",
        details: item.details || null,
        qty: Number(item.qty || 1),
        sort: item.sort || 0,
      }))

      const insertResult = await supabase
        .from("production_job_items")
        .insert(seedRows)
        .select("id,job_id,source_item_id,name,details,qty,sort")

      if (!active) return
      if (insertResult.error) {
        toast.error(insertResult.error.message)
        setLoading(false)
        return
      }

      const inserted = ((insertResult.data ?? []) as ProductionItem[]).sort((a, b) => a.sort - b.sort)
      setItems(inserted)
      setLoading(false)
    }

    void initialise()
    return () => { active = false }
  }, [jobId, supabase])

  function patch(id: string, changes: Partial<ProductionItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item))
  }

  async function save(item: ProductionItem) {
    setSaving(item.id)
    const result = await supabase
      .from("production_job_items")
      .update({
        name: item.name.trim(),
        details: item.details?.trim() || null,
        qty: Number(item.qty || 1),
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
    setSaving(null)

    if (result.error) toast.error(result.error.message)
    else toast.success("Job item saved")
  }

  async function addItem() {
    const nextSort = items.length > 0 ? Math.max(...items.map((item) => item.sort)) + 10 : 0
    const result = await supabase
      .from("production_job_items")
      .insert({ job_id: jobId, name: "New item", qty: 1, sort: nextSort })
      .select("id,job_id,source_item_id,name,details,qty,sort")
      .single()

    if (result.error) {
      toast.error(result.error.message)
      return
    }

    setItems((current) => [...current, result.data as ProductionItem])
  }

  async function remove(item: ProductionItem) {
    if (!window.confirm(`Delete job item "${item.name}"? The completed quote history will remain unchanged.`)) return
    const result = await supabase.from("production_job_items").delete().eq("id", item.id)
    if (result.error) {
      toast.error(result.error.message)
      return
    }
    setItems((current) => current.filter((row) => row.id !== item.id))
  }

  if (loading) return <div className="py-10 text-sm text-muted-foreground">Preparing job items…</div>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">Job items</div>
          <p className="text-sm text-muted-foreground">Edit the working job lines here. The completed quote remains available in quote history.</p>
        </div>
        <Button size="sm" variant="outline" onClick={addItem} className="gap-1.5">
          <Plus className="size-3.5"/> Add line
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60">
        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No job items yet.</div>
        ) : (
          items.map((item, index) => (
            <div
              key={item.id}
              className={`grid grid-cols-[minmax(180px,1.1fr)_minmax(260px,2fr)_90px_auto] items-start gap-3 p-3 ${index > 0 ? "border-t border-border/60" : ""}`}
            >
              <Input value={item.name} onChange={(event) => patch(item.id, { name: event.target.value })}/>
              <Textarea
                value={item.details || ""}
                onChange={(event) => patch(item.id, { details: event.target.value })}
                className="min-h-[60px]"
                placeholder="Description / instructions…"
              />
              <Input
                type="number"
                min="0"
                step="any"
                value={item.qty}
                onChange={(event) => patch(item.id, { qty: Number(event.target.value) })}
              />
              <div className="flex gap-1.5 pt-0.5">
                <Button size="icon-sm" variant="outline" title="Save" onClick={() => void save(item)} disabled={saving === item.id}>
                  <Save className="size-3.5"/>
                </Button>
                <Button size="icon-sm" variant="ghost" title="Delete" onClick={() => void remove(item)}>
                  <Trash2 className="size-3.5 text-destructive"/>
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
