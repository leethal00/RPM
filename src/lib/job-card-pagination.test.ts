import { describe, expect, it } from "vitest"
import { paginateJobCard } from "./job-card-pagination"

const base = {
  availableHeight: 275,
  introHeight: 110,
  continuationHeight: 12,
  materialsHeadingHeight: 8,
  timeLogHeight: 57,
  closeoutHeight: 47,
}

describe("paginateJobCard", () => {
  it("keeps a typical job card together", () => {
    expect(paginateJobCard({ ...base, materialRowHeights: Array(6).fill(6) })).toEqual([
      { materialIndexes: [0, 1, 2, 3, 4, 5], showTimeLog: true, showCloseout: true },
    ])
  })

  it("moves the closeout to a continuation page when material rows fill the first page", () => {
    expect(paginateJobCard({ ...base, materialRowHeights: Array(12).fill(6) })).toEqual([
      { materialIndexes: Array.from({ length: 12 }, (_, index) => index), showTimeLog: true, showCloseout: false },
      { materialIndexes: [], showTimeLog: false, showCloseout: true },
    ])
  })

  it("continues materials before the time log on very large jobs", () => {
    const pages = paginateJobCard({ ...base, materialRowHeights: Array(50).fill(7) })
    expect(pages.flatMap((page) => page.materialIndexes)).toEqual(Array.from({ length: 50 }, (_, index) => index))
    expect(pages.slice(0, -1).every((page) => !page.showCloseout)).toBe(true)
    expect(pages.filter((page) => page.showTimeLog)).toHaveLength(1)
    expect(pages.filter((page) => page.showCloseout)).toHaveLength(1)
    expect(pages.length).toBeGreaterThan(2)
  })
})
