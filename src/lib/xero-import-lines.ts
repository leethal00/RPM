export type XeroImportLine = {
  LineItemID?: string | null
  ItemCode?: string | null
  Description?: string | null
  Quantity?: number | null
  UnitAmount?: number | null
  LineAmount?: number | null
}

export function itemFromXeroLine(line: XeroImportLine, index: number) {
  const description = String(line.Description || "").trim()
  const parts = description.split(/\r?\n/).map((part) => part.trim()).filter(Boolean)
  const firstLine = parts[0] || ""
  const itemCode = String(line.ItemCode || "").trim()
  const name = itemCode || firstLine.replace(/[:\s]+$/, "") || `Invoice line ${index + 1}`
  const details = itemCode ? description : parts.slice(1).join("\n")

  return {
    name: name.slice(0, 200),
    details: details || null,
    mode: "simple",
    qty: line.Quantity == null ? 1 : Number(line.Quantity),
    unit_cost: 0,
    unit_price: Number(line.UnitAmount || 0),
    xero_imported_line: true,
    xero_line_item_id: line.LineItemID || null,
    xero_line_amount: line.LineAmount == null ? null : Number(line.LineAmount),
    xero_unit_amount: line.UnitAmount == null ? null : Number(line.UnitAmount),
    sort: index,
  }
}
