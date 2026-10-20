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

type ReviewStatus = "pending" | "verified" | "xero_issue"
type Site = {
    id: string; name: string; address: string | null; customerName: string;
    needsMatch: boolean; xeroNames: string[]; reviewStatus: ReviewStatus; reviewNote: string
}
type Customer = { id: string; name: string; xeroName: string; available: boolean; linkedSiteName: string | null }
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
    const [reviewFilter, setReviewFilter] = useState<"all" | "pending" | "xero_issue" | "verified">("all")
    const [reviewNoteDraft, setReviewNoteDraft] = useState<{ siteId: string; value: string } | null>(null)
    const [reviewingId, setReviewingId] = useState("")

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

    const selectedSite = data?.sites.find((site) => site.id === selectedSiteId)
    const selectedCustomer = data?.customers.find((customer) => customer.id === selectedCustomerId)
    const reviewNote = reviewNoteDraft && reviewNoteDraft.siteId === selectedSite?.id ? reviewNoteDraft.value : selectedSite?.reviewNote || ""
    const visibleSites = useMemo(() => (data?.sites || []).filter((site) =>
        `${site.name} ${site.address || ""} ${site.customerName} ${site.xeroNames.join(" ")}`.toLowerCase()
            .includes(siteSearch.trim().toLowerCase()) &&
        (reviewFilter === "all" || site.reviewStatus === reviewFilter)), [data, siteSearch, reviewFilter])
    const visibleCustomers = useMemo(() => {
        const search = customerSearch.trim().toLowerCase()
        return (data?.customers || []).filter((customer) =>
            !search || `${customer.name} ${customer.xeroName}`.toLowerCase().includes(search))
            .sort((a, b) => matchScore(selectedSite?.name || "", b.name) - matchScore(selectedSite?.name || "", a.name)
                || a.name.localeCompare(b.name, "en-NZ"))
            .slice(0, search ? 40 : 12)
    }, [data, customerSearch, selectedSite?.name])

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
            toast.success(reviewStatus === "verified" ? `${site.name} checked` :
                reviewStatus === "xero_issue" ? `${site.name} flagged for Xero cleanup` : `${site.name} marked unchecked`)
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
        <PageHeader icon={Building2} title="Review McDonalds sites" description="Check every site against its Xero customer. Match missing customers and flag Xero records that need cleanup." />
        {!initialised || (isAdmin && loading && !data) ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading sites…</p>
            : !isAdmin ? <p>Only Rodier administrators can match sites.</p>
                : error ? <p className="text-destructive">{error} <Button variant="outline" onClick={() => void load()}>Retry</Button></p>
                    : <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">{data?.sites.filter((site) => site.reviewStatus === "verified").length || 0} of {data?.sites.length || 0} checked · {data?.sites.filter((site) => site.needsMatch).length || 0} still need a customer · {data?.sites.filter((site) => site.reviewStatus === "xero_issue").length || 0} need Xero cleanup.</p>
                        {data?.sites.length === 0 ? <div className="rounded-lg border p-8 text-center">No McDonalds sites found.</div>
                            : <div className="grid gap-5 lg:grid-cols-[minmax(230px,1fr)_minmax(350px,2fr)]">
                                <section className="rounded-lg border p-4 space-y-3">
                                    <h2 className="font-semibold">All McDonalds sites</h2>
                                    <Input aria-label="Search sites" placeholder="Search site or customer…" value={siteSearch} onChange={(event) => setSiteSearch(event.target.value)} />
                                    <select aria-label="Filter review status" value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as typeof reviewFilter)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                                        <option value="all">All sites</option><option value="pending">Unchecked</option>
                                        <option value="xero_issue">Needs Xero cleanup</option><option value="verified">Checked and correct</option>
                                    </select>
                                    <div className="max-h-[65vh] overflow-y-auto space-y-1">
                                        {visibleSites.map((site) => <div key={site.id} className={`flex items-start gap-2 rounded-md px-2 py-2 hover:bg-muted ${site.id === selectedSiteId ? "bg-muted" : ""}`}>
                                            <input type="checkbox" aria-label={`Checked and correct: ${site.name}`} checked={site.reviewStatus === "verified"}
                                                disabled={reviewingId === site.id || site.needsMatch}
                                                onChange={(event) => void saveReview(site, event.target.checked ? "verified" : "pending", site.id === selectedSiteId ? reviewNote : site.reviewNote)}
                                                className="mt-1 size-4 shrink-0 accent-primary" />
                                            <button type="button" onClick={() => {
                                                setSelectedSiteId(site.id); setSelectedCustomerId(""); setCustomerSearch(""); setReviewNoteDraft(null)
                                            }} className="min-w-0 flex-1 text-left text-sm">
                                                <span className="block font-medium">{site.name}</span>
                                                <span className="block truncate text-xs text-muted-foreground">{site.customerName}{site.needsMatch ? " · Needs customer" : ""}</span>
                                                {site.reviewStatus === "xero_issue" && <span className="block text-xs text-amber-700">Needs Xero cleanup</span>}
                                            </button>
                                        </div>)}
                                        {visibleSites.length === 0 && <p className="p-3 text-sm text-muted-foreground">No sites match this filter.</p>}
                                    </div>
                                </section>
                                <section className="rounded-lg border p-4 space-y-4">
                                    <div><h2 className="text-lg font-semibold">{selectedSite?.name}</h2><p className="text-sm text-muted-foreground">{selectedSite?.address || "No address recorded"}</p></div>
                                    <div className="rounded-md border p-3 text-sm space-y-1">
                                        <p><strong>RPM customer:</strong> {selectedSite?.customerName}</p>
                                        <p><strong>Xero contact:</strong> {selectedSite?.xeroNames.length ? selectedSite.xeroNames.join("; ") : "None linked"}</p>
                                        <p><strong>Match:</strong> {selectedSite?.needsMatch ? "Needs a customer" : "Linked"}</p>
                                    </div>
                                    <div className="space-y-2">
                                        <label htmlFor="review-note" className="text-sm font-medium">Review note / Xero cleanup details</label>
                                        <Textarea id="review-note" value={reviewNote} onChange={(event) => selectedSite && setReviewNoteDraft({ siteId: selectedSite.id, value: event.target.value })} maxLength={1000}
                                            placeholder="e.g. Two Xero contacts for this restaurant; merge in Xero before confirming." />
                                        <div className="flex flex-wrap gap-2">
                                            <Button variant="outline" disabled={!selectedSite || !!reviewingId || !reviewNote.trim()} onClick={() => selectedSite && void saveReview(selectedSite, "xero_issue", reviewNote)}>Save as needing Xero cleanup</Button>
                                            {selectedSite && reviewNote !== selectedSite.reviewNote && <Button variant="ghost" disabled={!!reviewingId || (selectedSite.reviewStatus === "xero_issue" && !reviewNote.trim())} onClick={() => void saveReview(selectedSite, selectedSite.reviewStatus, reviewNote)}>Save note</Button>}
                                            {selectedSite?.reviewStatus === "xero_issue" && <Button variant="ghost" disabled={!!reviewingId} onClick={() => selectedSite && void saveReview(selectedSite, "pending", reviewNote)}>Return to unchecked</Button>}
                                        </div>
                                        <p className="text-xs text-muted-foreground">Tick the box beside a site only after checking its RPM site and Xero contact. Xero cleanup notes remain here while you sort contacts in Xero.</p>
                                    </div>
                                    <div className="space-y-2 border-t pt-4">
                                        <label htmlFor="customer-search" className="text-sm font-medium">Search McDonalds Xero contacts</label>
                                        <Input id="customer-search" placeholder="Search customer names…" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} />
                                        <p className="text-xs text-muted-foreground">Search all Xero versions here. Contacts already linked to a site are shown for comparison but cannot be matched again.</p>
                                        <div className="max-h-80 overflow-y-auto rounded-md border divide-y">
                                            {visibleCustomers.map((customer) => <button type="button" key={customer.id}
                                                onClick={() => setSelectedCustomerId(selectedSite?.needsMatch && customer.available ? customer.id : "")}
                                                className={`block w-full px-3 py-2 text-left text-sm hover:bg-muted ${customer.id === selectedCustomerId ? "bg-muted font-semibold" : ""}`}>
                                                {customer.name}
                                                {customer.xeroName !== customer.name && <span className="block text-xs font-normal text-muted-foreground">Xero: {customer.xeroName}</span>}
                                                <span className="block text-xs font-normal text-muted-foreground">{customer.linkedSiteName ? `Already linked to ${customer.linkedSiteName}` : customer.available ? "Available to match" : "Needs Xero contact review"}</span>
                                            </button>)}
                                            {visibleCustomers.length === 0 && <p className="p-3 text-sm text-muted-foreground">No Xero customer matches this search.</p>}
                                        </div>
                                    {selectedSite?.needsMatch && selectedCustomer && <div className="rounded-md bg-muted p-3 text-sm">Link <strong>{selectedSite.name}</strong> to <strong>{selectedCustomer.name}</strong></div>}
                                    {selectedSite?.needsMatch && <Button disabled={!selectedCustomer?.available || saving} onClick={() => void save()}>
                                        {saving && <Loader2 className="size-4 animate-spin" />} Save this match
                                    </Button>}
                                    {selectedSite?.needsMatch && <p className="text-xs text-muted-foreground">Matching changes this site’s customer and links the Xero contact. Existing job billing stays as it was.</p>}
                                    </div>
                                </section>
                            </div>}
                    </div>}
    </PageShell></DashboardLayout>
}
