"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import DashboardLayout from "@/components/dashboard-layout"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCustomerFilter } from "@/lib/customer-filter"
import { mcdonaldsSiteKey } from "@/lib/mcdonalds-site-match"
import { Building2, Loader2 } from "lucide-react"

type ReviewStatus = "pending" | "verified" | "xero_issue" | "skipped"
type Site = {
    id: string; name: string; address: string | null; customerName: string;
    needsMatch: boolean; xeroNames: string[]; reviewStatus: ReviewStatus; reviewNote: string
}
type Customer = { id: string; name: string; xeroName: string; available: boolean; skipped: boolean; linkedSiteName: string | null }
type MatchData = { sites: Site[]; customers: Customer[] }

async function requestMatches(): Promise<MatchData> {
    const response = await fetch("/api/mcdonalds/site-matches", { cache: "no-store" })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || "Could not load sites.")
    return result as MatchData
}

function matchScore(siteName: string, customerName: string) {
    const site = mcdonaldsSiteKey(siteName)
    const customer = mcdonaldsSiteKey(customerName)
    if (site === customer) return 100
    if (site && customer.includes(site)) return 80
    if (customer && site.includes(customer)) return 70
    const siteParts = new Set(siteName.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 2))
    return customerName.toLowerCase().split(/[^a-z0-9]+/)
        .filter((part) => siteParts.has(part)).length * 10
}

