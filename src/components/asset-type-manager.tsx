"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, Layers, Search, Pencil } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

export function AssetTypeManager() {
    const supabase = createClient()
    const [assetTypes, setAssetTypes] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")

    const [formData, setFormData] = useState({
        label: "",
    })

    const fetchAssetTypes = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('asset_types')
            .select('*')
            .order('label')

        if (error) {
            toast.error(error.message)
        } else {
            setAssetTypes(data || [])
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchAssetTypes()
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.label.trim()) return

        setSaving(true)
        const payload = {
            label: formData.label.trim(),
            icon_name: 'Package'
        }

        let error;
        if (editingId) {
            const { error: updateError } = await supabase
                .from('asset_types')
                .update(payload)
                .eq('id', editingId)
            error = updateError
        } else {
            const { error: insertError } = await supabase
                .from('asset_types')
                .insert(payload)
            error = insertError
        }

        if (error) {
            toast.error(error.message)
        } else {
            toast.success(editingId ? "Asset Type updated" : "Asset Type added")
            setFormData({ label: "" })
            setEditingId(null)
            setDialogOpen(false)
            fetchAssetTypes()
        }
        setSaving(false)
    }

    const handleEdit = (type: any) => {
        setEditingId(type.id)
        setFormData({
            label: type.label,
        })
        setDialogOpen(true)
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure? This will remove this classification option.")) return

        const { error } = await supabase
            .from('asset_types')
            .delete()
            .eq('id', id)

        if (error) {
            toast.error(error.message)
        } else {
            toast.success("Asset Type removed")
            fetchAssetTypes()
        }
    }

    const filteredTypes = assetTypes.filter(t =>
        t.label.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Layers className="size-5 text-primary" />
                        Asset Classifications
                    </h3>
                    <p className="text-sm text-muted-foreground">Define the standard types for site assets.</p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={(open) => {
                    setDialogOpen(open)
                    if (!open) {
                        setEditingId(null)
                        setFormData({ label: "" })
                    }
                }}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 shadow-sm">
                            <Plus className="size-4" />
                            Add New Type
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>{editingId ? "Edit Asset Classification" : "Add Asset Classification"}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="label" className="text-xs font-bold uppercase text-muted-foreground">Asset Type Name *</Label>
                                <Input id="label" placeholder="e.g. Signage" value={formData.label} onChange={(e) => setFormData({ ...formData, label: e.target.value })} required />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                                <Button type="submit" disabled={saving}>
                                    {saving ? (
                                        <><Loader2 className="size-4 animate-spin mr-2" /> Saving...</>
                                    ) : (
                                        editingId ? "Save Changes" : "Create Type"
                                    )}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                    placeholder="Search classifications..."
                    className="pl-10 h-10 bg-muted/20"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead className="text-[10px] font-black uppercase">Asset Type</TableHead>
                            <TableHead className="text-[10px] font-black uppercase w-[100px] text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={2} className="h-24 text-center">
                                    <Loader2 className="size-6 animate-spin mx-auto text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        ) : filteredTypes.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={2} className="h-24 text-center text-muted-foreground italic">
                                    No classifications found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredTypes.map((type) => (
                                <TableRow key={type.id} className="group transition-colors">
                                    <TableCell className="font-bold">{type.label}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-8 text-muted-foreground hover:text-primary"
                                                onClick={() => handleEdit(type)}
                                            >
                                                <Pencil className="size-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-8 text-muted-foreground hover:text-destructive"
                                                onClick={() => handleDelete(type.id)}
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
