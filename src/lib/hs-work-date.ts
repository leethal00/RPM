type DatedRecord = { kind?: string; body?: { date_tbc?: boolean } | null }

export function nzCalendarDate(value: string | Date = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const parts = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value
  return `${part("year")}-${part("month")}-${part("day")}`
}

export function getPreparedDate(record: { body?: { prepared_date?: string } | null; created_at?: string }) {
  return record.body?.prepared_date || (record.created_at ? nzCalendarDate(record.created_at) : "")
}

export function isWorkDateTbc(record: DatedRecord) {
  return record.kind !== "toolbox" && record.body?.date_tbc === true
}

export function hasWorkDate(date: string, tbc: boolean) {
  if (tbc) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}
