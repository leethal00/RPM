"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { ArrowLeft, Layers, Package2, Copy, Check, ImagePlus, FileText } from "lucide-react"
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { PageShell } from "@/components/page-shell"
import { CostSheet } from "@/components/costing/cost-sheet"
import { NumCell } from "@/components/costing/cells"
import type { CostingItem, CostingJob } from "@/types/database"

export default function ItemCostSheetPage() {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()
    const params = useParams()
    const jobId = params.id as string
    const itemId = params.itemId as string

    const [job, setJob] = useState<CostingJob | null>(null)
    const [item, setItem] = useState<CostingItem | null>(null)
    const [loading, setLoading] = useState(true)

    const [copyOpen, setCopyOpen] = useState(false)
    const [jobs, setJobs] = useState<{ id: string; title: string }[] | null>(null)
    const [jobSearch, setJobSearch] = useState("")
    const [copying, setCopying] = useState(false)
    const [uploadingImage, setUploadingImage] = useState(false)
    const imageInput = useRef<HTMLInputElement>(null)

    useEffect(() => {
        let active = true
        ;(async () => {
            const [{ data: j }, { data: i }] = await Promise.all([
                supabase.from("costing_jobs").select("id, title, is_template, status").eq("id", jobId).single(),
                supabase.from("costing_items").select("*").eq("id", itemId).single(),
            ])
            if (!active) return
            setJob(j as CostingJob)
            setItem(i as CostingItem)
            setLoading(false)
        })()
        return () => { active = false }
    }, [supabase, jobId, itemId])

    const isTemplate = !!job?.is_template
    const isJobStage = !!job && ["in_progress", "complete", "invoiced", "cancelled"].includes(job.status)

    async function patchItem(patch: Partial<CostingItem>) {
        const previous = item
        setItem((prev) => (prev ? { ...prev, ...patch } : prev))
        const { error } = await supabase.from("costing_items").update(patch).eq("id", itemId)
        if (error) {
            setItem(previous)
            toast.error(`Could not save item: ${error.message}`)
        }
    }

    async function uploadProductImage(file: File) {
        if (!isTemplate || !item || uploadingImage) return
        const allowed: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }
        const extension = allowed[file.type]
        if (!extension) return toast.error("Choose a PNG, JPG or WebP image")
        if (file.size > 10 * 1024 * 1024) return toast.error("Image must be 10 MB or smaller")
        setUploadingImage(true)
        try {
            const path = `products/${itemId}/${crypto.randomUUID()}.${extension}`
            const { error: uploadError } = await supabase.storage.from("job-attachments")
                .upload(path, file, { contentType: file.type, upsert: false })
            if (uploadError) throw uploadError
            const { error: saveError } = await supabase.from("costing_items")
                .update({ image_path: path }).eq("id", itemId)
            if (saveError) throw saveError
            setItem((current) => current ? { ...current, image_path: path } : current)
            toast.success("Product image saved")
        } catch (error) {
            toast.error(`Could not save image: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
            setUploadingImage(false)
            if (imageInput.current) imageInput.current.value = ""
        }
    }

    const productImageUrl = item?.image_path
        ? supabase.storage.from("job-attachments").getPublicUrl(item.image_path).data.publicUrl
        : null

    async function saveAsProduct() {
        const { data: tpl } = await supabase.from("costing_jobs").select("id").eq("is_template", true).limit(1).maybeSingle()
        if (!tpl?.id) return toast.error("Product library not found")
        const { error } = await supabase.rpc("clone_costing_item", { src_item: itemId, target_job: tpl.id })
        if (error) return toast.error(error.message)
        toast.success("Saved to Products")
    }

    async function openCopy() {
        setCopyOpen(true)
        if (jobs === null) {
            const { data } = await supabase.from("costing_jobs")
                .select("id, title").eq("is_template", false).neq("id", jobId).order("created_at", { ascending: false })
            setJobs((data as { id: string; title: string }[]) || [])
        }
    }

    async function copyToJob(target: { id: string; title: string }) {
        setCopying(true)
        const { data: newId, error } = await supabase.rpc("clone_costing_item", { src_item: itemId, target_job: target.id })
        setCopying(false)
        if (error) return toast.error(error.message)
        setCopyOpen(false)
        toast.success(`Copied to "${target.title}"`)
        router.push(`/quoting/${target.id}/item/${newId}`)
    }

    const filteredJobs = (jobs ?? []).filter((j) => j.title.toLowerCase().includes(jobSearch.trim().toLowerCase()))

    return (
        <DashboardLayout activeQuotingItem={isTemplate ? "/quoting/products" : undefined}>
            <PageShell width="full" className="px-4 xl:px-6 gap-1.5 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button variant="ghost" size="sm" className="h-7 -ml-2 gap-1.5 text-muted-foreground"
                        onClick={() => router.push(isTemplate ? "/quoting/products" : `/quoting/${jobId}`)}>
                        <ArrowLeft className="size-3.5" /> {isTemplate ? "Products" : (job?.title || "Job")}
                    </Button>
                    {!isTemplate && !loading && item && item.mode === "build" && (
                        <div className="flex items-center gap-2">
                            {isJobStage && (
                                <Button asChild variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
                                    <Link href={`/quoting/${jobId}/job-card?item=${itemId}`} target="_blank" rel="noopener noreferrer">
                                        <FileText className="size-3" /> Job card
                                    </Link>
                                </Button>
                            )}
                            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={saveAsProduct}>
                                <Package2 className="size-3" /> Save as product
                            </Button>
                        </div>
                    )}
                </div>

                {loading || !item ? (
                    <div className="h-16 rounded-lg bg-muted/40 animate-pulse" />
                ) : (
                    <>
                        <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-1.5">
                            <div className="min-w-0 flex-1 flex items-center gap-2.5">
                                <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                                    <Layers className="size-3" />
                                    <span className="text-[11px] font-medium">Item — build</span>
                                </div>
                                <input
                                    defaultValue={item.name}
                                    onBlur={(e) => { if (e.target.value !== item.name) patchItem({ name: e.target.value }) }}
                                    className="min-w-0 flex-1 text-lg leading-tight font-semibold tracking-tight bg-transparent outline-none border-b border-transparent focus:border-input"
                                    placeholder="Item name"
                                />
                            </div>
                            {item.mode === "build" && (
                                <div className="flex items-center gap-2 shrink-0">
                                    <div className="flex items-center gap-1.5">
                                        <label className="text-[11px] text-muted-foreground whitespace-nowrap">Build qty</label>
                                        <div className="w-16"><NumCell value={item.build_qty ?? item.qty} onCommit={(v) => patchItem({ build_qty: v == null ? null : v })} /></div>
                                    </div>
                                    {item.build_qty != null && Number(item.build_qty) !== Number(item.qty) && (
                                        <span className="hidden xl:inline text-[11px] text-muted-foreground whitespace-nowrap">
                                            Batch build · BOM qty is for {Number(item.build_qty)} units
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="rounded-lg border border-border/60 p-2">
                            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)] gap-3">
                                <div className="min-w-0 space-y-1.5">
                                    <div className="text-[11px] font-medium text-muted-foreground">Quote description — customer facing</div>
                                    <div className="grid grid-cols-[88px_minmax(0,1fr)_180px] gap-2">
                                        <div>
                                            <label className="mb-0.5 block text-[11px] text-muted-foreground">Qty</label>
                                            <div className="h-8 flex items-center rounded-md border border-input bg-background px-1.5">
                                                <NumCell value={item.qty} onCommit={(v) => patchItem({ qty: v ?? 1 })} />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="mb-0.5 block text-[11px] text-muted-foreground">Size</label>
                                            <input defaultValue={item.size ?? ""} placeholder="e.g. 1400x400mm"
                                                onBlur={(e) => { if (e.target.value !== (item.size ?? "")) patchItem({ size: e.target.value || null }) }}
                                                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring" />
                                        </div>
                                        <div>
                                            <label className="mb-0.5 block text-[11px] text-muted-foreground">Delivery</label>
                                            <select value={item.delivery ?? ""} onChange={(e) => patchItem({ delivery: e.target.value || null })}
                                                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring">
                                                <option value="">—</option>
                                                <option value="Ex-factory">Ex-factory</option>
                                                <option value="Freight to site">Freight to site</option>
                                                <option value="Install on site">Install on site</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="mb-0.5 block text-[11px] text-muted-foreground">Details</label>
                                        <textarea defaultValue={item.details ?? ""} placeholder="How it's made — extrusion, bracing, finish, face, LED, etc."
                                            onBlur={(e) => { if (e.target.value !== (item.details ?? "")) patchItem({ details: e.target.value || null }) }}
                                            className="min-h-[54px] w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-sm leading-5 outline-none focus:border-ring" />
                                    </div>
                                </div>

                                <div className="min-w-0 lg:border-l lg:border-border/60 lg:pl-3">
                                    <div className="mb-1 text-[11px] font-medium text-muted-foreground">Customer quote preview</div>
                                    <div className="rounded-md bg-muted/20 px-2.5 py-2 text-[11px] leading-4 text-foreground/80 min-h-[96px]">
                                        <div className="font-medium text-foreground">{item.name || "Item"}</div>
                                        <div><span className="font-medium text-muted-foreground">Qty:</span> {Number(item.mode === "build" && item.build_qty != null ? item.build_qty : item.qty)}</div>
                                        {item.size?.trim() && <div><span className="font-medium text-muted-foreground">Size:</span> {item.size.trim()}</div>}
                                        {item.details?.trim() && (
                                            <div className="whitespace-pre-line"><span className="font-medium text-muted-foreground">Details:</span> {item.details.trim()}</div>
                                        )}
                                        {item.delivery?.trim() && <div>{item.delivery.trim()}</div>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {item.mode === "build" && (
                            <div className="rounded-lg border border-border/60 px-2.5 py-2">
                                <label htmlFor="bom-internal-notes" className="block text-[11px] font-medium text-muted-foreground">
                                    Internal notes · staff only
                                </label>
                                <textarea id="bom-internal-notes" defaultValue={item.internal_notes ?? ""}
                                    placeholder="Production instructions, purchasing notes or costing assumptions"
                                    onBlur={(e) => { if (e.target.value !== (item.internal_notes ?? "")) void patchItem({ internal_notes: e.target.value || null }) }}
                                    className="mt-1 min-h-[54px] w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-sm leading-5 outline-none focus:border-ring" />
                                <p className="mt-1 text-[11px] text-muted-foreground">Saved with this BOM for the job team. Excluded from customer documents and Xero.</p>
                            </div>
                        )}

                        {item.mode === "build" && item.build_qty != null && Number(item.build_qty) !== Number(item.qty) && (
                            <div className="xl:hidden text-[11px] leading-4 text-muted-foreground px-0.5">
                                Batch build: quote qty <span className="font-medium text-foreground">{Number(item.qty)}</span> · production qty <span className="font-medium text-foreground">{Number(item.build_qty)}</span> · BOM quantities are for the complete batch.
                            </div>
                        )}

                        <CostSheet jobId={jobId} item={item} isProduct={isTemplate}
                            onFinalSellChange={(price) => patchItem({ unit_price: price })} />

                        {isTemplate && (
                            <div className="rounded-lg border border-border/60 p-3">
                                <div className="mb-2 text-sm font-medium">Product image for job card</div>
                                <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                                    aria-label="Choose product image" onChange={(event) => {
                                        const file = event.target.files?.[0]
                                        if (file) void uploadProductImage(file)
                                    }} />
                                <div tabIndex={0} role="button" aria-label="Drop or paste a product image"
                                    onClick={() => imageInput.current?.click()}
                                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); imageInput.current?.click() } }}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void uploadProductImage(file) }}
                                    onPaste={(event) => { const file = Array.from(event.clipboardData.files)[0]; if (file) { event.preventDefault(); void uploadProductImage(file) } }}
                                    className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-3 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                    {productImageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={productImageUrl} alt={item.name || "Product"} className="max-h-48 max-w-full object-contain" />
                                    ) : <ImagePlus className="size-7 text-muted-foreground" aria-hidden="true" />}
                                    <span className="text-sm text-muted-foreground">{uploadingImage ? "Uploading…" : productImageUrl ? "Click, drop or paste to replace the image" : "Click, drop or paste a screenshot here"}</span>
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">PNG, JPG or WebP, up to 10 MB. This image appears on job cards made from this product.</p>
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1.5 mt-0.5 border-t border-border/60">
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Check className="size-3.5 text-emerald-500" /> Changes save automatically.
                            </p>
                            <div className="flex items-center gap-2">
                                {!isTemplate && item.mode === "build" && (
                                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={saveAsProduct}>
                                        <Package2 className="size-3.5" /> Save as product
                                    </Button>
                                )}
                                {!isTemplate && (
                                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={openCopy}>
                                        <Copy className="size-3.5" /> Copy to job…
                                    </Button>
                                )}
                                <Button size="sm" className="h-8 gap-1.5"
                                    onClick={() => router.push(isTemplate ? "/quoting/products" : `/quoting/${jobId}`)}>
                                    <Check className="size-3.5" /> {isTemplate ? "Done — back to Products" : "Done — back to job"}
                                </Button>
                            </div>
                        </div>
                    </>
                )}

                <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
                    <DialogContent className="sm:max-w-[520px]">
                        <DialogHeader>
                            <DialogTitle>Copy this BOM to another job</DialogTitle>
                            <DialogDescription>
                                Drops a full copy of <strong>{item?.name || "this item"}</strong> (with its whole BOM) into the job you pick, then opens it there so you can tweak it for that project.
                            </DialogDescription>
                        </DialogHeader>
                        <Input placeholder="Search jobs…" value={jobSearch} onChange={(e) => setJobSearch(e.target.value)} />
                        <div className="max-h-[360px] overflow-y-auto -mx-1 mt-1">
                            {jobs === null ? (
                                <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
                            ) : filteredJobs.length === 0 ? (
                                <div className="py-8 text-center text-sm text-muted-foreground">
                                    {jobs.length === 0 ? "No other jobs yet." : "No jobs match."}
                                </div>
                            ) : (
                                <ul className="divide-y divide-border/60">
                                    {filteredJobs.map((j) => (
                                        <li key={j.id}>
                                            <button type="button" disabled={copying} onClick={() => copyToJob(j)}
                                                className="w-full text-left px-3 py-2.5 hover:bg-muted/50 rounded-md flex items-center gap-2 disabled:opacity-50">
                                                <Copy className="size-4 text-muted-foreground shrink-0" />
                                                <span className="flex-1 truncate">{j.title}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </PageShell>
        </DashboardLayout>
    )
}
