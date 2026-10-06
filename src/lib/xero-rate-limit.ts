export class XeroRateLimitError extends Error {
    constructor(public readonly retryAfter: number) {
        super(`Xero is temporarily limiting requests. Try again in ${formatXeroWait(retryAfter)}.`)
    }
}

export function formatXeroWait(seconds: number) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return hours ? `${hours}h ${minutes}m` : `${minutes}m ${seconds % 60}s`
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
