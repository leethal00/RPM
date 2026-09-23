// Build items keep their BOM sell separate from an optional final unit price.
// The existing unit_price column stores the override; zero means use the BOM.
export function effectiveBuildSell(calculatedSell: number, unitPrice: number | null | undefined): number {
    const override = Number(unitPrice ?? 0)
    return override > 0 ? override : calculatedSell
}

export function sellMargin(cost: number, sell: number): number {
    return sell > 0 ? 1 - cost / sell : 0
}
