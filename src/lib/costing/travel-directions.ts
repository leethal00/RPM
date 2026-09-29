import type { CostingItem } from "@/types/database"

// Verified against RPM's library product 92e466c8-cf6e-4feb-a8de-34992a09d943:
// its stored name is "Travel & mileage:". clone_costing_item gives copies new
// IDs without retaining the source ID/type (sign_code is also null), so match
// the full legacy name, allowing its optional trailing colon, never substrings.
export function isTravelMileageBom(item: Pick<CostingItem, "name" | "mode"> | null): boolean {
    return item?.mode === "build" && /^travel\s+&\s+mileage\s*:?$/i.test(item.name.trim())
}

export function googleMapsDirectionsUrl(destination: string, origin?: string): string {
    const params = new URLSearchParams({ api: "1", destination: destination.trim(), travelmode: "driving" })
    if (origin?.trim()) params.set("origin", origin.trim())
    return `https://www.google.com/maps/dir/?${params.toString()}`
}
