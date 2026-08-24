"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import DashboardLayout from "@/components/dashboard-layout"
import { StoreList } from "@/components/store-list"
import { createClient } from "@/lib/supabase/client"
import { useSupabaseQuery } from "@/lib/hooks/use-supabase-query"
import type { Store } from "@/types/database"
import { useCustomerFilter } from "@/lib/customer-filter"

const StoreMap = dynamic(() => import("@/components/store-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-muted animate-pulse" />
})

// Only the columns the map + sidebar list actually read. ~70% smaller payload
// than select('*') — and faster initial paint.
// `assets(next_service_date)` and `jobs(status, job_type)` power the
// traffic-light marker colour — see computeTrafficLight in health-score.ts.
const STORE_COLS = "id, name, address, region, status, lat, lng, " +
  "location_approximate, site_category, has_drive_thru, manager_name, " +
  "client:clients(name), site_photos(url, is_primary, created_at), store_brands(brand_id, client_brands(*)), " +
  "assets(next_service_date), jobs(status, job_type)"

export default function MapPage() {
  const supabase = useMemo(() => createClient(), [])
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const { clientId } = useCustomerFilter()

  const { data: stores = [], isLoading: loading } = useSupabaseQuery<Store[]>(
    `map-stores-${clientId ?? 'all'}`,
    async () => {
      let query = supabase.from('stores').select(STORE_COLS)
      if (clientId) query = query.eq('client_id', clientId)
      const { data, error } = await query
      return { data: data as Store[] | null, error }
    }
  )

  const center: [number, number] = selectedStore?.lat != null && selectedStore?.lng != null
    ? [selectedStore.lat, selectedStore.lng]
    : [-40.9006, 174.8860]

  const zoom = selectedStore ? 14 : 5.5

  const filteredStores = stores.filter(store =>
    store.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    store.address?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-8rem)] gap-0 overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="flex-1 relative">
          {loading ? (
            <div className="h-full w-full bg-muted animate-pulse" />
          ) : (
            <>
              <StoreMap stores={filteredStores} center={center} zoom={zoom} />
              {selectedStore && (
                <button
                  onClick={() => setSelectedStore(null)}
                  className="absolute bottom-4 left-4 z-[1000] bg-white px-3 py-1.5 rounded-md border shadow-sm text-xs font-medium hover:bg-gray-50 flex items-center gap-2"
                >
                  Clear Selection
                </button>
              )}
            </>
          )}
        </div>
        <div className="w-96 h-full hidden lg:block border-l">
          <StoreList
            stores={filteredStores}
            onStoreClick={(store) => setSelectedStore(store)}
            selectedStoreId={selectedStore?.id}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
          />
        </div>
      </div>
    </DashboardLayout>
  )
}
