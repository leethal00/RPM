/**
 * Hours-of-operation parsing + display helpers.
 *
 * The DB column `stores.hours_of_operation` is a JSON string that can be one of:
 *   - { "type": "always" }                                        — 24/7
 *   - { "type": "daily",  "hours": { "start", "end" } }           — same hours every day
 *   - { "type": "weekly", "days":  { Monday: { start, end }, Sunday: { closed: true }, … } } — per-day
 *
 * All consumers (site-form, sites-portfolio table, future map popups) should
 * use `parseHours` / `formatHoursShort` from here so the new "always" type
 * doesn't need to be re-handled in every call site.
 */

export const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const

export type DayHours = { start: string; end: string } | { closed: true }

export function isClosedDay(hours: DayHours | null | undefined): hours is { closed: true } {
    return hours != null && "closed" in hours && hours.closed === true
}

export function formatDayHours(hours: DayHours | null | undefined): string {
    if (!hours) return "—"
    return isClosedDay(hours) ? "Closed" : `${hours.start}–${hours.end}`
}

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
    if (parsed.type === "daily") return formatDayHours(parsed.hours)
    const closedDays = DAYS_OF_WEEK.filter(day => isClosedDay(parsed.days[day]))
    return closedDays.length === 0
        ? "Weekly schedule"
        : `Weekly schedule · ${closedDays.map(day => `${day.slice(0, 3)} Closed`).join(" · ")}`
}
