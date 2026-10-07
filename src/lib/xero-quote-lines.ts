import { effectiveBuildSell } from "@/lib/costing/pricing"

export type QuoteItem = {
    id: string
    name: string
    size?: string | null
    details?: string | null
    delivery?: string | null
    sign_code?: string | null
    mode?: string | null
    qty: number
    build_qty?: number | null
    unit_price?: number | null
}

export type QuoteCostLine = {
    item_id: string | null
    qty: number
    unit_cost: number
    markup: number
    unit_sell_override: number | null
}

export type QuoteLine = {
    Description: string
    Quantity?: number
    UnitAmount?: number
    AccountCode?: string
    TaxType?: string
}

function cleanItemDetails(name: string, details?: string | null) {
    const raw = (details || "").trim()
    if (!raw) return ""
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    return raw.replace(new RegExp(`^${escaped}\\s*[:—-]?\\s*`, "i"), "").trim()
}

function quoteItemDescription(item: QuoteItem) {
    const details = cleanItemDetails(item.name, item.details)
    return [
        item.name,
        `Qty: ${Number(item.mode === "build" && item.build_qty != null ? item.build_qty : (item.qty || 1))}`,
        item.size?.trim() ? `Size: ${item.size.trim()}` : null,
        details ? `Details: ${details}` : null,
        item.delivery?.trim() || null,
    ].filter(Boolean).join("\n")
}

function accountCodeForItem(name: string) {
    const normal = name.toLowerCase().replace(/[^a-z0-9]+/g, " ")
    if (normal.includes("travel") || normal.includes("mileage")) return "250"
    if (normal.includes("material")) return "240"
    return "200"
}

export function buildXeroQuoteLines(job: { title: string; details?: string | null; contact_name?: string | null }, items: QuoteItem[], costingLines: QuoteCostLine[]): QuoteLine[] {
    const intro = [
        job.title.trim(),
        job.details?.trim(),
        job.contact_name?.trim() ? `Contact: ${job.contact_name.trim()}` : null,
    ].filter(Boolean).join("\n")
    const result: QuoteLine[] = [{ Description: intro }]
    let sectionNumber = 0
    for (const item of items) {
        if (item.sign_code === "__RPM_SECTION_HEADING__") {
            sectionNumber += 1
            result.push({ Description: "--" }, { Description: `${sectionNumber}. ${(item.name || "SECTION").trim().toUpperCase()}` })
            continue
        }
        if (item.sign_code === "__RPM_NOTE__") {
            result.push({ Description: (item.name || "").trim() })
            continue
        }
        let unitAmount = Number(item.unit_price || 0)
        if (item.mode === "build") {
            const calculated = costingLines.filter((line) => line.item_id === item.id).reduce((sum, line) => {
                const sell = line.unit_sell_override != null ? Number(line.unit_sell_override) : Number(line.unit_cost || 0) * (1 + Number(line.markup || 0))
                return sum + Number(line.qty || 0) * sell
            }, 0)
            unitAmount = effectiveBuildSell(calculated, item.unit_price)
        }
        result.push({
            Description: quoteItemDescription(item),
            Quantity: Number(item.qty || 1),
            UnitAmount: Number(unitAmount.toFixed(2)),
            AccountCode: accountCodeForItem(item.name),
            TaxType: "OUTPUT2",
        })
    }
    return result
}
