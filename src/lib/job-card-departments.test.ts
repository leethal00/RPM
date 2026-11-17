import { describe, expect, it } from "vitest"
import { inferDepartments } from "./job-card-departments"

describe("job card department suggestions", () => {
  it("selects CNC for the laser cutting BOM subsection", () => {
    expect(inferDepartments("Acrylic parts", "", [
      { section: "Pack/Despatch/Freight", subsection: "Laser cutting" },
    ])).toEqual(["CNC"])
  })

  it("selects CNC when the BOM lists laser cutter machine time", () => {
    expect(inferDepartments("Acrylic parts", "", [
      { section: "Labour", subsection: "Factory Time", description: "Laser Cutter - Machine time" },
    ])).toEqual(["CNC"])
  })

  it("selects CNC when the job details specify laser cutting", () => {
    expect(inferDepartments("Acrylic parts", "Laser cut from 6mm acrylic.", [])).toEqual(["CNC"])
    expect(inferDepartments("Acrylic parts", "Supply laser-cut acrylic.", [])).toEqual(["CNC"])
  })

  it("ignores laser cutting excluded from the job details", () => {
    expect(inferDepartments("Acrylic parts", "No allowance for laser cutting.", [])).toEqual([])
  })

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
