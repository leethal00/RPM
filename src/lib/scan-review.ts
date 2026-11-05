export type ScanLabour = { employee: string; date: string; hours: string; type: string; description: string }
export type ScanMaterial = { date: string; description: string; qty: string; unit: string; cost: string }
export type ScanReview = { version: 2; labour: ScanLabour[]; travel: ScanLabour[]; materials: ScanMaterial[]; notes: string }
const text = (v: unknown) => typeof v === 'string' || typeof v === 'number' ? String(v) : ''
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const rows = (v: unknown) => Array.isArray(v) ? v.map(object) : []
export const emptyScanReview = (): ScanReview => ({ version: 2, labour: [], travel: [], materials: [], notes: '' })
export function parseScanReview(input: unknown): ScanReview {
  const value = object(input)
  const employee = text(value.employee || value.person_name)
  const date = text(value.date || value.work_date).slice(0, 10)
  const labour = (row: Record<string, unknown>, travel = false): ScanLabour => ({
    employee: text(row.employee || row.person_name) || employee,
    date: text(row.date || row.work_date).slice(0, 10) || date,
    hours: text(row.hours), type: travel ? 'Travel' : text(row.type || row.labour_type) || 'Workshop', description: text(row.description),
  })
  return { version: 2, labour: rows(value.labour).map(row => labour(row)),
    travel: Array.isArray(value.travel) ? rows(value.travel).map(row => labour(row, true))
      : Number(value.travel_hours) > 0 ? [labour({ hours: value.travel_hours, description: value.travel_notes }, true)] : [],
    materials: rows(value.materials).map(row => ({ date: text(row.date || row.order_date).slice(0, 10) || date, description: text(row.description), qty: text(row.qty), unit: text(row.unit), cost: text(row.cost) })), notes: text(value.notes) }
}
export function validScanDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}
export function scanReviewError(review: ScanReview): string {
  if (!review.labour.length && !review.travel.length && !review.materials.length) return 'Add labour, travel or materials before posting.'
  for (const [name, items] of [['Labour', review.labour], ['Travel', review.travel]] as const) {
    for (const [index, row] of items.entries()) {
      const label = `${name} row ${index + 1}`
      if (!validScanDate(row.date)) return `${label}: enter a valid work date.`
      if (!row.employee.trim()) return `${label}: enter an employee.`
      if (!Number.isFinite(Number(row.hours)) || Number(row.hours) <= 0 || Number(row.hours) > 1000) return `${label}: enter valid hours greater than zero.`
    }
  }
  for (const [index, row] of review.materials.entries()) {
    const label = `Material row ${index + 1}`
    if (!validScanDate(row.date)) return `${label}: enter a valid date.`
    if (!row.description.trim()) return `${label}: enter a description.`
    if (!Number.isFinite(Number(row.qty)) || Number(row.qty) <= 0) return `${label}: enter a quantity greater than zero.`
    if (row.cost.trim() && (!Number.isFinite(Number(row.cost)) || Number(row.cost) < 0)) return `${label}: enter a valid cost.`
  }
  return ''
}
export function qrJobId(value: string): string | null {
  // Read the job identity only; never follow a URL contained in a scanned card.
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol)) return null
    return url.pathname.match(/^\/quoting\/(?:jobs\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/(?:job-card|job-summary))?\/?$/i)?.[1].toLowerCase() || null
  } catch { return null }
}