export default function McDonaldsSiteMatchesPage() {
    const { isAdmin, initialised } = useCustomerFilter()
    const [data, setData] = useState<MatchData | null>(null)
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [selectedSiteId, setSelectedSiteId] = useState("")
    const [selectedCustomerId, setSelectedCustomerId] = useState("")
    const [siteSearch, setSiteSearch] = useState("")
    const [customerSearch, setCustomerSearch] = useState("")
    const [tab, setTab] = useState<"review" | "confirmed" | "skipped" | "xero">("review")
    const [reviewNoteDraft, setReviewNoteDraft] = useState<{ siteId: string; value: string } | null>(null)
    const [reviewingId, setReviewingId] = useState("")
    const [xeroSearch, setXeroSearch] = useState("")
    const [showSkipped, setShowSkipped] = useState(false)
    const [selectedXeroId, setSelectedXeroId] = useState("")
    const [creatingClientId, setCreatingClientId] = useState("")
    const [newSiteName, setNewSiteName] = useState("")
    const [newSiteAddress, setNewSiteAddress] = useState("")
    const [busyClientId, setBusyClientId] = useState("")
    const [refreshingXero, setRefreshingXero] = useState(false)

    const applyResult = useCallback((result: MatchData) => {
        setData(result)
        setError("")
        setSelectedSiteId((current) => result.sites.some((site) => site.id === current)
            ? current : result.sites[0]?.id || "")
    }, [])

    const load = useCallback(async () => {
        try {
            applyResult(await requestMatches())
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not load sites.")
        } finally {
            setLoading(false)
        }
    }, [applyResult])

    useEffect(() => {
        if (!initialised || !isAdmin) return
        void requestMatches().then(applyResult).catch((cause) => {
            setError(cause instanceof Error ? cause.message : "Could not load sites.")
        }).finally(() => setLoading(false))
    }, [initialised, isAdmin, applyResult])

    const visibleSites = useMemo(() => (data?.sites || []).filter((site) =>
        `${site.name} ${site.address || ""} ${site.customerName} ${site.xeroNames.join(" ")}`.toLowerCase()
            .includes(siteSearch.trim().toLowerCase()) &&
        (tab === "review" ? site.reviewStatus === "pending" || site.reviewStatus === "xero_issue"
            : tab === "confirmed" ? site.reviewStatus === "verified" : site.reviewStatus === "skipped")), [data, siteSearch, tab])
    const selectedSite = visibleSites.find((site) => site.id === selectedSiteId) || visibleSites[0]
    const selectedCustomer = data?.customers.find((customer) => customer.id === selectedCustomerId)
    const reviewNote = reviewNoteDraft && reviewNoteDraft.siteId === selectedSite?.id ? reviewNoteDraft.value : selectedSite?.reviewNote || ""
    const visibleCustomers = useMemo(() => {
        const search = customerSearch.trim().toLowerCase()
        return (data?.customers || []).filter((customer) =>
            !search || `${customer.name} ${customer.xeroName}`.toLowerCase().includes(search))
            .sort((a, b) => matchScore(selectedSite?.name || "", b.name) - matchScore(selectedSite?.name || "", a.name)
                || a.name.localeCompare(b.name, "en-NZ"))
            .slice(0, search ? 40 : 12)
    }, [data, customerSearch, selectedSite?.name])
    const unlinkedCustomers = (data?.customers || []).filter((customer) => !customer.linkedSiteName)
    const visibleUnlinkedCustomers = unlinkedCustomers.filter((customer) => customer.skipped === showSkipped &&
        `${customer.name} ${customer.xeroName}`.toLowerCase().includes(xeroSearch.trim().toLowerCase()))
    const selectedXero = visibleUnlinkedCustomers.find((customer) => customer.id === selectedXeroId) || visibleUnlinkedCustomers[0]

    async function changeSkip(customer: Customer, skipped: boolean) {
        setBusyClientId(customer.id)
        try {
            const response = await fetch("/api/mcdonalds/site-creation", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clientId: customer.id, skipped }),
            })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || "Could not save this choice.")
            toast.success(skipped ? `${customer.name} skipped` : `${customer.name} returned to the list`)
            await load()
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save this choice.")
        } finally {
            setBusyClientId("")
        }
    }

    async function refreshXero() {
        setRefreshingXero(true)
        try {
            const response = await fetch("/api/xero/contacts", { method: "POST" })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || "Could not refresh Xero contacts.")
            await load()
            toast.success("Xero contacts refreshed. Check the site match again.")
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not refresh Xero contacts.")
        } finally {
            setRefreshingXero(false)
        }
    }

    async function createSite(customer: Customer) {
        setBusyClientId(customer.id)
        try {
            const response = await fetch("/api/mcdonalds/site-creation", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clientId: customer.id, siteName: newSiteName, address: newSiteAddress }),
            })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || "Could not create this site.")
            toast.success(`${newSiteName.trim()} created and linked to ${customer.name}`)
            setCreatingClientId("")
            setNewSiteName("")
            setNewSiteAddress("")
            await load()
            if (result.siteId) {
                setSelectedSiteId(result.siteId)
                setTab("review")
            }
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not create this site.")
        } finally {
            setBusyClientId("")
        }
    }

    async function saveReview(site: Site, reviewStatus: ReviewStatus, note: string) {
        setReviewingId(site.id)
        try {
            const response = await fetch("/api/mcdonalds/site-matches", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ siteId: site.id, reviewStatus, note }),
            })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || "Could not save review.")
            setData((current) => current && ({ ...current, sites: current.sites.map((entry) =>
                entry.id === site.id ? { ...entry, reviewStatus, reviewNote: note.trim() } : entry) }))
            setReviewNoteDraft(null)
            toast.success(reviewStatus === "verified" ? `${site.name} confirmed` :
                reviewStatus === "xero_issue" ? `${site.name} flagged for Xero cleanup` :
                    reviewStatus === "skipped" ? `${site.name} skipped` : `${site.name} returned to review`)
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save review.")
        } finally {
            setReviewingId("")
        }
    }

    async function save() {
        if (!selectedSite || !selectedCustomer) return
        setSaving(true)
        try {
            const response = await fetch("/api/mcdonalds/site-matches", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ siteId: selectedSite.id, customerId: selectedCustomer.id }),
            })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || "Could not save this match.")
            toast.success(`${selectedSite.name} linked to ${selectedCustomer.name}`)
            setSelectedCustomerId("")
            setCustomerSearch("")
            await load()
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save this match.")
        } finally {
            setSaving(false)
        }
    }

    return <DashboardLayout><PageShell>
        <div className="mb-4"><Button variant="ghost" size="sm" asChild><Link href="/settings/customers">← Customer Settings</Link></Button></div>
        <PageHeader icon={Building2} title="Review McDonalds sites" description="Check each RPM site against its Xero customer, then confirm it." />
        {!initialised || (isAdmin && loading && !data) ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading sites…</p>
            : !isAdmin ? <p>Only Rodier administrators can review sites.</p>
                : error ? <p className="text-destructive">{error} <Button variant="outline" onClick={() => void load()}>Retry</Button></p>
                    : <div className="space-y-4">
                        <div className="flex justify-end"><Button variant="outline" disabled={refreshingXero} onClick={() => void refreshXero()}>{refreshingXero && <Loader2 className="size-4 animate-spin" />} Refresh Xero contacts</Button></div>
                        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Site review lists">
                            <Button role="tab" aria-selected={tab === "review"} variant={tab === "review" ? "default" : "outline"} onClick={() => setTab("review")}>To review ({data?.sites.filter((site) => site.reviewStatus === "pending" || site.reviewStatus === "xero_issue").length || 0})</Button>
                            <Button role="tab" aria-selected={tab === "confirmed"} variant={tab === "confirmed" ? "default" : "outline"} onClick={() => setTab("confirmed")}>Confirmed ({data?.sites.filter((site) => site.reviewStatus === "verified").length || 0})</Button>
                            <Button role="tab" aria-selected={tab === "skipped"} variant={tab === "skipped" ? "default" : "outline"} onClick={() => setTab("skipped")}>Skipped sites ({data?.sites.filter((site) => site.reviewStatus === "skipped").length || 0})</Button>
                            <Button role="tab" aria-selected={tab === "xero"} variant={tab === "xero" ? "default" : "outline"} onClick={() => setTab("xero")}>Xero contacts without a site ({unlinkedCustomers.filter((customer) => !customer.skipped).length})</Button>
                        </div>
                        {tab === "xero" ? <div className="grid gap-5 lg:grid-cols-[minmax(260px,1fr)_minmax(380px,2fr)]">
                            <section className="rounded-lg border p-4 space-y-3">
                                <h2 className="font-semibold">Xero contacts without an RPM site</h2>
                                <p className="text-sm text-muted-foreground">Create an RPM site only for a location you need. You can skip the rest.</p>
                                <div className="flex gap-2"><Button size="sm" variant={showSkipped ? "outline" : "default"} onClick={() => setShowSkipped(false)}>To decide</Button><Button size="sm" variant={showSkipped ? "default" : "outline"} onClick={() => setShowSkipped(true)}>Skipped ({unlinkedCustomers.filter((customer) => customer.skipped).length})</Button></div>
                                <Input aria-label="Search Xero contacts" placeholder="Search Xero contacts…" value={xeroSearch} onChange={(event) => setXeroSearch(event.target.value)} />
                                <div className="max-h-[65vh] overflow-y-auto space-y-1">
                                    {visibleUnlinkedCustomers.map((customer) => <button type="button" key={customer.id} onClick={() => { setSelectedXeroId(customer.id); setCreatingClientId("") }} className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${selectedXero?.id === customer.id ? "bg-muted" : ""}`}>
                                        <span className="block font-medium">{customer.name}</span><span className="block truncate text-xs text-muted-foreground">{customer.xeroName}</span>
                                    </button>)}
                                    {!visibleUnlinkedCustomers.length && <p className="text-sm text-muted-foreground">No contacts in this list.</p>}
                                </div>
                            </section>
                            <section className="rounded-lg border p-4 space-y-4">
                                {selectedXero ? <><div><h2 className="text-lg font-semibold">{selectedXero.name}</h2><p className="text-sm text-muted-foreground">Xero: {selectedXero.xeroName}</p></div>
                                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">No RPM site is linked to this Xero contact. Check whether this is a location you will work at.</div>
                                    {!selectedXero.available && !selectedXero.skipped && <p className="text-sm text-amber-700">This contact has another Xero link to review before a site can be created.</p>}
                                    {selectedXero.skipped ? <Button variant="outline" disabled={!!busyClientId} onClick={() => void changeSkip(selectedXero, false)}>Return to decision list</Button>
                                        : <div className="flex flex-wrap gap-2">
                                            <Button disabled={!!busyClientId || !selectedXero.available} onClick={() => { setCreatingClientId(selectedXero.id); setNewSiteName(selectedXero.name.replace(/^mc\s*donald['’]?s?\s*/i, "").trim() || selectedXero.name); setNewSiteAddress("") }}>Create RPM site</Button>
                                            <Button variant="outline" disabled={!!busyClientId} onClick={() => void changeSkip(selectedXero, true)}>Skip this contact</Button>
                                        </div>}
                                    {creatingClientId === selectedXero.id && <form className="space-y-3 rounded-md bg-muted p-3" onSubmit={(event) => { event.preventDefault(); void createSite(selectedXero) }}>
                                        <div><label htmlFor="new-site-name" className="text-sm font-medium">RPM site name</label><Input id="new-site-name" value={newSiteName} onChange={(event) => setNewSiteName(event.target.value)} required minLength={2} maxLength={200} /></div>
                                        <div><label htmlFor="new-site-address" className="text-sm font-medium">Full street address</label><Input id="new-site-address" value={newSiteAddress} onChange={(event) => setNewSiteAddress(event.target.value)} required minLength={5} maxLength={500} placeholder="Street, town, postcode" /></div>
                                        <div className="flex gap-2"><Button type="submit" disabled={!!busyClientId}>Save site and link Xero</Button><Button type="button" variant="ghost" onClick={() => setCreatingClientId("")}>Cancel</Button></div>
                                        <p className="text-xs text-muted-foreground">After saving, open the site to verify its map location.</p>
                                    </form>}</> : <p className="text-sm text-muted-foreground">Select a Xero contact on the left.</p>}
                            </section>
                        </div> : <div className="grid gap-5 lg:grid-cols-[minmax(260px,1fr)_minmax(380px,2fr)]">
                            <section className="rounded-lg border p-4 space-y-3">
                                <h2 className="font-semibold">RPM McDonalds sites</h2>
                                <Input aria-label="Search RPM sites" placeholder="Search RPM sites…" value={siteSearch} onChange={(event) => setSiteSearch(event.target.value)} />
                                <div className="max-h-[65vh] overflow-y-auto space-y-1">
                                    {visibleSites.map((site) => <button type="button" key={site.id} onClick={() => { setSelectedSiteId(site.id); setSelectedCustomerId(""); setCustomerSearch(""); setReviewNoteDraft(null) }} className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${selectedSite?.id === site.id ? "bg-muted" : ""}`}>
                                        <span className="block font-medium">{site.name}</span>
                                        <span className="block truncate text-xs text-muted-foreground">{site.xeroNames.length ? `Xero: ${site.xeroNames.join("; ")}` : "No Xero match"}</span>
                                        {site.reviewStatus === "xero_issue" && <span className="block text-xs text-amber-700">Needs Xero cleanup</span>}
                                    </button>)}
                                    {!visibleSites.length && <p className="text-sm text-muted-foreground">No sites in this list.</p>}
                                </div>
                            </section>
                            <section className="rounded-lg border p-4 space-y-4">
                                {selectedSite ? <>
                                    <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{selectedSite.name}</h2><p className="text-sm text-muted-foreground">{selectedSite.address || "No address recorded"}</p></div><Button variant="outline" size="sm" asChild><Link href={`/stores/${selectedSite.id}`}>Open site</Link></Button></div>
                                    {selectedSite.needsMatch || !selectedSite.xeroNames.length
                                        ? <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Needs checking:</strong> {selectedSite.needsMatch ? "This RPM site is still under the generic McDonalds customer. Choose its Xero contact below." : "This RPM customer has no linked Xero contact. Check or choose a contact below."}</div>
                                        : <div className="rounded-md border p-3 text-sm space-y-1"><p><strong>RPM customer:</strong> {selectedSite.customerName}</p><p><strong>Matched Xero contact:</strong> {selectedSite.xeroNames.join("; ")}</p></div>}
                                    {tab === "review" && <>
                                        <div className="space-y-2"><label htmlFor="customer-search" className="text-sm font-medium">Choose a different Xero contact</label>
                                            <Input id="customer-search" placeholder="Search Xero names…" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} />
                                            <div className="max-h-52 overflow-y-auto divide-y rounded-md border">
                                                {visibleCustomers.map((customer) => <button type="button" key={customer.id} disabled={!selectedSite.needsMatch || !customer.available} onClick={() => setSelectedCustomerId(customer.id)} className={`block w-full px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50 ${customer.id === selectedCustomerId ? "bg-muted font-semibold" : ""}`}>{customer.name}<span className="block text-xs font-normal text-muted-foreground">{customer.linkedSiteName ? `Already linked to ${customer.linkedSiteName}` : customer.skipped ? "Skipped" : customer.available ? "Available" : "Needs Xero review"}</span></button>)}
                                                {!visibleCustomers.length && <p className="p-3 text-sm text-muted-foreground">No Xero contacts match.</p>}
                                            </div>
                                            {selectedSite.needsMatch && <Button variant="outline" disabled={!selectedCustomer?.available || saving} onClick={() => void save()}>{saving && <Loader2 className="size-4 animate-spin" />} Save selected match</Button>}
                                            <p className="text-xs text-muted-foreground">Changing a site customer does not change existing job billing.</p>
                                        </div>
                                        <div className="space-y-2 border-t pt-4"><label htmlFor="review-note" className="text-sm font-medium">Review note</label>
                                            <Textarea id="review-note" value={reviewNote} onChange={(event) => setReviewNoteDraft({ siteId: selectedSite.id, value: event.target.value })} maxLength={1000} placeholder="Record any Xero duplicates or reasons to skip." />
                                            <div className="flex flex-wrap gap-2">
                                                <Button disabled={!!reviewingId || selectedSite.needsMatch || !selectedSite.xeroNames.length} onClick={() => void saveReview(selectedSite, "verified", reviewNote)}>Confirm match</Button>
                                                <Button variant="outline" disabled={!!reviewingId || !reviewNote.trim()} onClick={() => void saveReview(selectedSite, "xero_issue", reviewNote)}>Needs Xero cleanup</Button>
                                                <Button variant="outline" disabled={!!reviewingId} onClick={() => void saveReview(selectedSite, "skipped", reviewNote)}>Skip this RPM site</Button>
                                                {reviewNote !== selectedSite.reviewNote && <Button variant="ghost" disabled={!!reviewingId} onClick={() => void saveReview(selectedSite, selectedSite.reviewStatus, reviewNote)}>Save note</Button>}
                                            </div>
                                        </div>
                                    </>}
                                    {tab !== "review" && <><p className="text-sm text-muted-foreground">{selectedSite.reviewNote || (tab === "confirmed" ? "Match confirmed." : "Site skipped.")}</p><Button variant="outline" disabled={!!reviewingId} onClick={() => void saveReview(selectedSite, "pending", selectedSite.reviewNote)}>Return to review</Button></>}
                                </> : <p className="text-sm text-muted-foreground">Select an RPM site on the left.</p>}
                            </section>
                        </div>}
                    </div>}
    </PageShell></DashboardLayout>
}
