import { describe, expect, it } from "vitest"
import { buildXeroInvoiceLines } from "./xero-invoice-lines"

describe("buildXeroInvoiceLines", () => {
  it("sends selling prices and descriptions, excluding internal BOM costs", () => {
    const lines = buildXeroInvoiceLines([
      { id: "heading", name: "Exterior", sign_code: "__RPM_SECTION_HEADING__", qty: 1 },
      { id: "sign", name: "Illuminated sign", mode: "build", qty: 2, build_qty: 1, unit_price: 0, internal_notes: "Private fabrication instructions" },
      { id: "note", name: "Install by Friday", sign_code: "__RPM_NOTE__", qty: 1 },
    ], [
      { item_id: "sign", qty: 3, unit_cost: 100, markup: 0.5, unit_sell_override: null },
    ], "Customer site")

    expect(lines).toEqual([
      { Description: "Customer site" },
      { Description: "--" },
      { Description: "1. EXTERIOR" },
      { Description: "Illuminated sign\nQty: 1", Quantity: 2, UnitAmount: 450, AccountCode: "200", TaxType: "OUTPUT2" },
      { Description: "Install by Friday" },
    ])
    expect(JSON.stringify(lines)).not.toContain("InvoiceNumber")
    expect(JSON.stringify(lines)).not.toContain("unit_cost")
    expect(JSON.stringify(lines)).not.toContain("Private fabrication instructions")
  })

  it("refuses invalid quantities before an invoice can be changed", () => {
    expect(() => buildXeroInvoiceLines([
      { id: "sign", name: "Sign", qty: 0, unit_price: 100 },
    ], [], "")).toThrow("Fix the quantity")
  })
})
