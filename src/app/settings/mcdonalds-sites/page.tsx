"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import DashboardLayout from "@/components/dashboard-layout"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCustomerFilter } from "@/lib/customer-filter"
import { mcdonaldsSiteKey } from "@/lib/mcdonalds-site-match"
import { Building2, Loader2 } from "lucide-react"

type Site = { id: string; name: string; address: string | null }
type Customer = { id: string; name: string; xeroName: string }
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
    const visibleSites = useMemo(() => (data?.sites || []).filter((site) =>
        `${site.name} ${site.address || ""}`.toLowerCase().includes(siteSearch.trim().toLowerCase())), [data, siteSearch])
    const visibleCustomers = useMemo(() => {
        const search = customerSearch.trim().toLowerCase()
        return (data?.customers || []).filter((customer) =>
            !search || `${customer.name} ${customer.xeroName}`.toLowerCase().includes(search))
            .sort((a, b) => matchScore(selectedSite?.name || "", b.name) - matchScore(selectedSite?.name || "", a.name)
                || a.name.localeCompare(b.name, "en-NZ"))
            .slice(0, search ? 40 : 12)
    }, [data, customerSearch, selectedSite?.name])

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
        <PageHeader icon={Building2} title="Match McDonalds sites" description="Choose the Xero customer for each existing site. Photos, assets and history stay with the site." />
        {!initialised || (isAdmin && loading && !data) ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading sites…</p>
            : !isAdmin ? <p>Only Rodier administrators can match sites.</p>
                : error ? <p className="text-destructive">{error} <Button variant="outline" onClick={() => void load()}>Retry</Button></p>
                    : <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">{data?.sites.length || 0} sites left to match. Select a site, search for its Xero customer, then save that pair.</p>
                        {data?.sites.length === 0 ? <div className="rounded-lg border p-8 text-center">All sites have been matched.</div>
                            : <div className="grid gap-5 lg:grid-cols-[minmax(230px,1fr)_minmax(350px,2fr)]">
                                <section className="rounded-lg border p-4 space-y-3">
                                    <h2 className="font-semibold">Sites needing a customer</h2>
                                    <Input aria-label="Search sites" placeholder="Search sites…" value={siteSearch} onChange={(event) => setSiteSearch(event.target.value)} />
                                    <div className="max-h-[65vh] overflow-y-auto space-y-1">
                                        {visibleSites.map((site) => <button type="button" key={site.id}
                                            onClick={() => { setSelectedSiteId(site.id); setSelectedCustomerId(""); setCustomerSearch("") }}
                                            className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${site.id === selectedSiteId ? "bg-muted font-semibold" : ""}`}>
                                            <span className="block">{site.name}</span>
                                            <span className="block truncate text-xs font-normal text-muted-foreground">{site.address || "No address recorded"}</span>
                                        </button>)}
                                    </div>
                                </section>
                                <section className="rounded-lg border p-4 space-y-4">
                                    <div><h2 className="text-lg font-semibold">{selectedSite?.name}</h2><p className="text-sm text-muted-foreground">{selectedSite?.address || "No address recorded"}</p></div>
                                    <div className="space-y-2">
                                        <label htmlFor="customer-search" className="text-sm font-medium">Find the matching Xero customer</label>
                                        <Input id="customer-search" placeholder="Search customer names…" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} />
                                        {!customerSearch && <p className="text-xs text-muted-foreground">Possible matches are shown first. Check the Xero name before selecting.</p>}
                                        <div className="max-h-80 overflow-y-auto rounded-md border divide-y">
                                            {visibleCustomers.map((customer) => <button type="button" key={customer.id}
                                                onClick={() => setSelectedCustomerId(customer.id)}
                                                className={`block w-full px-3 py-2 text-left text-sm hover:bg-muted ${customer.id === selectedCustomerId ? "bg-muted font-semibold" : ""}`}>
                                                {customer.name}
                                                {customer.xeroName !== customer.name && <span className="block text-xs font-normal text-muted-foreground">Xero: {customer.xeroName}</span>}
                                            </button>)}
                                            {visibleCustomers.length === 0 && <p className="p-3 text-sm text-muted-foreground">No available Xero customer matches this search.</p>}
                                        </div>
                                    </div>
                                    {selectedCustomer && <div className="rounded-md bg-muted p-3 text-sm">Link <strong>{selectedSite?.name}</strong> to <strong>{selectedCustomer.name}</strong></div>}
                                    <Button disabled={!selectedCustomer || saving} onClick={() => void save()}>
                                        {saving && <Loader2 className="size-4 animate-spin" />} Save this match
                                    </Button>
                                    <p className="text-xs text-muted-foreground">This changes the site’s customer and links the Xero contact. It does not change who existing jobs were billed to.</p>
                                </section>
                            </div>}
                    </div>}
    </PageShell></DashboardLayout>
}
