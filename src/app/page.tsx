"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import DashboardLayout from "@/components/dashboard-layout"
import { StoreList } from "@/components/store-list"
import { createClient } from "@/lib/supabase/client"

const StoreMap = dynamic(() => import("@/components/store-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-muted animate-pulse" />
})

interface Store {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  status: string
  region: string
  client?: {
    name: string
  }
  site_photos?: {
    url: string
  }[]
}

export default function MapPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const supabase = createClient()

  useEffect(() => {
    async function fetchStores() {
      const { data, error } = await supabase
        .from('stores')
        .select('*, client:clients(name), site_photos(url)')

      if (!error && data) {
        setStores(data as any)
      }
      setLoading(false)
    }

    fetchStores()
  }, [supabase])

  const center: [number, number] = selectedStore
    ? [selectedStore.lat, selectedStore.lng]
    : [-40.9006, 174.8860]

  const zoom = selectedStore ? 14 : 5.5

  const filteredStores = stores.filter(store =>
    store.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    store.address.toLowerCase().includes(searchTerm.toLowerCase())
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
