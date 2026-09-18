"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Plus, Trash2, ChevronRight, Package2, Search, ArrowUp, ArrowDown, GripVertical, Copy } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { NumCell, TextCell } from "./cells"
import type { CostingJob, CostingItem, CostingLine } from "@/types/database"

const nz = (n: number) => n.toLocaleString("en-NZ", { style: "currency", currency: "NZD" })
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const lineCost = (l: CostingLine) => Number(l.qty) * Number(l.unit_cost)
const unitSell = (l: CostingLine) => l.unit_sell_override != null ? Number(l.unit_sell_override) : Number(l.unit_cost) * (1 + Number(l.markup))
const lineSell = (l: CostingLine) => Number(l.qty) * unitSell(l)
const SECTION_HEADING_CODE = "__RPM_SECTION_HEADING__"
const NOTE_CODE = "__RPM_NOTE__"
const isSectionHeading = (item: CostingItem) => item.sign_code === SECTION_HEADING_CODE
const isNote = (item: CostingItem) => item.sign_code === NOTE_CODE

type XeroProduct = { id: string; code: string; name: string; description: string; sell: number; cost: number }
type Suggestion = { key: string; source: "rpm" | "xero"; name: string; detail: string; sell: number; rpm?: CostingItem; xero?: XeroProduct }

