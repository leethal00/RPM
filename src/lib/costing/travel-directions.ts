import type { CostingItem } from "@/types/database"

// Product cloning does not retain a source product ID/type. Use the exact
// reusable product name until RPM has a persistent product identity.
export function isTravelMileageBom(item: Pick<CostingItem, "name" | "mode"> | null): boolean {
    return item?.mode === "build" && item.name.trim().replace(/\s+/g, " ").toLowerCase() === "travel & mileage"
}

export function googleMapsDirectionsUrl(destination: string, origin?: string): string {
    const params = new URLSearchParams({ api: "1", destination: destination.trim(), travelmode: "driving" })
    if (origin?.trim()) params.set("origin", origin.trim())
    return `https://www.google.com/maps/dir/?${params.toString()}`
}
