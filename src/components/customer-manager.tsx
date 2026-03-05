"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, Users } from "lucide-react"

export function CustomerManager() {
    const supabase = createClient()
    const [customers, setCustomers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [newCustomer, setNewCustomer] = useState("")
    const [adding, setAdding] = useState(false)

    const fetchCustomers = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .order('name')

        if (error) {
            toast.error(error.message)
        } else {
            setCustomers(data || [])
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchCustomers()
    }, [])

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newCustomer.trim()) return

        setAdding(true)
        const { error } = await supabase
            .from('clients')
            .insert({
                name: newCustomer.trim(),
                active: true
            })

        if (error) {
            toast.error(error.message)
        } else {
            toast.success("Customer added successfully")
            setNewCustomer("")
            fetchCustomers()
        }
        setAdding(false)
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this customer? This may affect sites linked to them.")) return

        const { error } = await supabase
            .from('clients')
            .delete()
            .eq('id', id)

        if (error) {
            toast.error(error.message)
        } else {
            toast.success("Customer deleted")
            fetchCustomers()
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Users className="size-5 text-primary" />
                        Customer Management
                    </h3>
                    <p className="text-sm text-muted-foreground">Manage customers and clients for site categorization.</p>
                </div>
            </div>

            <form onSubmit={handleAdd} className="flex gap-2 max-w-md">
                <Input
                    placeholder="Enter customer name (e.g. St Pierre's)"
                    value={newCustomer}
                    onChange={(e) => setNewCustomer(e.target.value)}
                    disabled={adding}
                />
                <Button type="submit" disabled={adding || !newCustomer.trim()} className="gap-2">
                    {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    Add
                </Button>
            </form>

            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead>Customer Name</TableHead>
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
                        ) : customers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={2} className="h-24 text-center text-muted-foreground italic">
                                    No customers defined yet.
                                </TableCell>
                            </TableRow>
                        ) : (
                            customers.map((customer) => (
                                <TableRow key={customer.id} className="group transition-colors">
                                    <TableCell className="font-medium">{customer.name}</TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-8 text-muted-foreground hover:text-destructive"
                                            onClick={() => handleDelete(customer.id)}
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
