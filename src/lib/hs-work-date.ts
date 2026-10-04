type DatedRecord = { kind?: string; body?: { date_tbc?: boolean } | null }

export function isWorkDateTbc(record: DatedRecord) {
  return record.kind !== "toolbox" && record.body?.date_tbc === true
}

export function hasWorkDate(date: string, tbc: boolean) {
  if (tbc) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}
