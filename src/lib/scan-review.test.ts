import { describe, expect, it } from 'vitest'
import { parseScanReview, scanReviewError, qrJobId, validScanDate } from './scan-review'

describe('scanned card review', () => {
  it('preserves independent dates and employees on labour, travel and materials', () => {
    const review = parseScanReview({ labour: [{ employee: 'Craig', date: '2026-09-22', hours: 0.25 }, { employee: 'Liam', date: '2026-09-24', hours: 0.5 }], travel: [{ employee: 'Craig', date: '2026-09-25', hours: 1 }], materials: [{ date: '2026-09-21', description: 'Aluminium', qty: 1.5 }] })
    expect(review.labour.map(row => [row.employee, row.date, row.hours])).toEqual([['Craig', '2026-09-22', '0.25'], ['Liam', '2026-09-24', '0.5']])
    expect(review.travel[0].date).toBe('2026-09-25')
    expect(review.materials[0].date).toBe('2026-09-21')
    expect(scanReviewError(review)).toBe('')
  })
  it('opens old reviewed cards using their original common employee and date', () => {
    const review = parseScanReview({ employee: 'Craig', date: '2026-09-22', labour: [{ hours: 0.25, type: 'Fab' }], travel_hours: 0.5, travel_notes: 'Delivery', materials: [{ description: 'Angle', qty: 2 }] })
    expect(review.labour[0].employee).toBe('Craig')
    expect(review.travel[0]).toMatchObject({ employee: 'Craig', date: '2026-09-22', hours: '0.5', description: 'Delivery' })
    expect(review.materials[0].date).toBe('2026-09-22')
    expect(scanReviewError(review)).toBe('')
  })
  it('rejects missing row dates, impossible dates, employees and non-finite amounts', () => {
    const review = parseScanReview({ labour: [{ employee: 'Craig', date: '2026-09-22', hours: 1 }, { employee: 'Liam', hours: 1 }], materials: [] })
    expect(scanReviewError(review)).toContain('Labour row 2')
    review.labour[1].date = '2026-02-30'
    expect(scanReviewError(review)).toContain('date')
    review.labour[1].date = '2026-09-24'; review.labour[1].hours = 'Infinity'
    expect(scanReviewError(review)).toContain('hours')
    expect(validScanDate('2028-02-29')).toBe(true)
  })
  it('accepts only job URLs and never treats QR content as a request destination', () => {
    const id = '83c3122f-ac29-40bd-a087-02e1782008a7'
    expect(qrJobId(`https://old-deployment.vercel.app/quoting/${id}/job-card`)).toBe(id)
    expect(qrJobId(`https://rpm.example/quoting/jobs/${id}?tab=time`)).toBe(id)
    expect(qrJobId('javascript:alert(1)')).toBeNull()
    expect(qrJobId(`https://example.com/other/${id}`)).toBeNull()
    expect(qrJobId('INV-7581')).toBeNull()
  })
})
