export type ParsedPriceRecord = {
    code: string
    description: string
    price: string
    __row: string
    __sheet?: string
}

export type PdfPositionedItem = {
    text: string
    x: number
    y: number
}

export type PdfPositionedPage = {
    pageNumber: number
    items: PdfPositionedItem[]
}

type PdfTextContentItem = {
    str?: string
    transform?: number[]
}

type PdfPageData = {
    getTextContent(options?: Record<string, unknown>): Promise<{ items: PdfTextContentItem[] }>
}

type PdfParse = (buffer: Buffer, options?: { pagerender?: (page: PdfPageData) => Promise<string> }) => Promise<{ text?: string }>

type Line = {
    y: number
    cells: Array<{ x: number; text: string }>
}

type Header = {
    x: number
    label: string
}

const CATEGORY_HEADINGS = new Map([
    ["ACRYLIC", "Acrylic"],
    ["ALUMINUM COMPOSITE PANEL", "Aluminum Composite Panel"],
    ["POLYCARBONATE", "Polycarbonate"],
    ["DIGITAL PRINT BOARD", "Digital Print Board"],
    ["INDUSTRIAL PLASTICS", "Industrial Plastics"],
    ["FOOTPATH SIGNS", "Footpath Signs"],
])

const TABLE_HEADINGS = new Map([
    ["GENERAL PURPOSE CAST", "General Purpose Cast"],
    ["SATIN ACRYLIC", "Satin Acrylic"],
    ["MIRROR ACRYLIC", "Mirror Acrylic"],
    ["DAY AND NIGHT", "Day and Night"],
    ["IMPACTED MODIFIED ACRYLIC", "Impacted Modified Acrylic"],
    ["ACCESSORIES", "Accessories"],
    ["SIGNBOND LITE", "SignbonD Lite"],
    ["SIGNBOND PRINT", "SignbonD Print"],
    ["SIGNBOND FABRICATION", "SignbonD Fabrication"],
    ["SIGNBOND FEVE", "SignbonD FEVE"],
    ["SIGNBOND SPECIALTY", "SignbonD Specialty"],
    ["SNOWBOND FOAM PVC CORE (FR)", "Snowbond Foam PVC Core (FR)"],
    ["PANELUX A1 SOLID ALUMINUM PVDF (FR) 15 20 YEAR WARRANTY", "Panelux A1 Solid Aluminum PVDF (FR)"],
    ["GENERAL PURPOSE", "General Purpose"],
    ["ABRASION RESISTANT (AR) SHEET", "Abrasion Resistant (AR) Sheet"],
    ["LAMINATED SHEET", "Laminated Sheet"],
    ["LASERLITE TWINWALL POLYCARBONATE ROOFING", "Laserlite Twinwall Polycarbonate Roofing"],
    ["IMPRABOARD FLUTE", "Impraboard Flute"],
    ["PAKCOR", "Pakcor"],
    ["FOAM PVC PRINT GRADE", "Foam PVC Print Grade"],
    ["M BOARD", "M-Board"],
    ["M PRINT", "M-Print"],
    ["RIGID PVC", "Rigid PVC"],
    ["SIGNEX INTEGRAL FOAM PVC", "Signex Integral Foam PVC"],
    ["CONSTRUCTABOARD INTEGRAL FOAM PVC", "Constructaboard Integral Foam PVC"],
    ["VIPET PETG", "Vipet PETG"],
    ["ACRYLIC CAPPED ABS", "Acrylic Capped ABS"],
    ["BLACK PINSEAL ABS", "Black Pinseal ABS"],
    ["POLYPROPYLENE RIGID SHEET", "Polypropylene Rigid Sheet"],
    ["FOOTPATH SIGNS BASES", "Footpath Signs - Bases"],
    ["FOOTPATH SIGNS BASE INSERTS", "Footpath Signs - Base Inserts"],
])

const SUBTABLE_HEADINGS = new Set(["adhesives", "fabrication", "cleaner", "joiners", "tapes"])
const ATTRIBUTE_HEADERS = new Set(["colour", "color", "finish", "gauge", "skin", "product", "size", "length", "length mm", "width", "width mm"])

function key(value: string) {
    return value.toUpperCase().replace(/[^A-Z0-9()]+/g, " ").replace(/\s+/g, " ").trim()
}

