export type JobCardPagePlan = {
  materialIndexes: number[]
  showTimeLog: boolean
  showCloseout: boolean
}

type Measurements = {
  availableHeight: number
  introHeight: number
  continuationHeight: number
  materialsHeadingHeight: number
  materialRowHeights: number[]
  trimmableMaterialIndexes?: number[]
  timeLogHeight: number
  closeoutHeight: number
}

// Keep each printed section intact. Material rows can continue across pages,
// followed by the time log and sign-off in their original order.
export function paginateJobCard(measurements: Measurements): JobCardPagePlan[] {
  const pages: JobCardPagePlan[] = [{ materialIndexes: [], showTimeLog: false, showCloseout: false }]
  let current = pages[0]
  let usedHeight = measurements.introHeight
  const trimmableMaterials = new Set(measurements.trimmableMaterialIndexes || [])

  const nextPage = () => {
    current = { materialIndexes: [], showTimeLog: false, showCloseout: false }
    pages.push(current)
    usedHeight = measurements.continuationHeight
  }

  measurements.materialRowHeights.forEach((rowHeight, index) => {
    const headingHeight = current.materialIndexes.length === 0 ? measurements.materialsHeadingHeight : 0
    if (usedHeight + headingHeight + rowHeight > measurements.availableHeight) nextPage()
    if (current.materialIndexes.length === 0) usedHeight += measurements.materialsHeadingHeight
    current.materialIndexes.push(index)
    usedHeight += rowHeight
  })

  // Blank material rows are useful for handwritten additions, but they should
  // not create a mostly empty continuation page. Remove only trailing blank
  // rows, and only when a following section otherwise would not fit.
  const trimBlankMaterialRow = () => {
    const index = current.materialIndexes.at(-1)
    if (index == null || !trimmableMaterials.has(index)) return false
    current.materialIndexes.pop()
    usedHeight -= measurements.materialRowHeights[index]
    if (current.materialIndexes.length === 0) usedHeight -= measurements.materialsHeadingHeight
    return true
  }

  while (usedHeight + measurements.timeLogHeight > measurements.availableHeight && trimBlankMaterialRow()) {
    // Keep as many blank rows as will still allow the time log to fit.
  }
  if (usedHeight + measurements.timeLogHeight > measurements.availableHeight) nextPage()
  current.showTimeLog = true
  usedHeight += measurements.timeLogHeight

  while (usedHeight + measurements.closeoutHeight > measurements.availableHeight && trimBlankMaterialRow()) {
    // Keep as many blank rows as will still allow the closeout to fit.
  }
  if (usedHeight + measurements.closeoutHeight > measurements.availableHeight) nextPage()
  current.showCloseout = true

  return pages
}
