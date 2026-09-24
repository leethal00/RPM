"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, Users, Palette, ContactRound, RefreshCw, Mail, Phone, MapPin, Pencil } from "lucide-react"
import type { Client } from "@/types/database"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { BrandManager } from "@/components/brand-manager"
import Link from "next/link"

type XeroContact = {
    name: string; email?: string | null
    phones?: { PhoneNumber?: string | null }[]
    addresses?: { AddressLine1?: string | null; AddressLine2?: string | null; City?: string | null; Region?: string | null; PostalCode?: string | null }[]
    people?: { FirstName?: string | null; LastName?: string | null; EmailAddress?: string | null }[]
}

export function CustomerManager() {
    const supabase = createClient()
    const [customers, setCustomers] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)
    const [newCustomer, setNewCustomer] = useState("")
    const [adding, setAdding] = useState(false)
    const [brandManagerFor, setBrandManagerFor] = useState<Client | null>(null)
    const [detailsFor, setDetailsFor] = useState<Client | null>(null)
    const [clientJobs, setClientJobs] = useState<{ id: string; title: string; job_number: string | null; store_id: string | null; stores: { name: string } | null }[]>([])
    const [clientSites, setClientSites] = useState<{ id: string; name: string }[]>([])
    const [clientWorkError, setClientWorkError] = useState("")
    const [xeroContacts, setXeroContacts] = useState<XeroContact[]>([])
    const [xeroLoading, setXeroLoading] = useState(false)
    const [syncingCustomers, setSyncingCustomers] = useState(false)
    const [editCustomer, setEditCustomer] = useState<Client | null>(null)
    const [editName, setEditName] = useState("")

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
            const body = await response.json() as { contacts?: XeroContact[]; error?: string }
            if (!response.ok) throw new Error(body.error || "Could not load Xero contacts")
            setXeroContacts(body.contacts || [])
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not load Xero contacts")
        } finally { setXeroLoading(false) }
    }

    const matchingXeroContact = detailsFor ? xeroContacts.find((c) => c.name?.toLowerCase() === detailsFor.name.toLowerCase()) : null

    async function loadClientWork(clientId: string) {
        setClientWorkError("")
        setClientJobs([])
        setClientSites([])
        const [jobs, sites] = await Promise.all([
            supabase.from("costing_jobs").select("id,title,job_number,store_id,stores(name)").eq("client_id", clientId).eq("is_template", false).order("created_at", { ascending: false }).limit(100),
            supabase.from("stores").select("id,name").eq("client_id", clientId).order("name"),
        ])
        if (jobs.error || sites.error) return setClientWorkError(jobs.error?.message || sites.error?.message || "Could not load client work")
        setClientJobs((jobs.data || []) as typeof clientJobs)
        setClientSites(sites.data || [])
    }

    const importXeroCustomers = async () => {
        setSyncingCustomers(true)
        try {
            const response = await fetch("/api/xero/contacts", { cache: "no-store" })
            const body = await response.json() as { contacts?: XeroContact[]; error?: string }
            if (!response.ok) throw new Error(body.error || "Could not load Xero customers")
            const contacts = body.contacts || []
            const existing = new Map(customers.map(c => [c.name.trim().toLowerCase(), c]))
            const missing = contacts.filter((c: XeroContact) => c.name?.trim() && !existing.has(c.name.trim().toLowerCase()))
            if (missing.length) {
                const { error } = await supabase.from('clients').insert(missing.map((c: XeroContact) => ({ name: c.name.trim(), contact_email: c.email || null, active: true })))
                if (error) throw error
            }
            const exactMatches = contacts.filter((c: XeroContact) => existing.has((c.name || '').trim().toLowerCase()) && c.email)
            await Promise.all(exactMatches.map((c: XeroContact) => supabase.from('clients').update({ contact_email: c.email }).eq('id', existing.get(c.name.trim().toLowerCase())!.id)))
            toast.success(missing.length ? `Imported ${missing.length} customer${missing.length === 1 ? "" : "s"} from Xero` : "Customer list already matches Xero")
            await fetchCustomers()
            setXeroContacts(contacts)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not import Xero customers")
        } finally { setSyncingCustomers(false) }
    }

    const saveCustomerName = async () => {
        if (!editCustomer || !editName.trim()) return
        const { error } = await supabase.from('clients').update({ name: editName.trim() }).eq('id', editCustomer.id)
        if (error) return toast.error(error.message)
        toast.success("Customer name updated")
        setEditCustomer(null)
        await fetchCustomers()
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
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Users className="size-5 text-primary" />
                        Customer Management
                    </h3>
                    <p className="text-sm text-muted-foreground">Manage customers and clients for site categorization.</p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={importXeroCustomers} disabled={syncingCustomers}>
                    <RefreshCw className={`size-3.5 ${syncingCustomers ? "animate-spin" : ""}`} />
                    {syncingCustomers ? "Syncing…" : "Import customers from Xero"}
                </Button>
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
                                            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" title="Rename customer" onClick={(e) => { e.stopPropagation(); setEditCustomer(customer); setEditName(customer.name) }}>
                                                <Pencil className="size-3.5" />
                                            </Button>
                                            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={(e) => { e.stopPropagation(); setDetailsFor(customer); void loadClientWork(customer.id); if (!xeroContacts.length) loadXeroContacts() }}>
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



            <Dialog open={!!editCustomer} onOpenChange={(open) => !open && setEditCustomer(null)}>
                <DialogContent className="sm:max-w-[460px]">
                    <DialogHeader><DialogTitle>Edit customer name</DialogTitle><DialogDescription>Use the same customer name as Xero so contact details match automatically.</DialogDescription></DialogHeader>
                    <Input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveCustomerName() }} />
                    <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditCustomer(null)}>Cancel</Button><Button onClick={saveCustomerName} disabled={!editName.trim()}>Save</Button></div>
                </DialogContent>
            </Dialog>

            <Dialog open={!!detailsFor} onOpenChange={(open) => !open && setDetailsFor(null)}>
                <DialogContent className="sm:max-w-[680px] max-h-[80vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>{detailsFor?.name}</DialogTitle><DialogDescription>Customer contact details are read from Xero, which remains the source of truth.</DialogDescription></DialogHeader>
                    <div className="flex justify-end"><Button variant="outline" size="sm" className="gap-1.5" onClick={loadXeroContacts} disabled={xeroLoading}><RefreshCw className={`size-3.5 ${xeroLoading ? "animate-spin" : ""}`} /> Sync from Xero</Button></div>
                    {xeroLoading ? <div className="py-10 text-center"><Loader2 className="size-6 animate-spin mx-auto" /></div> : matchingXeroContact ? (
                        <div className="space-y-4 text-sm">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-md border p-3"><div className="font-medium mb-2">Primary contact</div>{matchingXeroContact.email && <div className="flex gap-2"><Mail className="size-4 mt-0.5" />{matchingXeroContact.email}</div>}{matchingXeroContact.phones?.filter((p)=>p.PhoneNumber).map((p,i:number)=><div key={i} className="flex gap-2 mt-1"><Phone className="size-4 mt-0.5" />{p.PhoneNumber}</div>)}</div>
                                <div className="rounded-md border p-3"><div className="font-medium mb-2">Addresses</div>{matchingXeroContact.addresses?.filter((a)=>a.AddressLine1||a.City).map((a,i:number)=><div key={i} className="flex gap-2 mb-2"><MapPin className="size-4 mt-0.5 shrink-0" /><span>{[a.AddressLine1,a.AddressLine2,a.City,a.Region,a.PostalCode].filter(Boolean).join(", ")}</span></div>)}</div>
                            </div>
                            {!!matchingXeroContact.people?.length && <div className="rounded-md border p-3"><div className="font-medium mb-2">Contact people</div>{matchingXeroContact.people.map((person,i:number)=><div key={i} className="py-1">{[person.FirstName,person.LastName].filter(Boolean).join(" ")}{person.EmailAddress ? ` — ${person.EmailAddress}` : ""}</div>)}</div>}
                        </div>
                    ) : <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">No exact Xero contact named <strong>{detailsFor?.name}</strong> was found. Check the customer name in Xero, then sync again.</div>}
                    <div className="grid gap-4 sm:grid-cols-2 text-sm">
                        <section><h3 className="mb-2 font-semibold">Jobs</h3>{clientWorkError && <p className="text-destructive">{clientWorkError}</p>}
                            {clientJobs.length ? <div className="divide-y rounded-md border">{clientJobs.map((job) => <Link key={job.id} href={`/quoting/${job.id}`} className="block p-2.5 hover:bg-muted/40" onClick={() => setDetailsFor(null)}><span className="font-medium">{job.job_number || "Job"} · {job.title}</span><span className="block text-xs text-muted-foreground">{job.stores?.name || "Manufacture only / No site"}</span></Link>)}</div> : !clientWorkError && <p className="text-muted-foreground">No jobs for this client yet.</p>}
                        </section>
                        <section><h3 className="mb-2 font-semibold">Sites</h3>{clientSites.length ? <div className="divide-y rounded-md border">{clientSites.map((site) => <Link key={site.id} href={`/stores/${site.id}`} className="block p-2.5 hover:bg-muted/40" onClick={() => setDetailsFor(null)}>{site.name}</Link>)}</div> : !clientWorkError && <p className="text-muted-foreground">No sites for this client yet.</p>}</section>
                    </div>
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
