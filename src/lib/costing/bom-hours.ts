/** Catalogue labour entries without a unit predate unit tracking and use hours. */
export function isHourUnit(unit: string | null | undefined): boolean {
    const normalized = unit?.trim().toLowerCase()
    return !normalized || ["h", "hr", "hrs", "hour", "hours"].includes(normalized)
}

export function totalBomHours(
    lines: Array<{ section: string; qty: number; material_id: string | null }>,
    unitsByMaterialId: Record<string, string | null>,
): number {
    return lines.reduce((hours, line) => {
        if (line.section !== "Labour" || !isHourUnit(line.material_id ? unitsByMaterialId[line.material_id] : null)) return hours
        return hours + Number(line.qty)
    }, 0)
}
