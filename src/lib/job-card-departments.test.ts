import { describe, expect, it } from "vitest"
import { inferDepartments } from "./job-card-departments"

describe("job card department suggestions", () => {
  it("keeps non-illuminated manufacture work out of Electrical and Install", () => {
    expect(inferDepartments("Gateway Plinths", "CNC cut aluminium, non-illuminated", [
      { section: "Labour", subsection: "Manufacture", description: "Metal Fabrication" },
      { section: "Materials", subsection: "ACM", description: "ACM Signbond Gloss White / Service 2440x1220x4" },
    ])).toEqual(["CNC", "Metal"])
  })

  it("still selects electrical and installation for positive work", () => {
    expect(inferDepartments("Illuminated sign", "LED wiring and site installation", [
      { section: "Labour", subsection: "Electrical", description: "Wiring" },
      { section: "Labour", subsection: "Install", description: "Install at site" },
    ])).toEqual(["Electrical", "Install"])
  })

  it("ignores explicitly excluded vinyl work", () => {
    expect(inferDepartments("Aluminium sign", "No allowance for vinyl work.", [])).toEqual(["Metal"])
  })
})
