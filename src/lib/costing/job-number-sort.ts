/** Sort the numeric part of RPM and Xero job numbers (for example, INV-10 after INV-9). */
export function compareJobNumbers(a: string | null | undefined, b: string | null | undefined, direction: "asc" | "desc") {
    const aText = a?.trim() || ""
    const bText = b?.trim() || ""
    const aNumber = aText.match(/\d+/)?.[0]
    const bNumber = bText.match(/\d+/)?.[0]

    // Jobs without a number stay at the end in either direction.
    if (!aNumber) return bNumber ? 1 : aText.localeCompare(bText, undefined, { numeric: true, sensitivity: "base" })
    if (!bNumber) return -1

    const numericComparison = Number(aNumber) - Number(bNumber)
    if (numericComparison) return numericComparison * (direction === "asc" ? 1 : -1)
    return aText.localeCompare(bText, undefined, { numeric: true, sensitivity: "base" }) * (direction === "asc" ? 1 : -1)
}
