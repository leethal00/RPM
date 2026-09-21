declare module "pdf-parse" {
    type PdfParseResult = {
        text: string
        numpages?: number
        info?: unknown
        metadata?: unknown
        version?: string
    }

    type PdfParse = (dataBuffer: Buffer | Uint8Array, options?: Record<string, unknown>) => Promise<PdfParseResult>

    const pdfParse: PdfParse
    export default pdfParse
}
