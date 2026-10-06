import { NextResponse } from "next/server"
import { XeroRateLimitError } from "./xero-rate-limit"

export function xeroErrorResponse(error: unknown) {
    if (!(error instanceof XeroRateLimitError)) return null
    return NextResponse.json({ error: error.message, retryAfter: error.retryAfter }, {
        status: 429, headers: { "Retry-After": String(error.retryAfter) },
    })
}
