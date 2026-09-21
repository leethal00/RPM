"use client"

import { useEffect, useMemo, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { PageHeader } from "@/components/page-header"
import { PageShell } from "@/components/page-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import { Building2, Edit2, Plus, Search } from "lucide-react"
import { toast } from "sonner"

type Supplier = {
    id: string
    name: string
    aliases: string[]
    import_identifiers: string[]
    account_number: string | null
    contact_name: string | null
    phone: string | null
    email: string | null
    website: string | null
    ordering_email: string | null
    physical_address: string | null
    postal_address: string | null
    notes: string | null
    active: boolean
}

const emptyForm = {
    name: "",
    aliases: "",
    import_identifiers: "",
    account_number: "",
    contact_name: "",
    phone: "",
    email: "",
    website: "",
    ordering_email: "",
    physical_address: "",
    postal_address: "",
    notes: "",
    active: true,
}

export default function SuppliersPage() {
    const supabase = useMemo(() => createClient(), [])
    const [suppliers, setSuppliers] = useState<Supplier[]>([])
    const [search, setSearch] = useState("")
    const [editing, setEditing] = useState<Supplier | null>(null)
    const [form, setForm] = useState(emptyForm)
    const [saving, setSaving] = useState(false)

    async function loadSuppliers() {
        const { data, error } = await supabase.from("supplier_directory").select("*").order("name")
        if (error) return toast.error(error.message)
        setSuppliers((data ?? []) as Supplier[])
    }

    useEffect(() => { void loadSuppliers() }, [])

    const filtered = suppliers.filter((supplier) => {
        const haystack = [supplier.name, ...(supplier.aliases || []), supplier.contact_name || "", supplier.account_number || ""].join(" ").toLowerCase()
        return haystack.includes(search.trim().toLowerCase())
    })

    function editSupplier(supplier?: Supplier) {
        if (!supplier) {
            setEditing(null)
            setForm(emptyForm)
            return
        }
        setEditing(supplier)
        setForm({
            name: supplier.name,
            aliases: (supplier.aliases || []).join(", "),
            import_identifiers: (supplier.import_identifiers || []).join(", "),
            account_number: supplier.account_number || "",
            contact_name: supplier.contact_name || "",
            phone: supplier.phone || "",
            email: supplier.email || "",
            website: supplier.website || "",
            ordering_email: supplier.ordering_email || "",
            physical_address: supplier.physical_address || "",
            postal_address: supplier.postal_address || "",
            notes: supplier.notes || "",
            active: supplier.active,
        })
    }

    async function saveSupplier(event: React.FormEvent) {
        event.preventDefault()
        if (!form.name.trim()) return toast.error("Supplier name is required")
        setSaving(true)
        const payload = {
            name: form.name.trim(),
            aliases: form.aliases.split(",").map((value) => value.trim()).filter(Boolean),
            import_identifiers: form.import_identifiers.split(",").map((value) => value.trim()).filter(Boolean),
            account_number: form.account_number.trim() || null,
            contact_name: form.contact_name.trim() || null,
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
            website: form.website.trim() || null,
            ordering_email: form.ordering_email.trim() || null,
            physical_address: form.physical_address.trim() || null,
            postal_address: form.postal_address.trim() || null,
            notes: form.notes.trim() || null,
            active: form.active,
            updated_at: new Date().toISOString(),
        }
        const result = editing
            ? await supabase.from("supplier_directory").update(payload).eq("id", editing.id)
            : await supabase.from("supplier_directory").insert(payload)
        setSaving(false)
        if (result.error) return toast.error(result.error.message)
        toast.success(editing ? "Supplier updated" : "Supplier added")
        editSupplier()
        await loadSuppliers()
    }

    return (
        <DashboardLayout>
            <PageShell width="full" className="px-4 xl:px-6">
                <PageHeader icon={Building2} title="Suppliers" description="Manage material suppliers, contacts, account details and price-import aliases." actions={
                    <Button size="sm" onClick={() => editSupplier()}><Plus className="mr-1.5 size-4" /> Add supplier</Button>
                } />

                <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
                    <section className="space-y-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input className="pl-9" placeholder="Search suppliers, aliases, contacts or account numbers..." value={search} onChange={(event) => setSearch(event.target.value)} />
                        </div>
                        <div className="overflow-hidden rounded-lg border bg-card">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                                    <tr><th className="px-3 py-2">Supplier</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Account</th><th className="px-3 py-2">Status</th><th className="w-12" /></tr>
                                </thead>
                                <tbody>
                                    {filtered.map((supplier) => (
                                        <tr key={supplier.id} className="border-t">
                                            <td className="px-3 py-2"><div className="font-medium">{supplier.name}</div>{supplier.aliases?.length > 0 && <div className="text-xs text-muted-foreground">Also: {supplier.aliases.join(", ")}</div>}</td>
                                            <td className="px-3 py-2"><div>{supplier.contact_name || "—"}</div><div className="text-xs text-muted-foreground">{supplier.email || supplier.phone || ""}</div></td>
                                            <td className="px-3 py-2">{supplier.account_number || "—"}</td>
                                            <td className="px-3 py-2">{supplier.active ? "Active" : "Inactive"}</td>
                                            <td className="px-2 py-2"><Button variant="ghost" size="icon" onClick={() => editSupplier(supplier)}><Edit2 className="size-4" /></Button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="rounded-lg border bg-card p-4">
                        <h2 className="mb-4 font-semibold">{editing ? "Edit " + editing.name : "Add supplier"}</h2>
                        <form onSubmit={saveSupplier} className="space-y-3">
                            <div><Label>Supplier name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                            <div><Label>Aliases / trading names</Label><Input placeholder="e.g. Ullrich, Ullrich Aluminium" value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} /></div>
                            <div><Label>Import identifiers</Label><Input placeholder="Names/codes seen in supplier files" value={form.import_identifiers} onChange={(e) => setForm({ ...form, import_identifiers: e.target.value })} /></div>
                            <div className="grid grid-cols-2 gap-3"><div><Label>Account number</Label><Input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></div><div><Label>Contact</Label><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div></div>
                            <div className="grid grid-cols-2 gap-3"><div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div><div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div></div>
                            <div><Label>Ordering email</Label><Input type="email" value={form.ordering_email} onChange={(e) => setForm({ ...form, ordering_email: e.target.value })} /></div>
                            <div><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
                            <div><Label>Physical address</Label><Input value={form.physical_address} onChange={(e) => setForm({ ...form, physical_address: e.target.value })} /></div>
                            <div><Label>Postal address</Label><Input value={form.postal_address} onChange={(e) => setForm({ ...form, postal_address: e.target.value })} /></div>
                            <div><Label>Notes</Label><textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active supplier</label>
                            <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => editSupplier()}>Clear</Button><Button type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Save changes" : "Add supplier"}</Button></div>
                        </form>
                    </section>
                </div>
            </PageShell>
        </DashboardLayout>
    )
}
