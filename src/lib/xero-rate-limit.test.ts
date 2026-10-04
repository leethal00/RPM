import { describe, expect, it } from "vitest"
import { xeroRetryAfter } from "./xero-rate-limit"

describe("Xero retry timing", () => {
    it("honors seconds, including longer daily waits", () => {
        expect(xeroRetryAfter("125")).toBe(125)
        expect(xeroRetryAfter("86400")).toBe(86400)
        expect(xeroRetryAfter("0")).toBe(1)
    })
    it("accepts an HTTP date", () => {
        expect(xeroRetryAfter("Mon, 05 Oct 2026 00:02:00 GMT", Date.parse("2026-10-05T00:00:00Z"))).toBe(120)
    })
    it.each([null, "", "invalid"])("uses a minute when Retry-After is absent or invalid: %s", (value) => {
        expect(xeroRetryAfter(value)).toBe(60)
    })
})
