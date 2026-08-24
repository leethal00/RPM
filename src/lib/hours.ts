/**
 * Hours-of-operation parsing + display helpers.
 *
 * The DB column `stores.hours_of_operation` is a JSON string that can be one of:
 *   - { "type": "always" }                                        — 24/7
 *   - { "type": "daily",  "hours": { "start", "end" } }           — same hours every day
 *   - { "type": "weekly", "days":  { Monday: { start, end }, … } } — per-day
 *
 * All consumers (site-form, sites-portfolio table, future map popups) should
 * use `parseHours` / `formatHoursShort` from here so the new "always" type
 * doesn't need to be re-handled in every call site.
 */

export type DayHours = { start: string; end: string }

export type HoursPayload =
    | { type: "always" }
    | { type: "daily"; hours: DayHours }
    | { type: "weekly"; days: Record<string, DayHours> }

export function parseHours(json: string | null | undefined): HoursPayload | null {
    if (!json) return null
    try {
        const parsed = JSON.parse(json)
        if (parsed?.type === "always") return { type: "always" }
        if (parsed?.type === "daily" && parsed?.hours) return parsed as HoursPayload
        if (parsed?.type === "weekly" && parsed?.days) return parsed as HoursPayload
        return null
    } catch {
        return null
    }
}

/** Compact display: used in lists/tables. */
export function formatHoursShort(json: string | null | undefined): string {
    const parsed = parseHours(json)
    if (!parsed) return "—"
    if (parsed.type === "always") return "24 hours"
    if (parsed.type === "daily") return `${parsed.hours.start}–${parsed.hours.end}`
    return "Weekly schedule"
}
