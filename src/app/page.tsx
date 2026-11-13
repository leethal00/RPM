"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import DashboardLayout from "@/components/dashboard-layout"
import { StoreList } from "@/components/store-list"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import type { Store } from "@/types/database"
import { matchesMapSiteSearch } from "@/lib/map-site-search"
import { useCustomerFilter } from "@/lib/customer-filter"
import { customerSiteFilter, linkedCustomerSiteIds } from "@/lib/linked-customer-sites"

const StoreMap = dynamic(() => import("@/components/store-map"), { ssr: false, loading: () => <div className="h-full w-full bg-muted animate-pulse" /> })

// Sites also link to clients through customer_site_links. Select the billing
// customer FK explicitly so PostgREST does not reject the ambiguous relation.
const DETAIL_COLS = "id, clients:clients!stores_client_id_fkey(name), site_photos(url, is_primary, internal_only, created_at), store_brands(brand_id, client_brands(*)), assets(next_service_date), jobs(status, job_type)"

export default function MapPage() {
  const supabase = useMemo(() => createClient(), [])
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const { clientId, isAdmin, customers } = useCustomerFilter()
  const { data: baseStores = [], isLoading: loading, error, mutate } = useSupabaseQuery<Store[]>(`map-sites-${clientId ?? "all"}-${isAdmin}`, async () => {
    let storeQuery = supabase.from("stores").select("*")
    if (clientId) {
      const linkedSiteIds = isAdmin ? await linkedCustomerSiteIds(clientId) : []
      storeQuery = storeQuery.or(customerSiteFilter(clientId, linkedSiteIds))
    }
    const { data: storeData, error: storeError } = await storeQuery
    if (storeError) return { data: null, error: storeError }
    return { data: (storeData ?? []) as Store[], error: null }
  })
  // Photos, branding, and health must never hold the site's location hostage.
  const siteIds = baseStores.map(store => store.id)
  const { data: details, error: detailError } = useSupabaseQuery<Partial<Store>[]>(
    siteIds.length ? `map-site-details-${siteIds.join(",")}` : null,
    async () => {
      // Keep each URL below proxy/header size limits for nationwide portfolios.
      const results = await Promise.all(Array.from({ length: Math.ceil(siteIds.length / 50) }, (_, index) =>
        supabase.from("stores").select(DETAIL_COLS).in("id", siteIds.slice(index * 50, (index + 1) * 50)),
      ))
      const error = results.find(result => result.error)?.error ?? null
      return { data: results.flatMap(result => result.data ?? []) as unknown as Partial<Store>[], error }
    },
    { keepPreviousData: false },
  )
  const stores = useMemo(() => {
    const byId = new Map(details?.map(store => [store.id, store]))
    return baseStores.map(store => ({ ...store, ...byId.get(store.id) }))
  }, [baseStores, details])

  const activeSelectedStore = selectedStore && stores.some(store => store.id === selectedStore.id) ? selectedStore : null
  const center: [number, number] = activeSelectedStore?.lat != null && activeSelectedStore?.lng != null ? [activeSelectedStore.lat, activeSelectedStore.lng] : [-40.9006, 174.886]
  const zoom = activeSelectedStore ? 14 : 5.5
  const filteredStores = useMemo(() => stores.filter(store => matchesMapSiteSearch(store, searchTerm, customers.find(customer => customer.id === store.client_id)?.name)), [stores, searchTerm, customers])

  return <DashboardLayout>
    {error && <div role="alert" className="rounded-md border p-3 text-sm">Sites could not load. <button className="underline" onClick={() => void mutate()}>Try again</button></div>}
    {detailError && <div role="status" className="rounded-md border p-3 text-sm">Site locations are available, but photos, brands, and maintenance status could not load.</div>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading sites…</p>}
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[420px] w-full max-w-full gap-0 overflow-hidden rounded-xl border bg-background shadow-sm sm:h-[calc(100dvh-8rem)]">
      <div className="relative min-w-0 flex-1 overflow-hidden">
        {loading ? <div className="h-full w-full bg-muted animate-pulse" /> : <><StoreMap stores={filteredStores} center={center} zoom={zoom} selectedStoreId={activeSelectedStore?.id} />{activeSelectedStore && <button onClick={() => setSelectedStore(null)} className="absolute bottom-4 left-4 z-[1000] flex items-center gap-2 rounded-md border bg-white px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-gray-50">Clear Selection</button>}</>}
      </div>
      <div className="hidden h-full w-96 shrink-0 border-l lg:block"><StoreList stores={filteredStores} attentionSourceStores={stores} onStoreClick={setSelectedStore} selectedStoreId={activeSelectedStore?.id} searchTerm={searchTerm} onSearchChange={setSearchTerm} onCustomerChange={() => setSelectedStore(null)} /></div>
    </div>
  </DashboardLayout>
}
