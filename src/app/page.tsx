"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import DashboardLayout from "@/components/dashboard-layout"
import { StoreList } from "@/components/store-list"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import type { Store } from "@/types/database"
import { useCustomerFilter } from "@/lib/customer-filter"

const StoreMap = dynamic(() => import("@/components/store-map"), { ssr: false, loading: () => <div className="h-full w-full bg-muted animate-pulse" /> })

const STORE_COLS = "id, name, address, region, status, lat, lng, location_approximate, site_category, has_drive_thru, manager_name, client_id, client:clients(name), site_photos(url, is_primary, created_at), store_brands(brand_id, client_brands(*))"

export default function MapPage() {
  const supabase = useMemo(() => createClient(), [])
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const { clientId } = useCustomerFilter()
  const { data: stores = [], isLoading: loading } = useSupabaseQuery<Store[]>(`map-stores-health-${clientId ?? "all"}`, async () => {
    let storeQuery = supabase.from("stores").select(STORE_COLS)
    if (clientId) storeQuery = storeQuery.eq("client_id", clientId)
    const { data: storeData, error: storeError } = await storeQuery
    if (storeError) return { data: null, error: storeError }
    const baseStores = (storeData ?? []) as Store[]
    if (!baseStores.length) return { data: [], error: null }
    const storeIds = baseStores.map(s => s.id)
    const [{ data: assetData, error: assetError }, { data: jobData, error: jobError }] = await Promise.all([
      supabase.from("assets").select("store_id, next_service_date").in("store_id", storeIds),
      supabase.from("jobs").select("store_id, status, job_type").in("store_id", storeIds),
    ])
    if (assetError) return { data: null, error: assetError }
    if (jobError) return { data: null, error: jobError }
    const assetsByStore = new Map<string, any[]>(), jobsByStore = new Map<string, any[]>()
    for (const asset of assetData ?? []) { if (!asset.store_id) continue; const a = assetsByStore.get(asset.store_id) ?? []; a.push({ next_service_date: asset.next_service_date }); assetsByStore.set(asset.store_id, a) }
    for (const job of jobData ?? []) { if (!job.store_id) continue; const j = jobsByStore.get(job.store_id) ?? []; j.push({ status: job.status, job_type: job.job_type }); jobsByStore.set(job.store_id, j) }
    return { data: baseStores.map(store => ({ ...store, assets: assetsByStore.get(store.id) ?? [], jobs: jobsByStore.get(store.id) ?? [] })) as Store[], error: null }
  })

  const center: [number, number] = selectedStore?.lat != null && selectedStore?.lng != null ? [selectedStore.lat, selectedStore.lng] : [-40.9006, 174.886]
  const zoom = selectedStore ? 14 : 5.5
  const filteredStores = stores.filter(store => store.name.toLowerCase().includes(searchTerm.toLowerCase()) || store.address?.toLowerCase().includes(searchTerm.toLowerCase()))

  return <DashboardLayout>
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[420px] w-full max-w-full gap-0 overflow-hidden rounded-xl border bg-background shadow-sm sm:h-[calc(100dvh-8rem)]">
      <div className="relative min-w-0 flex-1 overflow-hidden">
        {loading ? <div className="h-full w-full bg-muted animate-pulse" /> : <><StoreMap stores={filteredStores} center={center} zoom={zoom} />{selectedStore && <button onClick={() => setSelectedStore(null)} className="absolute bottom-4 left-4 z-[1000] flex items-center gap-2 rounded-md border bg-white px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-gray-50">Clear Selection</button>}</>}
      </div>
      <div className="hidden h-full w-96 shrink-0 border-l lg:block"><StoreList stores={filteredStores} attentionSourceStores={stores} onStoreClick={setSelectedStore} selectedStoreId={selectedStore?.id} searchTerm={searchTerm} onSearchChange={setSearchTerm} /></div>
    </div>
  </DashboardLayout>
}
