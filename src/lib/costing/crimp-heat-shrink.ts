export type HeatShrinkSize = "6.4" | "9.6"

type BomLine = { description: string; qty: number; internal_note?: string | null }

const LENGTH_PER_CRIMP_MM = 50
const CATALOGUE_LENGTH_MM = 1200
const AUTO_NOTE_PREFIX = "RPM automatic crimp heat shrink allowance: "

export function autoHeatShrinkNote(size: HeatShrinkSize) {
    return `${AUTO_NOTE_PREFIX}${size}mm; 50mm per crimp from a 1.2m length`
}

export function autoHeatShrinkSize(line: Pick<BomLine, "internal_note">): HeatShrinkSize | null {
    if (line.internal_note === autoHeatShrinkNote("6.4")) return "6.4"
    if (line.internal_note === autoHeatShrinkNote("9.6")) return "9.6"
    return null
}

export function hasManualHeatShrink(lines: BomLine[], size: HeatShrinkSize) {
    return lines.some((line) => !autoHeatShrinkSize(line)
        && Number(line.qty) > 0
        && /heat\s*shrink/i.test(line.description)
        && line.description.includes(`${size}mm`))
}

export function crimpHeatShrinkAllowance(lines: BomLine[]) {
    const counts: Record<HeatShrinkSize, number> = { "6.4": 0, "9.6": 0 }
    for (const line of lines) {
        if (autoHeatShrinkSize(line)) continue
        const description = line.description.trim()
        const match = description.match(/\bcrimps?\b[^\n]*\b(red|blue|yellow)\b|\b(red|blue|yellow)\b[^\n]*\bcrimps?\b/i)
        const colour = (match?.[1] || match?.[2] || "").toLowerCase()
        if (!colour) continue
        const qty = Number(line.qty)
        if (!Number.isFinite(qty) || qty <= 0) continue
        counts[colour === "yellow" ? "9.6" : "6.4"] += qty
    }
    const catalogueQty = (count: number) => Math.round(count * LENGTH_PER_CRIMP_MM / CATALOGUE_LENGTH_MM * 10000) / 10000
    return { "6.4": catalogueQty(counts["6.4"]), "9.6": catalogueQty(counts["9.6"]) }
}
