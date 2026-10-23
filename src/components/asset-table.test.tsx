import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { Asset } from "@/types/database"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }))
import { AssetTable } from "./asset-table"

describe("site asset quantities", () => {
    it("shows quantity 1 for old assets and sorts quantities numerically", () => {
        const assets = [
            { id: "a", asset_types: { label: "Arch" }, quantity: 10 },
            { id: "b", asset_types: { label: "Board" }, quantity: 2 },
            { id: "c", asset_types: { label: "Canopy" } },
        ] as Asset[]
        render(<AssetTable assets={assets} storeId="site-1" />)
        const labels = () => screen.getAllByRole("row").slice(1).map(row => within(row).getAllByRole("cell").slice(1, 3).map(cell => cell.textContent))
        expect(labels()).toEqual([["Arch", "10"], ["Board", "2"], ["Canopy", "1"]])
        fireEvent.click(screen.getByRole("button", { name: "Sort by Qty" }))
        expect(labels()).toEqual([["Canopy", "1"], ["Board", "2"], ["Arch", "10"]])
        fireEvent.click(screen.getByRole("button", { name: "Sort by Qty" }))
        expect(labels()).toEqual([["Arch", "10"], ["Board", "2"], ["Canopy", "1"]])
    })
})
