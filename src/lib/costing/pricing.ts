// Build items keep their BOM sell separate from an optional final unit price.
// The existing unit_price column stores the override; zero means use the BOM.
export function effectiveBuildSell(calculatedSell: number, unitPrice: number | null | undefined): number {
    const override = Number(unitPrice ?? 0)
    return override > 0 ? override : calculatedSell
}

export function sellMargin(cost: number, sell: number): number {
    return sell > 0 ? 1 - cost / sell : 0
}

export function bomTotals(lines: Array<{
    qty: number
    unit_cost: number
    markup: number
    unit_sell_override: number | null
}>): { cost: number; sell: number; margin: number } {
    const { cost, sell } = lines.reduce((totals, line) => {
        const qty = Number(line.qty)
        const unitCost = Number(line.unit_cost)
        const unitSell = line.unit_sell_override != null
            ? Number(line.unit_sell_override)
            : unitCost * (1 + Number(line.markup))
        totals.cost += qty * unitCost
        totals.sell += qty * unitSell
        return totals
    }, { cost: 0, sell: 0 })
    return { cost, sell, margin: sellMargin(cost, sell) }
}
