"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, Layers, Search } from "lucide-react"
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
    const [saving, setSaving] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")

    const [formData, setFormData] = useState({
        label: "",
        sub_cat_1: "",
        sub_cat_2: "",
        sub_cat_3: "",
        default_interval_days: "365"
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

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.label.trim()) return

        setSaving(true)
        const { error } = await supabase
            .from('asset_types')
            .insert({
                label: formData.label.trim(),
                sub_cat_1: formData.sub_cat_1.trim() || null,
                sub_cat_2: formData.sub_cat_2.trim() || null,
                sub_cat_3: formData.sub_cat_3.trim() || null,
                default_interval_days: parseInt(formData.default_interval_days) || 365,
                icon_name: 'Package'
            })

        if (error) {
            toast.error(error.message)
        } else {
            toast.success("Asset Type added successfully")
            setFormData({ label: "", sub_cat_1: "", sub_cat_2: "", sub_cat_3: "", default_interval_days: "365" })
            setDialogOpen(false)
            fetchAssetTypes()
        }
        setSaving(false)
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
        t.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.sub_cat_1 || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.sub_cat_2 || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.sub_cat_3 || "").toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Layers className="size-5 text-primary" />
                        Asset Classifications
                    </h3>
                    <p className="text-sm text-muted-foreground">Define the 4-level hierarchy for site assets.</p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 shadow-sm">
                            <Plus className="size-4" />
                            Add New Type
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Add Asset Classification</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleAdd} className="space-y-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="label" className="text-xs font-bold uppercase text-muted-foreground">1. Asset Type (Main) *</Label>
                                <Input id="label" placeholder="e.g. Signage" value={formData.label} onChange={(e) => setFormData({ ...formData, label: e.target.value })} required />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="sub1" className="text-xs font-bold uppercase text-muted-foreground">2. Sub Category 1</Label>
                                <Input id="sub1" placeholder="e.g. External" value={formData.sub_cat_1} onChange={(e) => setFormData({ ...formData, sub_cat_1: e.target.value })} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="sub2" className="text-xs font-bold uppercase text-muted-foreground">3. Sub Category 2</Label>
                                <Input id="sub2" placeholder="e.g. Pylon" value={formData.sub_cat_2} onChange={(e) => setFormData({ ...formData, sub_cat_2: e.target.value })} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="sub3" className="text-xs font-bold uppercase text-muted-foreground">4. Sub Category 3</Label>
                                <Input id="sub3" placeholder="e.g. Fixed" value={formData.sub_cat_3} onChange={(e) => setFormData({ ...formData, sub_cat_3: e.target.value })} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="interval" className="text-xs font-bold uppercase text-muted-foreground">Default PM Interval (Days)</Label>
                                <Input id="interval" type="number" value={formData.default_interval_days} onChange={(e) => setFormData({ ...formData, default_interval_days: e.target.value })} />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                                <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Create Type"}</Button>
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
                            <TableHead className="text-[10px] font-black uppercase">Main Type</TableHead>
                            <TableHead className="text-[10px] font-black uppercase">Sub 1</TableHead>
                            <TableHead className="text-[10px] font-black uppercase">Sub 2</TableHead>
                            <TableHead className="text-[10px] font-black uppercase">Sub 3</TableHead>
                            <TableHead className="text-[10px] font-black uppercase w-[100px] text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    <Loader2 className="size-6 animate-spin mx-auto text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        ) : filteredTypes.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground italic">
                                    No classifications found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredTypes.map((type) => (
                                <TableRow key={type.id} className="group transition-colors">
                                    <TableCell className="font-bold">{type.label}</TableCell>
                                    <TableCell className="text-muted-foreground text-xs">{type.sub_cat_1 || "—"}</TableCell>
                                    <TableCell className="text-muted-foreground text-xs">{type.sub_cat_2 || "—"}</TableCell>
                                    <TableCell className="text-muted-foreground text-xs">{type.sub_cat_3 || "—"}</TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-8 text-muted-foreground hover:text-destructive"
                                            onClick={() => handleDelete(type.id)}
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
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
