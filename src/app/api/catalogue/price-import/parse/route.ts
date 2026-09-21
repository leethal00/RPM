import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import pdfParse from "pdf-parse"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ParsedRecord = {
    code: string
    description: string
    price: string
    __row: string
    __sheet?: string
}

const CODE_HEADERS = ["product code", "item code", "stock code", "code", "sku", "part number", "part no"]
const DESCRIPTION_HEADERS = ["description", "product description", "product", "item", "name"]
const PRICE_HEADERS = ["eac price", "unit cost", "cost", "net price", "price", "trade price", "your price", "nett", "net"]

function normaliseHeader(value: unknown) {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
}

function headerIndex(row: unknown[], aliases: string[]) {
    const normalised = row.map(normaliseHeader)
    for (let i = 0; i < normalised.length; i += 1) {
        const value = normalised[i]
        if (!value) continue
        if (aliases.includes(value)) return i
    }
    for (let i = 0; i < normalised.length; i += 1) {
        const value = normalised[i]
        if (!value) continue
        if (aliases.some((alias) => value.includes(alias))) return i
    }
    return -1
}

function parseWorkbook(buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: "buffer", raw: false })
    const records: ParsedRecord[] = []

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName]
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            raw: false,
            defval: "",
            blankrows: false,
        })

        let headerRow = -1
        let codeCol = -1
        let descriptionCol = -1
        let priceCol = -1
        let bestScore = -1

        for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 80); rowIndex += 1) {
            const row = matrix[rowIndex] || []
            const candidateCode = headerIndex(row, CODE_HEADERS)
            const candidateDescription = headerIndex(row, DESCRIPTION_HEADERS)
            const candidatePrice = headerIndex(row, PRICE_HEADERS)
            const score = Number(candidateCode >= 0) + Number(candidateDescription >= 0) + (candidatePrice >= 0 ? 2 : 0)

            if (candidatePrice >= 0 && (candidateCode >= 0 || candidateDescription >= 0) && score > bestScore) {
                bestScore = score
                headerRow = rowIndex
                codeCol = candidateCode
                descriptionCol = candidateDescription
                priceCol = candidatePrice
            }
        }

        if (headerRow < 0 || priceCol < 0) continue

        for (let rowIndex = headerRow + 1; rowIndex < matrix.length; rowIndex += 1) {
            const row = matrix[rowIndex] || []
            const code = codeCol >= 0 ? String(row[codeCol] ?? "").trim() : ""
            const description = descriptionCol >= 0 ? String(row[descriptionCol] ?? "").trim() : ""
            const price = String(row[priceCol] ?? "").trim()
            if ((!code && !description) || !price) continue
            records.push({
                code,
                description,
                price,
                __row: String(rowIndex + 1),
                __sheet: sheetName,
            })
        }
    }

    return records
}

function parsePdfText(text: string) {
    const records: ParsedRecord[] = []
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean)

    const moneyAtEnd = /(?:\$|NZ\$)?\s*([0-9][0-9,]*(?:\.[0-9]{1,4})?)\s*$/
    const codeAndDescription = /^([A-Za-z0-9][A-Za-z0-9+._\/-]{2,})\s+(.+)$/

    lines.forEach((line, index) => {
        const money = line.match(moneyAtEnd)
        if (!money || money.index == null) return

        const prefix = line.slice(0, money.index).trim()
        if (!prefix) return

        let code = ""
        let description = prefix
        const coded = prefix.match(codeAndDescription)
        if (coded) {
            code = coded[1].trim()
            description = coded[2].trim()
        }

        // Ignore obvious headers/totals.
        const lowered = description.toLowerCase()
        if (lowered === "price" || lowered.includes("total") || lowered.includes("subtotal")) return

        records.push({
            code,
            description,
            price: money[1],
            __row: String(index + 1),
        })
    })

    return records
}

export async function POST(request: NextRequest) {
    try {
        const form = await request.formData()
        const file = form.get("file")
        if (!(file instanceof File)) {
            return NextResponse.json({ error: "No price-list file was supplied." }, { status: 400 })
        }

        if (file.size > 15 * 1024 * 1024) {
            return NextResponse.json({ error: "Price-list files are limited to 15 MB." }, { status: 413 })
        }

        const lower = file.name.toLowerCase()
        const buffer = Buffer.from(await file.arrayBuffer())

        if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
            const records = parseWorkbook(buffer)
            if (records.length === 0) {
                return NextResponse.json({
                    error: "No usable price table was found in the workbook. RPM looks for a price column plus a product code or description column.",
                }, { status: 422 })
            }
            return NextResponse.json({ format: "excel", records })
        }

        if (lower.endsWith(".pdf")) {
            const parsed = await pdfParse(buffer)
            const records = parsePdfText(parsed.text || "")
            if (records.length === 0) {
                return NextResponse.json({
                    error: "No usable price rows were extracted from this PDF. It may be a scanned/image PDF or use a table layout that needs a supplier-specific parser.",
                }, { status: 422 })
            }
            return NextResponse.json({
                format: "pdf",
                records,
                warning: "PDF prices are extracted from document text and must be reviewed before applying.",
            })
        }

        return NextResponse.json({ error: "Upload a CSV, Excel (.xlsx/.xls) or PDF price list." }, { status: 415 })
    } catch (error) {
        console.error("price list parse", error)
        return NextResponse.json({
            error: error instanceof Error ? error.message : "Could not parse supplier price list.",
        }, { status: 500 })
    }
}