export function ItemsList({ job }: { job: CostingJob }) {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()
    const [items, setItems] = useState<CostingItem[]>([])
    const [lines, setLines] = useState<CostingLine[]>([])
    const [loading, setLoading] = useState(true)
    const [deleteTarget, setDeleteTarget] = useState<CostingItem | null>(null)
    const [copyTarget, setCopyTarget] = useState<CostingItem | null>(null)
    const [products, setProducts] = useState<CostingItem[] | null>(null)
    const [xeroProducts, setXeroProducts] = useState<XeroProduct[] | null>(null)
    const [xeroError, setXeroError] = useState<string | null>(null)
    const [productSearch, setProductSearch] = useState("")
    const [productOpen, setProductOpen] = useState(false)
    const [editingName, setEditingName] = useState<string | null>(null)
    const [nameDraft, setNameDraft] = useState<Record<string, string>>({})
    const [draggingId, setDraggingId] = useState<string | null>(null)
    const [expandedDetails, setExpandedDetails] = useState<Set<string>>(() => new Set())

    async function reload() {
        const [{ data: its }, { data: ls }] = await Promise.all([
            supabase.from("costing_items").select("*").eq("job_id", job.id).order("sort"),
            supabase.from("costing_lines").select("id, item_id, qty, unit_cost, markup, unit_sell_override").eq("job_id", job.id),
        ])
        setItems((its as CostingItem[]) || [])
        setLines((ls as CostingLine[]) || [])
    }

    async function loadLibraries() {
        if (products === null) {
            const { data: tpl } = await supabase.from("costing_jobs").select("id").eq("is_template", true).limit(1).maybeSingle()
            const { data } = tpl?.id
                ? await supabase.from("costing_items").select("*").eq("job_id", tpl.id).order("name")
                : { data: [] }
            setProducts(((data as CostingItem[]) || []).filter(item => !isSectionHeading(item)))
        }
        if (xeroProducts === null) {
            setXeroError(null)
            try {
                const response = await fetch("/api/xero/items", { cache: "no-store" })
                const body = await response.json()
                if (!response.ok) throw new Error(body?.error || "Could not load Xero items")
                setXeroProducts((body?.items || []) as XeroProduct[])
            } catch (error) {
                setXeroProducts([])
                setXeroError(error instanceof Error ? error.message : "Could not load Xero items")
            }
        }
    }

    useEffect(() => {
        let active = true
        ;(async () => {
            await reload()
            if (active) setLoading(false)
        })()
        return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [job.id])

    function unit(it: CostingItem) {
        if (isSectionHeading(it) || isNote(it)) return { cost: 0, sell: 0 }
        if (it.mode === "simple") return { cost: Number(it.unit_cost), sell: Number(it.unit_price) }
        const ls = lines.filter(l => l.item_id === it.id)
        const calculatedSell = ls.reduce((a, l) => a + lineSell(l), 0)
        const override = Number(it.unit_price || 0)
        return {
            cost: ls.reduce((a, l) => a + lineCost(l), 0),
            sell: override > 0 ? override : calculatedSell,
        }
    }

    function hasQuoteFacingDetails(it: CostingItem) {
        return Boolean(it.qty || it.size?.trim() || it.details?.trim() || it.delivery?.trim())
    }

    function toggleQuoteFacingDetails(id: string) {
        setExpandedDetails(current => {
            const next = new Set(current)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    function quoteFacingDetailRows(it: CostingItem) {
        const qty = Number(it.qty) || 1
        const size = it.size?.trim()
        const details = it.details?.trim()
        const delivery = it.delivery?.trim()

        return (
            <div className="mt-1 ml-5 space-y-0.5 border-l border-border/50 pl-2.5 text-[11px] leading-4 text-muted-foreground">
                <div><span className="font-medium text-foreground/70">Qty:</span> {qty}</div>
                {size && <div><span className="font-medium text-foreground/70">Size:</span> {size}</div>}
                {details && <div className="whitespace-pre-line"><span className="font-medium text-foreground/70">Details:</span> {details}</div>}
                {delivery && <div><span className="font-medium text-foreground/70">Delivery:</span> {delivery}</div>}
            </div>
        )
    }

    const rows = items.map(it => {
        const u = unit(it)
        const qty = Number(it.qty) || 1
        return { it, unitCost: u.cost, unitSell: u.sell, totalCost: qty * u.cost, totalSell: qty * u.sell }
    })
    const jobCost = rows.reduce((a, r) => a + r.totalCost, 0)
    const jobSell = rows.reduce((a, r) => a + r.totalSell, 0)
    const profit = jobSell - jobCost
    const margin = jobSell > 0 ? 1 - jobCost / jobSell : 0

    async function patchItem(id: string, patch: Partial<CostingItem>) {
        setItems(p => p.map(i => i.id === id ? { ...i, ...patch } : i))
        const { error } = await supabase.from("costing_items").update(patch).eq("id", id)
        if (error) toast.error(error.message)
    }

    async function saveItemOrder(current: CostingItem[], showToast = true) {
        const reordered = current.map((item, index) => ({ ...item, sort: (index + 1) * 10 }))
        setItems(reordered)

        const results = await Promise.all(
            reordered.map(item => supabase.from("costing_items").update({ sort: item.sort }).eq("id", item.id))
        )
        const failed = results.find(result => result.error)
        if (failed?.error) {
            toast.error(`Could not save line order: ${failed.error.message}`)
            await reload()
            return false
        }
        if (showToast) toast.success("Line order updated")
        return true
    }

    async function moveItem(id: string, direction: -1 | 1) {
        const current = [...items]
        const from = current.findIndex(item => item.id === id)
        const to = from + direction
        if (from < 0 || to < 0 || to >= current.length) return
        ;[current[from], current[to]] = [current[to], current[from]]
        await saveItemOrder(current)
    }

    async function reorderItems(sourceId: string, targetId: string) {
        if (sourceId === targetId) return
        const current = [...items]
        const from = current.findIndex(item => item.id === sourceId)
        const to = current.findIndex(item => item.id === targetId)
        if (from < 0 || to < 0) return

        const [moved] = current.splice(from, 1)
        current.splice(to, 0, moved)
        setDraggingId(null)
        await saveItemOrder(current)
    }

    async function openItemEditor(it: CostingItem) {
        setEditingName(null)
        if (it.mode === "simple") {
            const { error } = await supabase.from("costing_items").update({ mode: "build" }).eq("id", it.id)
            if (error) {
                toast.error(error.message)
                return
            }
            setItems(prev => prev.map(item => item.id === it.id ? { ...item, mode: "build" } : item))
            toast.success("Converted to Build — add the BOM costs, then save as a product if you want to reuse it.")
        }
        router.push(`/quoting/${job.id}/item/${it.id}`)
    }

    async function addItem(mode: "build" | "simple") {
        const maxSort = Math.max(0, ...items.map(i => i.sort))
        const { data, error } = await supabase.from("costing_items")
            .insert({ job_id: job.id, name: "", mode, qty: 1, sort: maxSort + 1 })
            .select("*").single()
        if (error) return toast.error(error.message)
        const item = data as CostingItem
        setItems(p => [...p, item])
        if (mode === "build") {
            router.push(`/quoting/${job.id}/item/${item.id}`)
        } else {
            setEditingName(item.id)
            setNameDraft(d => ({ ...d, [item.id]: "" }))
            loadLibraries()
        }
    }

    async function addSectionHeading() {
        const maxSort = Math.max(0, ...items.map(i => i.sort))
        const { data, error } = await supabase.from("costing_items")
            .insert({
                job_id: job.id,
                name: "",
                sign_code: SECTION_HEADING_CODE,
                mode: "simple",
                qty: 1,
                unit_cost: 0,
                unit_price: 0,
                sort: maxSort + 1,
            })
            .select("*").single()
        if (error) return toast.error(error.message)
        const item = data as CostingItem
        setItems(p => [...p, item])
        setEditingName(item.id)
        setNameDraft(d => ({ ...d, [item.id]: "" }))
    }

    async function addNote() {
        const maxSort = Math.max(0, ...items.map(i => i.sort))
        const { data, error } = await supabase.from("costing_items")
            .insert({
                job_id: job.id,
                name: "",
                sign_code: NOTE_CODE,
                mode: "simple",
                qty: 1,
                unit_cost: 0,
                unit_price: 0,
                sort: maxSort + 1,
            })
            .select("*").single()
        if (error) return toast.error(error.message)
        const item = data as CostingItem
        setItems(p => [...p, item])
        setEditingName(item.id)
        setNameDraft(d => ({ ...d, [item.id]: "" }))
    }

    async function duplicateItem(it: CostingItem) {
        if (isSectionHeading(it)) return
        const beforeIds = new Set(items.map(item => item.id))
        const { error } = await supabase.rpc("clone_costing_item", { src_item: it.id, target_job: job.id })
        if (error) return toast.error(`Could not copy item: ${error.message}`)

        const { data: refreshed, error: refreshError } = await supabase
            .from("costing_items")
            .select("*")
            .eq("job_id", job.id)
            .order("sort")
        if (refreshError) {
            await reload()
            return toast.error(`Item copied, but could not position it: ${refreshError.message}`)
        }

        const allItems = (refreshed as CostingItem[]) || []
        const newItems = allItems
            .filter(item => !beforeIds.has(item.id))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        const copy = newItems[0]
        if (!copy) {
            await reload()
            return toast.success(`Copied "${it.name || "item"}"`)
        }

        const ordered = allItems.filter(item => item.id !== copy.id)
        const sourceIndex = ordered.findIndex(item => item.id === it.id)
        if (sourceIndex >= 0) ordered.splice(sourceIndex + 1, 0, copy)
        else ordered.push(copy)

        const orderedOk = await saveItemOrder(ordered, false)
        await reload()
        if (orderedOk) toast.success(`Copied "${it.name || "item"}" below the original`)
    }

    async function confirmCopy() {
        if (!copyTarget) return
        const target = copyTarget
        setCopyTarget(null)
        await duplicateItem(target)
    }

    async function confirmDelete() {
        if (!deleteTarget) return
        const id = deleteTarget.id
        setDeleteTarget(null)
        setItems(p => p.filter(i => i.id !== id))
        setLines(p => p.filter(l => l.item_id !== id))
        const { error } = await supabase.from("costing_items").delete().eq("id", id)
        if (error) toast.error(error.message)
    }

    async function openProducts() {
        setProductOpen(true)
        setProductSearch("")
        await loadLibraries()
    }

    async function addProduct(p: CostingItem) {
        setProductOpen(false)
        const { error } = await supabase.rpc("clone_costing_item", { src_item: p.id, target_job: job.id })
        if (error) return toast.error(error.message)
        toast.success(`Added "${p.name || "product"}"`)
        reload()
    }

    async function addXeroProduct(p: XeroProduct) {
        const maxSort = Math.max(0, ...items.map(i => i.sort))
        const { data, error } = await supabase.from("costing_items").insert({
            job_id: job.id,
            name: p.name || p.code || "Xero item",
            details: p.description || null,
            mode: "simple",
            qty: 1,
            unit_cost: Number(p.cost || 0),
            unit_price: Number(p.sell || 0),
            sort: maxSort + 1,
        }).select("*").single()
        if (error) return toast.error(error.message)
        setItems(prev => [...prev, data as CostingItem])
        setProductOpen(false)
        toast.success(`Added "${p.name || p.code}" from Xero`)
    }

    async function saveAsProduct(it: CostingItem) {
        const confirmed = window.confirm(`Save "${it.name || "this item"}" to Products?`)
        if (!confirmed) return

        const { data: tpl } = await supabase.from("costing_jobs").select("id").eq("is_template", true).limit(1).maybeSingle()
        if (!tpl?.id) return toast.error("Product library not found")
        const { error } = await supabase.rpc("clone_costing_item", { src_item: it.id, target_job: tpl.id })
        if (error) return toast.error(error.message)
        toast.success(`Saved "${it.name || "item"}" to Products`)
        setProducts(null)
    }

    function suggestionsFor(it: CostingItem): Suggestion[] {
        const q = (nameDraft[it.id] ?? it.name ?? "").trim().toLowerCase()
        if (!q || q.length < 2) return []
        const rpmMatches: Suggestion[] = (products || [])
            .filter(p => `${p.name || ""} ${p.details || ""}`.toLowerCase().includes(q))
            .slice(0, 5)
            .map(p => ({ key: `rpm-${p.id}`, source: "rpm", name: p.name || "Untitled product", detail: p.details || (p.mode === "build" ? "RPM product with BOM" : "RPM product"), sell: Number(p.unit_price || 0), rpm: p }))
        const rpmNames = new Set((products || []).map(p => (p.name || "").trim().toLowerCase()).filter(Boolean))
        const xeroMatches: Suggestion[] = (xeroProducts || [])
            .filter(p => !rpmNames.has((p.name || "").trim().toLowerCase()) && `${p.code} ${p.name} ${p.description}`.toLowerCase().includes(q))
            .slice(0, 7)
            .map(p => ({ key: `xero-${p.id}`, source: "xero", name: p.name || p.code, detail: p.description || p.code, sell: Number(p.sell || 0), xero: p }))
        return [...rpmMatches, ...xeroMatches].slice(0, 8)
    }

    async function chooseSuggestion(it: CostingItem, s: Suggestion) {
        setEditingName(null)
        if (s.source === "xero" && s.xero) {
            const p = s.xero
            setNameDraft(d => ({ ...d, [it.id]: p.name || p.code }))
            await patchItem(it.id, { name: p.name || p.code, details: p.description || null, mode: "simple", unit_cost: Number(p.cost || 0), unit_price: Number(p.sell || 0) })
            toast.success(`Loaded "${p.name || p.code}" from Xero`)
            return
        }
        if (s.rpm) {
            const { error } = await supabase.rpc("clone_costing_item", { src_item: s.rpm.id, target_job: job.id })
            if (error) return toast.error(error.message)
            await supabase.from("costing_items").delete().eq("id", it.id)
            toast.success(`Loaded "${s.rpm.name || "product"}" from RPM`)
            reload()
        }
    }

    async function commitName(it: CostingItem) {
        const value = nameDraft[it.id] ?? it.name
        setEditingName(null)
        if (value !== it.name) await patchItem(it.id, { name: value })
    }

    const search = productSearch.trim().toLowerCase()
    const filteredRpm = (products || []).filter(p => !search || `${p.name || ""} ${p.details || ""}`.toLowerCase().includes(search))
    const rpmNames = new Set((products || []).map(p => (p.name || "").trim().toLowerCase()).filter(Boolean))
    const filteredXero = (xeroProducts || []).filter(p => !rpmNames.has((p.name || "").trim().toLowerCase()) && (!search || `${p.code} ${p.name} ${p.description}`.toLowerCase().includes(search)))

    if (loading) return <div className="h-40 rounded-lg bg-muted/40 animate-pulse mt-6" />

    return (
        <div className="mt-6 space-y-5">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Items in this job — drag the handle or use the arrows to change the order sent to Xero.</p>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" className="h-8 gap-1.5 text-xs" onClick={openProducts}><Package2 className="size-3.5" /> Add product</Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => addItem("build")}><Plus className="size-3.5" /> Build item</Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => addItem("simple")}><Plus className="size-3.5" /> Simple item</Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={addSectionHeading}><Plus className="size-3.5" /> Section heading</Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={addNote}><Plus className="size-3.5" /> Note</Button>
                </div>
            </div>

            {rows.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-border/60 rounded-lg text-sm text-muted-foreground">No items yet.</div>
            ) : (
                <div className="border border-border/60 rounded-lg overflow-visible">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-muted-foreground text-xs">
                            <tr className="text-left">
                                <th className="w-10"></th><th className="font-medium px-3 py-2 min-w-[360px]">Item / quote details</th><th className="font-medium px-2 py-2 w-20">Type</th><th className="font-medium px-2 py-2 w-16 text-right">Qty</th><th className="font-medium px-2 py-2 w-28 text-right">Unit cost</th><th className="font-medium px-2 py-2 w-28 text-right">Unit sell</th><th className="font-medium px-2 py-2 w-28 text-right">Total</th><th className="font-medium px-2 py-2 w-20 text-right">Margin</th><th className="w-28"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(({ it, unitCost, unitSell: us, totalSell }, rowIndex) => {
                                const heading = isSectionHeading(it)
                                const note = isNote(it)
                                const sectionNumber = heading ? items.slice(0, rowIndex + 1).filter(isSectionHeading).length : 0
                                const m = us > 0 ? 1 - unitCost / us : 0
                                const build = it.mode === "build"
                                const suggestions = !heading && !build && editingName === it.id ? suggestionsFor(it) : []
                                const showDetails = hasQuoteFacingDetails(it)
                                const detailsOpen = expandedDetails.has(it.id)
                                const detailToggle = showDetails ? <button type="button" onClick={() => toggleQuoteFacingDetails(it.id)} className="mt-1 shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground" title={detailsOpen ? "Hide quote details" : "Show quote details"} aria-label={`${detailsOpen ? "Hide" : "Show"} quote details for ${it.name || "item"}`}><ChevronRight className={`size-3.5 transition-transform ${detailsOpen ? "rotate-90" : ""}`} /></button> : <span className="w-4 shrink-0" />
                                const handleCell = <td className="pl-1 pr-0 py-1 align-middle"><div className="flex items-center gap-0"><button type="button" draggable onDragStart={e => { setDraggingId(it.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", it.id) }} onDragEnd={() => setDraggingId(null)} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/60 hover:text-foreground" title="Drag to reorder"><GripVertical className="size-3.5" /></button><div className="flex flex-col"><button type="button" disabled={rowIndex === 0} onClick={() => void moveItem(it.id, -1)} className="flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20"><ArrowUp className="size-3" /></button><button type="button" disabled={rowIndex === rows.length - 1} onClick={() => void moveItem(it.id, 1)} className="flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20"><ArrowDown className="size-3" /></button></div></div></td>
                                if (note) return <tr key={it.id} onDragOver={e => { if (!draggingId || draggingId === it.id) return; e.preventDefault(); e.dataTransfer.dropEffect = "move" }} onDrop={e => { e.preventDefault(); if (draggingId) void reorderItems(draggingId, it.id) }} className={`border-t border-border/60 group bg-amber-50/30 dark:bg-amber-950/10 ${draggingId === it.id ? "opacity-50" : ""}`}>{handleCell}<td colSpan={7} className="px-3 py-2"><textarea autoFocus={editingName === it.id} value={nameDraft[it.id] ?? it.name ?? ""} placeholder={"NOTES:\n- Details\n- Terms\n- Comments"} onFocus={() => { setEditingName(it.id); setNameDraft(d => ({ ...d, [it.id]: d[it.id] ?? it.name ?? "" })) }} onChange={e => setNameDraft(d => ({ ...d, [it.id]: e.target.value }))} onBlur={() => void commitName(it)} rows={4} className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-sm leading-5 outline-none focus:border-ring" /></td><td className="px-1 py-1.5 text-right"><button onClick={() => setDeleteTarget(it)} className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"><Trash2 className="size-3.5" /></button></td></tr>
                                if (heading) return <tr key={it.id} onDragOver={e => { if (!draggingId || draggingId === it.id) return; e.preventDefault(); e.dataTransfer.dropEffect = "move" }} onDrop={e => { e.preventDefault(); if (draggingId) void reorderItems(draggingId, it.id) }} className={`border-t border-border/60 group bg-muted/35 ${draggingId === it.id ? "opacity-50" : ""}`}>{handleCell}<td colSpan={7} className="px-3 py-2"><div className="flex items-center gap-2 font-semibold tracking-wide"><span className="shrink-0 tabular-nums">{sectionNumber}.</span><input autoFocus={editingName === it.id} value={nameDraft[it.id] ?? it.name ?? ""} placeholder="SECTION HEADING" onFocus={() => { setEditingName(it.id); setNameDraft(d => ({ ...d, [it.id]: d[it.id] ?? it.name ?? "" })) }} onChange={e => setNameDraft(d => ({ ...d, [it.id]: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") setEditingName(null) }} onBlur={() => void commitName(it)} className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold uppercase tracking-wide outline-none hover:border-input focus:border-input" /></div></td><td className="px-1 py-1.5 text-right"><button onClick={() => setDeleteTarget(it)} className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"><Trash2 className="size-3.5" /></button></td></tr>
                                return <tr key={it.id} onDragOver={e => { if (!draggingId || draggingId === it.id) return; e.preventDefault(); e.dataTransfer.dropEffect = "move" }} onDrop={e => { e.preventDefault(); if (draggingId) void reorderItems(draggingId, it.id) }} className={`border-t border-border/60 group ${draggingId === it.id ? "opacity-50" : ""}`}>{handleCell}<td className="px-3 py-1.5 relative align-top">{build ? <div><div className="flex items-start gap-1">{detailToggle}<div className="min-w-0 flex-1"><TextCell value={it.name} placeholder="Item name" onCommit={v => patchItem(it.id, { name: v })} /></div></div>{detailsOpen && quoteFacingDetailRows(it)}</div> : <><div className="flex items-start gap-1">{detailToggle}<input value={nameDraft[it.id] ?? it.name ?? ""} placeholder="Start typing an item…" onFocus={() => { setEditingName(it.id); setNameDraft(d => ({ ...d, [it.id]: d[it.id] ?? it.name ?? "" })); loadLibraries() }} onChange={e => { setNameDraft(d => ({ ...d, [it.id]: e.target.value })); setEditingName(it.id) }} onKeyDown={e => { if (e.key === "Enter" && suggestions[0]) { e.preventDefault(); chooseSuggestion(it, suggestions[0]) } else if (e.key === "Escape") setEditingName(null) }} onBlur={() => setTimeout(() => commitName(it), 150)} className="min-w-0 flex-1 rounded border border-transparent hover:border-input focus:border-input bg-transparent px-1.5 py-1 text-sm outline-none" /></div>{detailsOpen && quoteFacingDetailRows(it)}{suggestions.length > 0 && <div className="absolute z-50 left-3 right-0 top-[calc(100%-2px)] bg-background border border-border rounded-md shadow-lg overflow-hidden min-w-[420px]">{suggestions.map(s => <button key={s.key} type="button" onMouseDown={e => e.preventDefault()} onClick={() => chooseSuggestion(it, s)} className="w-full px-3 py-2 text-left hover:bg-muted/60 border-b last:border-b-0 flex gap-3 items-start"><span className="flex-1 min-w-0"><span className="flex items-center gap-2"><span className="font-medium">{s.name}</span><Badge variant="secondary" className={s.source === "rpm" ? "text-[10px] bg-violet-500/15 text-violet-600" : "text-[10px] bg-blue-500/15 text-blue-600"}>{s.source === "rpm" ? "RPM" : "Xero"}</Badge></span>{s.detail && <span className="block text-xs text-muted-foreground truncate">{s.detail}</span>}</span><span className="tabular-nums text-sm">{s.sell ? nz(s.sell) : ""}</span></button>)}</div>}</>}</td><td className="px-2 py-1.5 align-top"><button type="button" onClick={() => openItemEditor(it)}><Badge variant="secondary" className={build ? "bg-violet-500/15 text-violet-600" : "bg-slate-500/15 text-slate-600"}>{build ? "Build" : "Simple"}</Badge></button></td><td className="px-2 py-1.5 align-top"><NumCell value={it.qty} onCommit={v => patchItem(it.id, { qty: v ?? 1 })} /></td><td className="px-2 py-1.5 text-right tabular-nums align-top">{build ? nz(unitCost) : <NumCell value={Number(it.unit_cost)} decimals={2} step="0.01" onCommit={v => patchItem(it.id, { unit_cost: v ?? 0 })} />}</td><td className="px-2 py-1.5 text-right tabular-nums align-top"><NumCell value={us} decimals={2} step="0.01" onCommit={v => patchItem(it.id, { unit_price: v ?? 0 })} /></td><td className="px-2 py-1.5 text-right tabular-nums font-medium align-top">{nz(totalSell)}</td><td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground align-top">{pct(m)}</td><td className="px-1 py-1.5 align-top"><div className="flex justify-end gap-1">{build && <button onClick={() => openItemEditor(it)} className="inline-flex items-center text-xs text-primary hover:underline">BOM <ChevronRight className="size-3.5" /></button>}{build && <button onClick={() => saveAsProduct(it)} className="p-1 text-muted-foreground opacity-0 group-hover:opacity-100"><Package2 className="size-3.5" /></button>}<button onClick={() => setCopyTarget(it)} className="p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100" title="Copy item"><Copy className="size-3.5" /></button><button onClick={() => setDeleteTarget(it)} className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"><Trash2 className="size-3.5" /></button></div></td></tr>
                            })}
                        </tbody>
                        <tfoot className="bg-muted/20 border-t border-border/70"><tr><td></td><td colSpan={3} className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">Quote totals</td><td className="px-2 py-3 text-right"><div className="text-[11px] text-muted-foreground">Cost</div><div className="font-semibold tabular-nums">{nz(jobCost)}</div></td><td></td><td className="px-2 py-3 text-right"><div className="text-[11px] text-muted-foreground">Total</div><div className="font-semibold tabular-nums">{nz(jobSell)}</div></td><td className="px-2 py-3 text-right"><div className="text-[11px] text-muted-foreground">Margin</div><div className="font-semibold tabular-nums">{pct(margin)}</div></td><td className="px-2 py-3 text-right"><div className="text-[11px] text-muted-foreground">Profit</div><div className={`font-semibold tabular-nums ${profit < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>{nz(profit)}</div></td></tr></tfoot>
                    </table>
                </div>
            )}

            <Dialog open={copyTarget != null} onOpenChange={o => { if (!o) setCopyTarget(null) }}><DialogContent className="sm:max-w-[440px]"><DialogHeader><DialogTitle>Copy this item?</DialogTitle><DialogDescription><strong>{copyTarget?.name || "This item"}</strong>{copyTarget?.mode === "build" ? " and its BOM" : ""} will be duplicated directly below the original.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setCopyTarget(null)}>Cancel</Button><Button onClick={confirmCopy}>Copy item</Button></DialogFooter></DialogContent></Dialog>

            <Dialog open={deleteTarget != null} onOpenChange={o => { if (!o) setDeleteTarget(null) }}><DialogContent className="sm:max-w-[440px]"><DialogHeader><DialogTitle>Delete this item?</DialogTitle><DialogDescription><strong>{deleteTarget?.name || "This item"}</strong>{deleteTarget?.mode === "build" ? " and its BOM" : ""} will be permanently deleted. This can&apos;t be undone.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" onClick={confirmDelete}>Delete item</Button></DialogFooter></DialogContent></Dialog>

            <Dialog open={productOpen} onOpenChange={setProductOpen}><DialogContent className="sm:max-w-[620px]"><DialogHeader><DialogTitle>Add a product</DialogTitle><DialogDescription>Search RPM products with BOMs and existing Xero items. Xero items come in as editable simple items; an RPM product with the same name takes priority.</DialogDescription></DialogHeader><div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input autoFocus value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search product, item code or description…" className="pl-8" /></div><div className="max-h-[420px] overflow-y-auto border rounded-md"><ul className="divide-y divide-border/60">{filteredRpm.map(p => <li key={`rpm-${p.id}`}><button type="button" onClick={() => addProduct(p)} className="w-full text-left px-3 py-2.5 hover:bg-muted/50 flex items-start gap-2"><Package2 className="size-4 text-muted-foreground mt-0.5" /><span className="flex-1 min-w-0"><span className="flex items-center gap-2"><span className="font-medium">{p.name || "Untitled product"}</span><Badge variant="secondary" className="text-[10px] bg-violet-500/15 text-violet-600">RPM {p.mode === "build" ? "BOM" : "Product"}</Badge></span>{p.details && <span className="block text-xs text-muted-foreground truncate mt-0.5">{p.details}</span>}</span></button></li>)}{filteredXero.map(p => <li key={`xero-${p.id}`}><button type="button" onClick={() => addXeroProduct(p)} className="w-full text-left px-3 py-2.5 hover:bg-muted/50 flex items-start gap-2"><Package2 className="size-4 text-muted-foreground mt-0.5" /><span className="flex-1 min-w-0"><span className="flex items-center gap-2"><span className="font-medium">{p.name}</span><Badge variant="secondary" className="text-[10px] bg-blue-500/15 text-blue-600">Xero item</Badge>{p.code && <span className="text-[11px] text-muted-foreground">{p.code}</span>}<span className="ml-auto text-sm tabular-nums">{nz(p.sell)}</span></span>{p.description && <span className="block text-xs text-muted-foreground truncate mt-0.5">{p.description}</span>}</span></button></li>)}</ul>{products === null || xeroProducts === null ? <div className="py-8 text-center text-sm text-muted-foreground">Loading products…</div> : filteredRpm.length === 0 && filteredXero.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">No matching products.</div> : null}</div>{xeroError && <p className="text-xs text-amber-600">Xero items unavailable: {xeroError}. RPM products are still available.</p>}</DialogContent></Dialog>
        </div>
    )
}