function cleanText(value: string) {
    return value.replace(/\s+/g, " ").trim()
}

function cleanMoney(value: string) {
    const compact = value.replace(/\s+/g, "")
    const match = compact.match(/^\$([0-9][0-9,]*(?:\.[0-9]{1,4})?)$/)
    return match?.[1] ?? null
}

function groupLines(items: PdfPositionedItem[]) {
    const lines: Line[] = []
    for (const item of items.filter((candidate) => cleanText(candidate.text))) {
        let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 0.8)
        if (!line) {
            line = { y: item.y, cells: [] }
            lines.push(line)
        }
        line.cells.push({ x: item.x, text: cleanText(item.text) })
    }
    for (const line of lines) line.cells.sort((a, b) => a.x - b.x)
    return lines.sort((a, b) => b.y - a.y)
}

function nearestHeaderIndex(x: number, headers: Header[]) {
    let best = 0
    let distance = Number.POSITIVE_INFINITY
    headers.forEach((header, index) => {
        const nextDistance = Math.abs(header.x - x)
        if (nextDistance < distance) {
            best = index
            distance = nextDistance
        }
    })
    return best
}

function headerShape(cells: Line["cells"]) {
    if (cells.length === 0) return null
    const labels = cells.map((cell) => cleanText(cell.text))
    const normalised = labels.map((label) => label.toLowerCase().replace(/[()]/g, "").replace(/\s+/g, " ").trim())
    let attributeCount = 0
    while (attributeCount < normalised.length && ATTRIBUTE_HEADERS.has(normalised[attributeCount])) attributeCount += 1

    if (attributeCount === 0 && SUBTABLE_HEADINGS.has(normalised[0]) && cells.length > 1) attributeCount = 1
    if (attributeCount === 0) return null

    return {
        headers: cells.map((cell, index) => ({ x: cell.x, label: index === 0 && SUBTABLE_HEADINGS.has(normalised[0]) ? "Product" : labels[index] })),
        attributeCount,
        subtable: SUBTABLE_HEADINGS.has(normalised[0]) ? labels[0] : "",
    }
}

function describeRecord(category: string, table: string, subtable: string, attributes: string[], headers: Header[], attributeCount: number, priceHeader: string) {
    const parts = [category, table, subtable].filter(Boolean)
    for (let index = 0; index < attributeCount; index += 1) {
        const value = attributes[index]
        if (!value) continue
        const label = headers[index]?.label || "Detail"
        parts.push(`${label}: ${value}`)
    }
    if (priceHeader) parts.push(priceHeader)
    return parts.filter((value, index, list) => value && list.indexOf(value) === index).join(" | ")
}

