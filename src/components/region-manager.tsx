"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, MapPin } from "lucide-react"

export function RegionManager() {
    const supabase = createClient()
    const [regions, setRegions] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [newRegion, setNewRegion] = useState("")
    const [adding, setAdding] = useState(false)

    const fetchRegions = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('regions')
            .select('*')
            .order('name')

        if (error) {
            toast.error(error.message)
        } else {
            setRegions(data || [])
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchRegions()
    }, [])

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newRegion.trim()) return

        setAdding(true)
        const { error } = await supabase
            .from('regions')
            .insert({ name: newRegion.trim() })

        if (error) {
            toast.error(error.message)
        } else {
            toast.success("Region added successfully")
            setNewRegion("")
            fetchRegions()
        }
        setAdding(false)
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this region? This may affect sites using this region.")) return

        const { error } = await supabase
            .from('regions')
            .delete()
            .eq('id', id)

        if (error) {
            toast.error(error.message)
        } else {
            toast.success("Region deleted")
            fetchRegions()
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <MapPin className="size-5 text-primary" />
                        Region Management
                    </h3>
                    <p className="text-sm text-muted-foreground">Add or remove regions available for sites.</p>
                </div>
            </div>

            <form onSubmit={handleAdd} className="flex gap-2 max-w-md">
                <Input
                    placeholder="Enter region name (e.g. Waikato)"
                    value={newRegion}
                    onChange={(e) => setNewRegion(e.target.value)}
                    disabled={adding}
                />
                <Button type="submit" disabled={adding || !newRegion.trim()} className="gap-2">
                    {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    Add
                </Button>
            </form>

            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead>Region Name</TableHead>
                            <TableHead className="w-[100px] text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={2} className="h-24 text-center">
                                    <Loader2 className="size-6 animate-spin mx-auto text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        ) : regions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={2} className="h-24 text-center text-muted-foreground italic">
                                    No regions defined yet.
                                </TableCell>
                            </TableRow>
                        ) : (
                            regions.map((region) => (
                                <TableRow key={region.id} className="group transition-colors">
                                    <TableCell className="font-medium">{region.name}</TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-8 text-muted-foreground hover:text-destructive"
                                            onClick={() => handleDelete(region.id)}
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
