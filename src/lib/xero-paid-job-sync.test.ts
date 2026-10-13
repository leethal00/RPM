import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ jobs: [] as { id: string; xero_invoice_id: string; status: string }[], updates: 0, fail: false }))
vi.mock("@/lib/xero", () => ({ xeroAdmin: () => ({ from: (table: string) => {
  if (table !== "costing_jobs") throw new Error("Unexpected table")
  let values: { status: string } | undefined
  const filters: ((job: (typeof state.jobs)[number]) => boolean)[] = []
  const query = {
    update: (next: { status: string }) => { values = next; return query },
    eq: (key: "xero_invoice_id" | "status", value: string) => { filters.push((job) => job[key] === value); return query },
    select: async () => {
      if (state.fail) return { data: null, error: new Error("Database unavailable") }
      const matching = state.jobs.filter((job) => filters.every((filter) => filter(job)))
      for (const job of matching) { job.status = values!.status; state.updates++ }
      return { data: matching.map((job) => ({ id: job.id })), error: null }
    },
  }
  return query
} }) }))

import { completePaidLinkedJobs } from "./xero-paid-job-sync"

beforeEach(() => {
  state.jobs = [
    { id: "linked", xero_invoice_id: "paid-invoice", status: "in_progress" },
    { id: "already-complete", xero_invoice_id: "paid-invoice", status: "complete" },
    { id: "other-invoice", xero_invoice_id: "different-invoice", status: "in_progress" },
  ]
  state.updates = 0; state.fail = false
})

describe("Xero paid invoice job completion", () => {
  it("completes only an in-progress job linked by the exact paid sales invoice ID", async () => {
    expect(await completePaidLinkedJobs([
      { InvoiceID: "paid-invoice", Type: "ACCREC", Status: "PAID" },
      { InvoiceID: "paid-invoice", Type: "ACCREC", Status: "PAID" },
      { InvoiceID: "different-invoice", Type: "ACCREC", Status: "AUTHORISED" },
      { InvoiceID: "different-invoice", Type: "ACCPAY", Status: "PAID" },
    ])).toEqual(["linked"])
    expect(state.jobs.map((job) => job.status)).toEqual(["complete", "complete", "in_progress"])
    expect(state.updates).toBe(1)
    expect(await completePaidLinkedJobs([{ InvoiceID: "paid-invoice", Type: "ACCREC", Status: "PAID" }])).toEqual([])
    expect(state.updates).toBe(1)
  })

  it("reports database failures so the webhook keeps the event for retry", async () => {
    state.fail = true
    await expect(completePaidLinkedJobs([{ InvoiceID: "paid-invoice", Type: "ACCREC", Status: "PAID" }])).rejects.toThrow("Database unavailable")
    expect(state.jobs[0].status).toBe("in_progress")
  })
})
