import { effectiveBuildSell } from "@/lib/costing/pricing"

export type InvoiceItem = {
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

export type InvoiceCostLine = {
  item_id: string | null
  qty: number
  unit_cost: number
  markup: number
  unit_sell_override: number | null
}

export type XeroInvoiceLine = {
  Description: string
  Quantity?: number
  UnitAmount?: number
  AccountCode?: string
  TaxType?: string
}

const SECTION_HEADING = "__RPM_SECTION_HEADING__"
const NOTE = "__RPM_NOTE__"

function accountCode(name: string) {
  const normal = name.toLowerCase().replace(/[^a-z0-9]+/g, " ")
  if (normal.includes("travel") || normal.includes("mileage")) return "250"
  if (normal.includes("material")) return "240"
  return "200"
}

function description(item: InvoiceItem) {
  const details = (item.details || "").trim()
  return [
    item.name.trim(),
    "Qty: " + Number(item.mode === "build" && item.build_qty != null ? item.build_qty : item.qty),
    item.size?.trim() ? "Size: " + item.size.trim() : null,
    details ? "Details: " + details : null,
    item.delivery?.trim() || null,
  ].filter(Boolean).join("\n")
}

export function buildXeroInvoiceLines(
  items: InvoiceItem[],
  costingLines: InvoiceCostLine[],
  intro: string,
): XeroInvoiceLine[] {
  const result: XeroInvoiceLine[] = []
  if (intro.trim()) result.push({ Description: intro.trim() })
  let section = 0

  for (const item of items) {
    if (item.sign_code === SECTION_HEADING) {
      section += 1
      result.push({ Description: "--" })
      result.push({ Description: String(section) + ". " + item.name.trim().toUpperCase() })
      continue
    }
    if (item.sign_code === NOTE) {
      result.push({ Description: item.name.trim() })
      continue
    }

    const calculated = costingLines
      .filter((line) => line.item_id === item.id)
      .reduce((sum, line) => {
        const sell = line.unit_sell_override != null
          ? Number(line.unit_sell_override)
          : Number(line.unit_cost || 0) * (1 + Number(line.markup || 0))
        return sum + Number(line.qty || 0) * sell
      }, 0)
    const unitAmount = item.mode === "build"
      ? effectiveBuildSell(calculated, item.unit_price)
      : Number(item.unit_price || 0)
    const quantity = Number(item.qty)
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitAmount) || unitAmount < 0) {
      throw new Error("Fix the quantity or sell price for " + item.name + " before updating Xero.")
    }
    result.push({
      Description: description(item),
      Quantity: quantity,
      UnitAmount: Number(unitAmount.toFixed(2)),
      AccountCode: accountCode(item.name),
      TaxType: "OUTPUT2",
    })
  }

  return result
}

