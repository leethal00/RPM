export class XeroRateLimitError extends Error {
    constructor(public readonly retryAfter: number) {
        super("Xero is temporarily limiting requests. Please wait before trying again.")
    }
}

export function xeroRetryAfter(value: string | null, now = Date.now()): number {
    if (value !== null && value.trim()) {
        const seconds = Number(value)
        if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1, Math.ceil(seconds))
        const date = Date.parse(value)
        if (Number.isFinite(date)) return Math.max(1, Math.ceil((date - now) / 1000))
    }
    return 60
}
