import { render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({
  from: (table: string) => ({ select: () => ({ eq: () => ({ order: async () => ({ data: table === "hs_records" ? [
    { id: "swms-1", title: "Wanaka installation", kind: "swms", status: "draft", work_date: "2026-11-02", revision: 1, site: "Wanaka" },
    { id: "toolbox-1", title: "Crew briefing", kind: "toolbox", status: "completed", work_date: "2026-11-02", revision: 2, site: "Wanaka" },
  ] : [], error: null }) }) }) }),
}) }))

import { JobHealthSafety } from "./job-health-safety"

it("links each job H&S record directly to its editor while retaining the register link", async () => {
  render(<JobHealthSafety jobId="job-1" />)
  expect(await screen.findByRole("link", { name: /Wanaka installation/ })).toHaveAttribute("href", "/health-safety?job=job-1&record=swms-1")
  expect(screen.getByRole("link", { name: /Crew briefing/ })).toHaveAttribute("href", "/health-safety?job=job-1&record=toolbox-1")
  expect(screen.getByRole("link", { name: "Open H&S register" })).toHaveAttribute("href", "/health-safety?job=job-1")
})
