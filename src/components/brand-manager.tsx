"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, GripVertical, Upload, Image as ImageIcon } from "lucide-react"
import type { ClientBrand } from "@/types/database"
import { BrandChip } from "@/components/brand-chip"

interface BrandManagerProps {
    clientId: string
    clientName: string
}

// Slugify a label for use as a stable brand key (locked once set).
const slugify = (s: string): string =>
    s.toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40)

export function BrandManager({ clientId, clientName }: BrandManagerProps) {
    const supabase = createClient()
    const [brands, setBrands] = useState<ClientBrand[]>([])
    const [loading, setLoading] = useState(true)
    const [newLabel, setNewLabel] = useState("")
    const [adding, setAdding] = useState(false)
    const [draggedId, setDraggedId] = useState<string | null>(null)
    const [uploadingFor, setUploadingFor] = useState<string | null>(null)

    const fetchBrands = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('client_brands')
            .select('*')
            .eq('client_id', clientId)
            .order('display_order')
        if (error) toast.error(error.message)
        else setBrands(data as ClientBrand[])
        setLoading(false)
    }

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchBrands()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientId])

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newLabel.trim()) return
        const key = slugify(newLabel)
        if (!key) {
            toast.error("Label must contain at least one letter or number")
            return
        }
        if (brands.some(b => b.key === key)) {
            toast.error(`A brand with key "${key}" already exists`)
            return
        }
        setAdding(true)
        const { error } = await supabase
            .from('client_brands')
            .insert({
                client_id: clientId,
                key,
                label: newLabel.trim(),
                display_order: brands.length,
            })
        if (error) toast.error(error.message)
        else {
            toast.success("Brand added")
            setNewLabel("")
            fetchBrands()
        }
        setAdding(false)
    }

    const handleDelete = async (brand: ClientBrand) => {
        if (!confirm(`Remove "${brand.label}"? This will also clear it from every site that uses it.`)) return
        const { error } = await supabase.from('client_brands').delete().eq('id', brand.id)
        if (error) toast.error(error.message)
        else {
            toast.success("Brand removed")
            fetchBrands()
        }
    }

    const handleLogoUpload = async (brand: ClientBrand, file: File) => {
        setUploadingFor(brand.id)
        try {
            const ext = file.name.split('.').pop() || 'png'
            const path = `${clientId}/${brand.key}-${Date.now()}.${ext}`
            const { error: upErr } = await supabase.storage
                .from('client-brand-logos')
                .upload(path, file, { contentType: file.type, upsert: false })
            if (upErr) throw upErr
            const { data: { publicUrl } } = supabase.storage.from('client-brand-logos').getPublicUrl(path)
            const { error: updErr } = await supabase
                .from('client_brands')
                .update({ logo_url: publicUrl })
                .eq('id', brand.id)
            if (updErr) throw updErr
            toast.success("Logo updated")
            fetchBrands()
        } catch (err: unknown) {
            toast.error(`Upload failed: ${err instanceof Error ? err.message : "unknown error"}`)
        } finally {
            setUploadingFor(null)
        }
    }

    const handleClearLogo = async (brand: ClientBrand) => {
        const { error } = await supabase
            .from('client_brands')
            .update({ logo_url: null })
            .eq('id', brand.id)
        if (error) toast.error(error.message)
        else {
            toast.success("Logo cleared")
            fetchBrands()
        }
    }

    // Drag-to-reorder using native HTML5 DnD
    const handleDragStart = (id: string) => setDraggedId(id)
    const handleDragOver = (e: React.DragEvent) => e.preventDefault()
    const handleDrop = async (targetId: string) => {
        if (!draggedId || draggedId === targetId) {
            setDraggedId(null)
            return
        }
        const reordered = [...brands]
        const fromIdx = reordered.findIndex(b => b.id === draggedId)
        const toIdx = reordered.findIndex(b => b.id === targetId)
        if (fromIdx === -1 || toIdx === -1) {
            setDraggedId(null)
            return
        }
        const [moved] = reordered.splice(fromIdx, 1)
        reordered.splice(toIdx, 0, moved)
        // Optimistic update
        setBrands(reordered)
        setDraggedId(null)
        // Persist new display_order for affected rows
        const updates = reordered.map((b, i) => ({ id: b.id, display_order: i }))
        await Promise.all(
            updates.map(u =>
                supabase.from('client_brands').update({ display_order: u.display_order }).eq('id', u.id)
            )
        )
    }

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                    Brands for {clientName}
                </h3>
                <p className="text-xs text-muted-foreground italic mt-1">
                    Define the brands or concepts this customer operates. Each site can be tagged with any subset.
                </p>
            </div>

            {/* Add new brand */}
            <form onSubmit={handleAdd} className="flex gap-2">
                <Input
                    placeholder='New brand name (e.g. "McCafé")'
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    disabled={adding}
                />
                <Button type="submit" disabled={adding || !newLabel.trim()} className="gap-2 shrink-0">
                    {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    Add
                </Button>
            </form>

            {/* List */}
            {loading ? (
                <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin text-muted-foreground" />
                </div>
            ) : brands.length === 0 ? (
                <div className="p-6 text-center text-sm italic text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                    No brands yet. Add the first one above.
                </div>
            ) : (
                <ul className="space-y-2">
                    {brands.map((brand) => (
                        <li
                            key={brand.id}
                            draggable
                            onDragStart={() => handleDragStart(brand.id)}
                            onDragOver={handleDragOver}
                            onDrop={() => handleDrop(brand.id)}
                            className={`flex items-center gap-3 p-3 rounded-lg border bg-card transition-all ${draggedId === brand.id ? "opacity-40" : "hover:shadow-sm"}`}
                        >
                            <GripVertical className="size-4 text-muted-foreground shrink-0 cursor-grab" />
                            <BrandChip brand={brand} size="md" />
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{brand.label}</div>
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">key: {brand.key}</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <Label
                                    htmlFor={`logo-${brand.id}`}
                                    className="cursor-pointer inline-flex items-center gap-1 px-2 py-1.5 text-xs rounded-md hover:bg-muted/60 border"
                                    title={brand.logo_url ? "Replace logo" : "Upload logo"}
                                >
                                    {uploadingFor === brand.id
                                        ? <Loader2 className="size-3.5 animate-spin" />
                                        : (brand.logo_url ? <ImageIcon className="size-3.5" /> : <Upload className="size-3.5" />)}
                                    {brand.logo_url ? "Replace" : "Logo"}
                                </Label>
                                <Input
                                    id={`logo-${brand.id}`}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    disabled={uploadingFor === brand.id}
                                    onChange={(e) => {
                                        const f = e.target.files?.[0]
                                        if (f) handleLogoUpload(brand, f)
                                        e.target.value = ""
                                    }}
                                />
                                {brand.logo_url && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs text-muted-foreground"
                                        onClick={() => handleClearLogo(brand)}
                                    >
                                        Clear
                                    </Button>
                                )}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleDelete(brand)}
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
