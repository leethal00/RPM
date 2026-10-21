import { describe, expect, it } from "vitest"
import { simpleJobSummaryDescription } from "./job-summary-description"

const simple = { mode: "simple" as const, sign_code: null }
const build = { mode: "build" as const, sign_code: null }
const job = { details: "To CNC supplied 4x2 sheet of 4.5mm opal\n1@ 3995x590mm" }

describe("simple-line job summary description", () => {
  it("includes the job scope with its line breaks for simple-line jobs", () => {
    expect(simpleJobSummaryDescription(job, [simple, simple])).toBe(job.details)
  })

  it("uses the production scope when it has been edited", () => {
    expect(simpleJobSummaryDescription({ ...job, production_details: "Updated cutting instructions" }, [simple])).toBe("Updated cutting instructions")
  })

  it("respects an explicitly empty production scope", () => {
    expect(simpleJobSummaryDescription({ ...job, production_details: "" }, [simple])).toBe("")
  })

  it("ignores section headings when deciding whether all lines are simple", () => {
    expect(simpleJobSummaryDescription(job, [{ ...build, sign_code: "__RPM_SECTION_HEADING__" }, simple])).toBe(job.details)
  })

  it("does not add the description for mixed or build-only jobs", () => {
    expect(simpleJobSummaryDescription(job, [simple, build])).toBe("")
    expect(simpleJobSummaryDescription(job, [build])).toBe("")
  })

  it("omits the block for empty jobs or blank descriptions", () => {
    expect(simpleJobSummaryDescription(job, [])).toBe("")
    expect(simpleJobSummaryDescription({}, [simple])).toBe("")
    expect(simpleJobSummaryDescription({ details: " \n " }, [simple])).toBe("")
  })
})
