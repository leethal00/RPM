// @vitest-environment node
import { describe, expect, it } from 'vitest'
import QRCode from 'qrcode'
import { PDFDocument } from 'pdf-lib'
import { readScanQr } from './scan-qr.server'

const job = '83c3122f-ac29-40bd-a087-02e1782008a7'
async function cardPdf(ids: string[]) {
  const pdf = await PDFDocument.create()
  for (const id of ids) {
    const page = pdf.addPage([595, 842])
    const png = await QRCode.toBuffer(`https://rpm-git-stu-dev-leethal00s-projects.vercel.app/quoting/${id}/job-card`, { width: 300, margin: 4 })
    const image = await pdf.embedPng(png)
    page.drawImage(image, { x: 440, y: 735, width: 65, height: 65 })
  }
  return pdf.save()
}
describe('QR reading from job-card originals', () => {
  it('reads a small header QR from a PDF and from an image', async () => {
    expect(await readScanQr(await cardPdf([job]), 'application/pdf')).toBe(job)
    const png = await QRCode.toBuffer(`https://rpm.example/quoting/${job}/job-card`, { width: 300 })
    expect(await readScanQr(new Uint8Array(png), 'image/png')).toBe(job)
  }, 30000)
  it('reads all pages and rejects cards for different jobs in one file', async () => {
    expect(await readScanQr(await cardPdf([job, job]), 'application/pdf')).toBe(job)
    await expect(readScanQr(await cardPdf([job, '11111111-1111-1111-1111-111111111111']), 'application/pdf')).rejects.toThrow('different RPM jobs')
  }, 30000)
  it('returns no match for a non-RPM QR', async () => {
    const png = await QRCode.toBuffer('https://example.com/unrelated', { width: 250 })
    expect(await readScanQr(new Uint8Array(png), 'image/png')).toBeNull()
  })
})
