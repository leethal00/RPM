"use client"

import Image from "next/image"
import type { ClientBrand } from "@/types/database"

interface BrandChipProps {
    brand: ClientBrand
    size?: "sm" | "md" | "lg"
    showLabel?: boolean
}

const SIZES = {
    sm: { box: "h-8 w-8", img: 24, padding: "p-0.5", text: "text-[8px]" },
    md: { box: "h-10 w-10", img: 32, padding: "p-1", text: "text-[10px]" },
    lg: { box: "h-14 w-14", img: 48, padding: "p-1", text: "text-xs" },
} as const

/**
 * Renders one brand as a chip. Logo if logo_url is present, otherwise a
 * styled text pill with the brand label. Brands without logos are still
 * recognisable and don't break layout.
 */
export function BrandChip({ brand, size = "md", showLabel = false }: BrandChipProps) {
    const s = SIZES[size]
    const hasLogo = Boolean(brand.logo_url)

    if (hasLogo) {
        return (
            <div
                className={`${s.box} rounded-xl bg-white ${s.padding} border-2 shadow-sm flex items-center justify-center`}
                title={brand.label}
            >
                <Image
                    src={brand.logo_url!}
                    alt={brand.label}
                    width={s.img}
                    height={s.img}
                    className="h-full w-full object-contain"
                />
            </div>
        )
    }

    // Text fallback — color from brand.color, or a sensible default
    const bgColor = brand.color ?? "#2D6A4F"
    return (
        <div
            className={`${s.box} rounded-xl ${s.padding} border-2 shadow-sm flex items-center justify-center ${s.text} font-black uppercase tracking-tight text-white`}
            style={{ backgroundColor: bgColor }}
            title={brand.label}
        >
            <span className="text-center leading-none break-all line-clamp-2">
                {showLabel ? brand.label : brand.label.slice(0, 3)}
            </span>
        </div>
    )
}

/**
 * Renders a row of BrandChips for a store's brands. Used in lists, maps, etc.
 * Accepts the joined `store_brands` shape returned by Supabase select queries.
 */
interface BrandChipsProps {
    brands: ClientBrand[]
    size?: "sm" | "md" | "lg"
    showLabel?: boolean
    className?: string
}

export function BrandChips({ brands, size = "md", showLabel = false, className = "" }: BrandChipsProps) {
    if (!brands || brands.length === 0) return null
    return (
        <div className={`flex items-center gap-1 ${className}`}>
            {brands.map((b) => (
                <BrandChip key={b.id} brand={b} size={size} showLabel={showLabel} />
            ))}
        </div>
    )
}

/**
 * Helper: given a Store row with the `store_brands` join, return the
 * brands array sorted by display_order. Hides the join-table shape from
 * consumers.
 */
export function brandsFromStore(store: { store_brands?: { client_brands?: ClientBrand | null }[] | null }): ClientBrand[] {
    if (!store.store_brands) return []
    return store.store_brands
        .map((sb) => sb.client_brands)
        .filter((b): b is ClientBrand => b != null)
        .sort((a, b) => a.display_order - b.display_order)
}
