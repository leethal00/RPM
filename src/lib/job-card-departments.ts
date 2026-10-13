type DepartmentLine = {
  section?: string | null
  subsection?: string | null
  description?: string | null
}

export function inferDepartments(title: string, details: string, lines: DepartmentLine[]) {
  const result = new Set<string>()

  // Department names in the BOM section/subsection are the strongest signal.
  const sectionText = lines
    .map((line) => `${line.section || ""} ${line.subsection || ""}`)
    .join(" ")
    .toLowerCase()

  if (/\bcnc\b|router|routing|milling|lathe/.test(sectionText)) result.add("CNC")
  if (/metal|steel|aluminium|aluminum|weld|fabricat|bracket|shs|rhs/.test(sectionText)) result.add("Metal")
  if (/\bfab\b|fabrication|assembly|assemble|fold|press|guillotine/.test(sectionText)) result.add("Fab")
  if (/electrical|illumin|\bled\b|wiring|power|transformer/.test(sectionText)) result.add("Electrical")
  if (/vinyl|graphic|print|laminat/.test(sectionText)) result.add("Vinyl")
  if (/install|site work|service|repair|maintenance/.test(sectionText)) result.add("Install")

  // Descriptions are fallback evidence. Remove explicit exclusions and avoid
  // treating a material's "Service" label as an installation instruction.
  const descriptiveText = `${title} ${details} ${lines.map((line) => line.description || "").join(" ")}`
    .toLowerCase()
    .replace(/no allowance for[^.\n]*/g, "")
    .replace(/no [^.\n]*work/g, "")
    .replace(/exclude(?:d|s|ing)?[^.\n]*/g, "")
    .replace(/not included[^.\n]*/g, "")
    .replace(/not required[^.\n]*/g, "")
    .replace(/\bnon[-\s]?illuminat\w*\b|\bnot illuminated\b/g, "")

  if (/\bcnc\b|router|routing|milling|lathe/.test(descriptiveText)) result.add("CNC")
  if (/steel|aluminium|aluminum|weld|metal|bracket|shs|rhs/.test(descriptiveText)) result.add("Metal")
  if (/illumin|electrical|\bled\b|wiring|power|transformer/.test(descriptiveText)) result.add("Electrical")
  if (/vinyl|graphic|print|laminat/.test(descriptiveText)) result.add("Vinyl")
  if (/repair|site work|install|maintenance|\bservice (?:work|call)\b/.test(descriptiveText)) result.add("Install")

  // Fab comes from the BOM routing, not generic words such as "folded".
  return Array.from(result)
}
