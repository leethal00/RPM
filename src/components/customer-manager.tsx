"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, Users, Palette, ContactRound, RefreshCw, Mail, Phone, MapPin } from "lucide-react"
import type { Client } from "@/types/database"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { BrandManager } from "@/components/brand-manager"

export function CustomerManager() {
    const supabase = createClient()
    const [customers, setCustomers] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)
    const [newCustomer, setNewCustomer] = useState("")
    const [adding, setAdding] = useState(false)
    const [brandManagerFor, setBrandManagerFor] = useState<Client | null>(null)
    const [detailsFor, setDetailsFor] = useState<Client | null>(null)
    const [xeroContacts, setXeroContacts] = useState<any[]>([])
    const [xeroLoading, setXeroLoading] = useState(false)

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
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchCustomers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const loadXeroContacts = async () => {
        setXeroLoading(true)
        try {
            const response = await fetch("/api/xero/contacts", { cache: "no-store" })
            const body = await response.json()
            if (!response.ok) throw new Error(body.error || "Could not load Xero contacts")
            setXeroContacts(body.contacts || [])
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not load Xero contacts")
        } finally { setXeroLoading(false) }
    }

    const matchingXeroContact = detailsFor ? xeroContacts.find((c) => c.name?.toLowerCase() === detailsFor.name.toLowerCase()) : null

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

            <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead>Customer Name</TableHead>
                            <TableHead className="w-[360px] text-right">Actions</TableHead>
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
                                <TableRow
                                    key={customer.id}
                                    onClick={() => setBrandManagerFor(customer)}
                                    className="group transition-colors cursor-pointer hover:bg-accent/30"
                                >
                                    <TableCell className="font-medium group-hover:text-primary transition-colors">{customer.name}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={(e) => { e.stopPropagation(); setDetailsFor(customer); if (!xeroContacts.length) loadXeroContacts() }}>
                                                <ContactRound className="size-3.5" /> Details
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 gap-1.5 text-xs"
                                                onClick={(e) => { e.stopPropagation(); setBrandManagerFor(customer) }}
                                            >
                                                <Palette className="size-3.5" />
                                                Manage Brands
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-8 text-muted-foreground hover:text-destructive"
                                                onClick={(e) => { e.stopPropagation(); handleDelete(customer.id) }}
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


            <Dialog open={!!detailsFor} onOpenChange={(open) => !open && setDetailsFor(null)}>
                <DialogContent className="sm:max-w-[680px] max-h-[80vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>{detailsFor?.name}</DialogTitle><DialogDescription>Customer contact details are read from Xero, which remains the source of truth.</DialogDescription></DialogHeader>
                    <div className="flex justify-end"><Button variant="outline" size="sm" className="gap-1.5" onClick={loadXeroContacts} disabled={xeroLoading}><RefreshCw className={`size-3.5 ${xeroLoading ? "animate-spin" : ""}`} /> Sync from Xero</Button></div>
                    {xeroLoading ? <div className="py-10 text-center"><Loader2 className="size-6 animate-spin mx-auto" /></div> : matchingXeroContact ? (
                        <div className="space-y-4 text-sm">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-md border p-3"><div className="font-medium mb-2">Primary contact</div>{matchingXeroContact.email && <div className="flex gap-2"><Mail className="size-4 mt-0.5" />{matchingXeroContact.email}</div>}{matchingXeroContact.phones?.filter((p:any)=>p.PhoneNumber).map((p:any,i:number)=><div key={i} className="flex gap-2 mt-1"><Phone className="size-4 mt-0.5" />{p.PhoneNumber}</div>)}</div>
                                <div className="rounded-md border p-3"><div className="font-medium mb-2">Addresses</div>{matchingXeroContact.addresses?.filter((a:any)=>a.AddressLine1||a.City).map((a:any,i:number)=><div key={i} className="flex gap-2 mb-2"><MapPin className="size-4 mt-0.5 shrink-0" /><span>{[a.AddressLine1,a.AddressLine2,a.City,a.Region,a.PostalCode].filter(Boolean).join(", ")}</span></div>)}</div>
                            </div>
                            {!!matchingXeroContact.people?.length && <div className="rounded-md border p-3"><div className="font-medium mb-2">Contact people</div>{matchingXeroContact.people.map((person:any,i:number)=><div key={i} className="py-1">{[person.FirstName,person.LastName].filter(Boolean).join(" ")}{person.EmailAddress ? ` — ${person.EmailAddress}` : ""}</div>)}</div>}
                        </div>
                    ) : <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">No exact Xero contact named <strong>{detailsFor?.name}</strong> was found. Check the customer name in Xero, then sync again.</div>}
                </DialogContent>
            </Dialog>

            <Dialog open={!!brandManagerFor} onOpenChange={(open) => !open && setBrandManagerFor(null)}>
                <DialogContent className="sm:max-w-[640px] max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Brand Manager</DialogTitle>
                        <DialogDescription>
                            Define which brands or concepts {brandManagerFor?.name} operates. Each site can be tagged with any combination.
                        </DialogDescription>
                    </DialogHeader>
                    {brandManagerFor && (
                        <BrandManager clientId={brandManagerFor.id} clientName={brandManagerFor.name} />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
