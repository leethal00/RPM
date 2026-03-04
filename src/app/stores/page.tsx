"use client"

import { useEffect, useState } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Building2, MapPin, ChevronRight } from "lucide-react"
import Link from "next/link"

export default function StoresListPage() {
    const [stores, setStores] = useState<any[]>([])
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        async function fetchStores() {
            const { data } = await supabase
                .from('stores')
                .select('*')
                .order('name')
            setStores(data || [])
            setLoading(false)
        }
        fetchStores()
    }, [supabase])

    const filteredStores = stores.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.address?.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8 py-6 max-w-5xl mx-auto font-primary">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Sites Portfolio</h1>
                    <p className="text-muted-foreground mt-1 text-sm italic">
                        Full list of managed properties and their current status.
                    </p>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        placeholder="Search sites by name or address..."
                        className="pl-10 h-12 bg-muted/30 border-none shadow-inner"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {loading ? (
                        [...Array(4)].map((_, i) => (
                            <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
                        ))
                    ) : (
                        filteredStores.map((store) => (
                            <Link key={store.id} href={`/stores/${store.id}`}>
                                <Card className="hover:border-primary/50 transition-all cursor-pointer group">
                                    <CardContent className="p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                <Building2 className="size-6" />
                                            </div>
                                            <div className="space-y-1">
                                                <p className="font-bold text-lg group-hover:text-primary transition-colors">{store.name}</p>
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <MapPin className="size-3" />
                                                    {store.address || "No address listed"}
                                                </div>
                                            </div>
                                        </div>
                                        <ChevronRight className="size-5 text-muted-foreground group-hover:text-primary transition-colors group-hover:translate-x-1 duration-200" />
                                    </CardContent>
                                </Card>
                            </Link>
                        ))
                    )}
                </div>
            </div>
        </DashboardLayout>
    )
}
