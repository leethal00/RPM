import type { Store } from "@/types/database"

const normalize = (value: string) => value.toLocaleLowerCase().replace(/['’]/g, "").replace(/\s+/g, " ").trim()

export function matchesMapSiteSearch(store: Store, search: string, customerName?: string): boolean {
    const text = normalize([
        store.name, store.address, store.region, store.clients?.name, customerName,
        ...(store.store_brands ?? []).map(brand => brand.client_brands?.label),
    ].filter(Boolean).join(" "))
    return normalize(search).split(" ").every(term => text.includes(term))
}
