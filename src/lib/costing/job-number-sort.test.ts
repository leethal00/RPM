import { describe, expect, it } from "vitest"
import { compareJobNumbers } from "./job-number-sort"

describe("compareJobNumbers", () => {
    const numbers = ["INV-9", "INV-100", "INV-10", "INV-7596", "JOB-27", null]

    it("puts the highest numeric job number first by default", () => {
        expect([...numbers].sort((a, b) => compareJobNumbers(a, b, "desc")))
            .toEqual(["INV-7596", "INV-100", "JOB-27", "INV-10", "INV-9", null])
    })

    it("reverses the numeric order when the Job # header is clicked", () => {
        expect([...numbers].sort((a, b) => compareJobNumbers(a, b, "asc")))
            .toEqual(["INV-9", "INV-10", "JOB-27", "INV-100", "INV-7596", null])
    })
})
