// Section headings organise the items; they are not build items themselves.
export function simpleJobSummaryDescription(
  job: { details?: string | null; production_details?: string | null },
  items: readonly { mode: "simple" | "build"; sign_code: string | null }[],
) {
  const workItems = items.filter((item) => item.sign_code !== "__RPM_SECTION_HEADING__")
  if (!workItems.length || !workItems.every((item) => item.mode === "simple")) return ""

  // Match the job card and Xero invoice's production-description precedence.
  return (job.production_details ?? job.details ?? "").trim()
}
