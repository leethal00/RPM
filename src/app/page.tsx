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
  loading: () => (
    <div className="h-full w-full bg-muted animate-pulse" />
  ),
})

// Load the site information separately from the health data.
// This avoids relying on a large nested Supabase query for all
// assets and jobs across the complete customer portfolio.
const STORE_COLS =
  "id, name, address, region, status, lat, lng, " +
  "location_approximate, site_category, has_drive_thru, manager_name, client_id, " +
  "client:clients(name), site_photos(url, is_primary, created_at), " +
  "store_brands(brand_id, client_brands(*))"

export default function MapPage() {
  const supabase = useMemo(() => createClient(), [])
  const [selectedStore, setSelectedStore] =
    useState<Store | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const { clientId } = useCustomerFilter()

  const { data: stores = [], isLoading: loading } =
    useSupabaseQuery<Store[]>(
      `map-stores-health-${clientId ?? "all"}`,
      async () => {
        // 1. Load the sites themselves.
        let storeQuery = supabase
          .from("stores")
          .select(STORE_COLS)

        if (clientId) {
          storeQuery = storeQuery.eq("client_id", clientId)
        }

        const {
          data: storeData,
          error: storeError,
        } = await storeQuery

        if (storeError) {
          return {
            data: null,
            error: storeError,
          }
        }

        const baseStores = (storeData ?? []) as Store[]

        if (baseStores.length === 0) {
          return {
            data: [],
            error: null,
          }
        }

        const storeIds = baseStores.map((store) => store.id)

        // 2. Load only the asset information required for
        // the traffic-light calculation.
        const {
          data: assetData,
          error: assetError,
        } = await supabase
          .from("assets")
          .select("store_id, next_service_date")
          .in("store_id", storeIds)

        if (assetError) {
          return {
            data: null,
            error: assetError,
          }
        }

        // 3. Load only the job information required for
        // the traffic-light calculation.
        const {
          data: jobData,
          error: jobError,
        } = await supabase
          .from("jobs")
          .select("store_id, status, job_type")
          .in("store_id", storeIds)

        if (jobError) {
          return {
            data: null,
            error: jobError,
          }
        }

        // 4. Join the health information back onto each site.
        const assetsByStore = new Map<string, any[]>()
        const jobsByStore = new Map<string, any[]>()

        for (const asset of assetData ?? []) {
          if (!asset.store_id) continue

          const existing =
            assetsByStore.get(asset.store_id) ?? []

          existing.push({
            next_service_date:
              asset.next_service_date,
          })

          assetsByStore.set(
            asset.store_id,
            existing
          )
        }

        for (const job of jobData ?? []) {
          if (!job.store_id) continue

          const existing =
            jobsByStore.get(job.store_id) ?? []

          existing.push({
            status: job.status,
            job_type: job.job_type,
          })

          jobsByStore.set(
            job.store_id,
            existing
          )
        }

        const storesWithHealth = baseStores.map(
          (store) => ({
            ...store,
            assets:
              assetsByStore.get(store.id) ?? [],
            jobs:
              jobsByStore.get(store.id) ?? [],
          })
        )

        return {
          data: storesWithHealth as Store[],
          error: null,
        }
      }
    )

  const center: [number, number] =
    selectedStore?.lat != null &&
    selectedStore?.lng != null
      ? [selectedStore.lat, selectedStore.lng]
      : [-40.9006, 174.886]

  const zoom = selectedStore ? 14 : 5.5

  const filteredStores = stores.filter(
    (store) =>
      store.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      store.address
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase())
  )

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-8rem)] gap-0 overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="relative flex-1">
          {loading ? (
            <div className="h-full w-full bg-muted animate-pulse" />
          ) : (
            <>
              <StoreMap
                stores={filteredStores}
                center={center}
                zoom={zoom}
              />

              {selectedStore && (
                <button
                  onClick={() =>
                    setSelectedStore(null)
                  }
                  className="absolute bottom-4 left-4 z-[1000] flex items-center gap-2 rounded-md border bg-white px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-gray-50"
                >
                  Clear Selection
                </button>
              )}
            </>
          )}
        </div>

        <div className="hidden h-full w-96 border-l lg:block">
          <StoreList
            stores={filteredStores}
            attentionSourceStores={stores}
            onStoreClick={(store) =>
              setSelectedStore(store)
            }
            selectedStoreId={
              selectedStore?.id
            }
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
          />
        </div>
      </div>
    </DashboardLayout>
  )
}
