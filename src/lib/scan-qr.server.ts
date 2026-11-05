import jsQR from 'jsqr'
import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas'
import { createRequire } from 'node:module'
import path from 'node:path'
import { qrJobId } from './scan-review'

export async function readScanQr(bytes: Uint8Array, mime: string): Promise<string | null> {
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('This scan is larger than 20 MB. Select the job manually.')
  const jobs = new Set<string>()
  function decode(canvas: Canvas) {
    const ctx = canvas.getContext('2d')
    // The card header is read first so a small QR is not lost among handwriting and tables.
    for (const height of [Math.ceil(canvas.height * 0.35), canvas.height]) {
      const pixels = ctx.getImageData(0, 0, canvas.width, height)
      const code = jsQR(new Uint8ClampedArray(pixels.data), canvas.width, height, { inversionAttempts: 'attemptBoth' })
      const id = code ? qrJobId(code.data) : null
      if (id) jobs.add(id)
    }
  }
  if (mime === 'application/pdf') {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    // A bundled module's import.meta.url can be a numeric webpack module id.
    // Resolve external PDF resources from the application root in both runtimes.
    const pdfRoot = path.dirname(createRequire(path.join(process.cwd(), 'package.json')).resolve('pdfjs-dist/package.json'))
    const task = getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true,
      wasmUrl: path.join(pdfRoot, 'wasm').replaceAll('\\', '/') + '/',
      standardFontDataUrl: path.join(pdfRoot, 'standard_fonts').replaceAll('\\', '/') + '/' })
    try {
      const pdf = await task.promise
      if (pdf.numPages > 10) throw new Error('This PDF has more than 10 pages. Split it into individual job cards or select the job manually.')
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber)
        const size = page.getViewport({ scale: 1 })
        const scale = Math.min(3, Math.sqrt(5_000_000 / (size.width * size.height)))
        const viewport = page.getViewport({ scale })
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
        await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext('2d') as unknown as CanvasRenderingContext2D, viewport }).promise
        decode(canvas)
        page.cleanup()
      }
    } finally { await task.destroy() }
  } else if (['image/jpeg', 'image/png'].includes(mime)) {
    const image = await loadImage(Buffer.from(bytes))
    const scale = Math.min(1, Math.sqrt(5_000_000 / (image.width * image.height)))
    const canvas = createCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)))
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
    decode(canvas)
  } else throw new Error('Choose a PDF, JPG or PNG scan.')
  if (jobs.size > 1) throw new Error('This scan contains different RPM jobs. Split it into one job per file before posting.')
  return [...jobs][0] || null
}