export function parseMulfordPages(pages: PdfPositionedPage[]) {
    const records: ParsedPriceRecord[] = []
    let category = ""

    for (const page of pages) {
        if (page.pageNumber < 3) continue
        const lines = groupLines(page.items).filter((line) => line.y > 55 && line.y < 790)
        let table = ""
        let subtable = ""
        let headers: Header[] = []
        let attributeCount = 0
        let inherited: string[] = []
        let pending: string[] = []
        let lastPricedY: number | null = null
        let lastRecordIndexes: number[] = []

        for (const line of lines) {
            const lineText = cleanText(line.cells.map((cell) => cell.text).join(" "))
            const headingKey = key(lineText)
            const categoryHeading = CATEGORY_HEADINGS.get(headingKey)
            if (categoryHeading) {
                category = categoryHeading
                continue
            }

            const tableHeading = TABLE_HEADINGS.get(headingKey)
            if (tableHeading) {
                table = tableHeading
                subtable = ""
                headers = []
                attributeCount = 0
                inherited = []
                pending = []
                lastPricedY = null
                lastRecordIndexes = []
                continue
            }

            if (/^(?:10 YEAR WARRANTY|\*|PRICES EFFECTIVE|NOT ALL ITEMS|GLOSS RED,|DEEP BLUE,|THINNER GAUGES)/i.test(lineText)) continue

            const shape = headerShape(line.cells)
            if (shape) {
                headers = shape.headers
                attributeCount = shape.attributeCount
                if (shape.subtable) subtable = shape.subtable
                inherited = []
                pending = []
                lastPricedY = null
                lastRecordIndexes = []
                continue
            }

            const moneyCells = line.cells.map((cell) => ({ ...cell, price: cleanMoney(cell.text) })).filter((cell) => cell.price)
            if (moneyCells.length === 0) {
                if (headers.length > 0 && line.cells.every((cell) => !/^POA$/i.test(cell.text))) {
                    const isWrappedContinuation = lastPricedY != null && Math.abs(lastPricedY - line.y) <= 6 && lastRecordIndexes.length > 0
                    for (const cell of line.cells) {
                        const index = nearestHeaderIndex(cell.x, headers)
                        if (index >= attributeCount) continue
                        if (isWrappedContinuation) {
                            const label = headers[index]?.label || "Detail"
                            for (const recordIndex of lastRecordIndexes) {
                                const pattern = new RegExp(`(${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*[^|]+)`)
                                records[recordIndex].description = records[recordIndex].description
                                    .replace(pattern, (value) => cleanText(`${value} ${cell.text}`))
                                    .replace(/\s*\|\s*/g, " | ")
                            }
                            inherited[index] = cleanText([inherited[index], cell.text].filter(Boolean).join(" "))
                        } else {
                            pending[index] = cleanText([pending[index], cell.text].filter(Boolean).join(" "))
                        }
                    }
                }
                continue
            }

            // Some small accessory tables have no explicit price heading. Preserve the
            // visible row label and use an "Each" price dimension instead of dropping it.
            if (headers.length === 0) {
                const nonMoney = line.cells.filter((cell) => !cleanMoney(cell.text)).map((cell) => cell.text).join(" ")
                if (!nonMoney || !table) continue
                for (const money of moneyCells) {
                    records.push({
                        code: "",
                        description: [category, table, subtable, nonMoney, "Each"].filter(Boolean).join(" | "),
                        price: money.price as string,
                        __row: String(records.length + 1),
                        __sheet: `Page ${page.pageNumber}`,
                    })
                }
                continue
            }

            const rowValues: string[] = []
            for (const cell of line.cells.filter((candidate) => !cleanMoney(candidate.text) && !/^POA$/i.test(candidate.text))) {
                const index = nearestHeaderIndex(cell.x, headers)
                if (index < attributeCount) rowValues[index] = cleanText([pending[index], cell.text].filter(Boolean).join(" "))
            }

            const attributes = Array.from({ length: attributeCount }, (_, index) => rowValues[index] || pending[index] || inherited[index] || "")
            attributes.forEach((value, index) => { if (value) inherited[index] = value })
            pending = []
            lastRecordIndexes = []

            for (const money of moneyCells) {
                const priceColumn = nearestHeaderIndex(money.x, headers)
                const priceHeader = priceColumn >= attributeCount ? headers[priceColumn]?.label ?? "Each" : "Each"
                lastRecordIndexes.push(records.length)
                records.push({
                    code: "",
                    description: describeRecord(category, table, subtable, attributes, headers, attributeCount, priceHeader),
                    price: money.price as string,
                    __row: String(records.length + 1),
                    __sheet: `Page ${page.pageNumber}`,
                })
            }
            lastPricedY = line.y
        }
    }

    return records
}

export async function parseMulfordPdf(buffer: Buffer, pdfParse: PdfParse) {
    const pages: PdfPositionedPage[] = []
    let pageNumber = 0
    const parsed = await pdfParse(buffer, {
        pagerender: async (pageData) => {
            pageNumber += 1
            const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
            const items = content.items.map((item) => ({
                text: item.str ?? "",
                x: Number(item.transform?.[4] ?? 0),
                y: Number(item.transform?.[5] ?? 0),
            }))
            pages.push({ pageNumber, items })
            return items.map((item) => item.text).join(" ")
        },
    })

    const documentText = pages.flatMap((page) => page.items.map((item) => item.text)).join(" ") || parsed.text || ""
    // Keep this importer reusable for later Mulford price lists that retain the
    // same table layout; the effective date is read from the document itself.
    if (!/\bMULFORD\b/i.test(documentText) || !/\bPRICELIST\b/i.test(documentText)) return null
    return parseMulfordPages(pages)
}
