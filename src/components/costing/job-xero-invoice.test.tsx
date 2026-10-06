import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { JobXeroInvoice } from "./job-xero-invoice"
import type { CostingJob } from "@/types/database"

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
const job = { id: "job-1", title: "KFC Speakerposts", status: "quoted", xero_quote_id: "quote-1", clients: { name: "Searchfield" } } as CostingJob
const preview = { invoice: { invoiceId: "new-invoice", invoiceNumber: "INV-7602", status: "DRAFT", contactName: "Searchfield", total: 10184.69, reference: "KFC Speakerposts PO#RH083221", date: "2026-11-30", dueDate: "2026-12-20", currencyCode: "NZD", lines: [] }, proposedLines: [] }
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("quote invoice linking dialog", () => {
  it("shows the PO and dates, then submits only the reviewed invoice identity", async () => {
    const changed = vi.fn()
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => preview })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, changedToJob: true, invoice: preview.invoice }) })
    vi.stubGlobal("fetch", fetchMock)
    render(<JobXeroInvoice job={job} onChanged={changed} />)
    expect(screen.queryByRole("button", { name: "Create Xero invoice" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Link existing Xero invoice" }))
    expect(screen.getByText(/moves this quote into Active Jobs/)).toBeInTheDocument()
    fireEvent.change(screen.getByRole("textbox", { name: "Xero invoice number" }), { target: { value: "INV-7602" } })
    fireEvent.click(screen.getByRole("button", { name: "Find" }))
    expect(await screen.findByText("Reference: KFC Speakerposts PO#RH083221")).toBeInTheDocument()
    expect(screen.getByText("Date: 2026-11-30 · Due: 2026-12-20")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Link this invoice" }))
    await waitFor(() => expect(changed).toHaveBeenCalledOnce())
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "link", invoiceNumber: "INV-7602", expectedInvoiceId: "new-invoice" })
  })

  it("invalidates the preview when the invoice number is edited", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => preview }))
    render(<JobXeroInvoice job={job} onChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Link existing Xero invoice" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Xero invoice number" }), { target: { value: "INV-7602" } })
    fireEvent.click(screen.getByRole("button", { name: "Find" }))
    await screen.findByRole("button", { name: "Link this invoice" })
    fireEvent.change(screen.getByRole("textbox", { name: "Xero invoice number" }), { target: { value: "INV-7249" } })
    expect(screen.queryByRole("button", { name: "Link this invoice" })).not.toBeInTheDocument()
  })
})

describe("linked invoice line import", () => {
  it("shows the invoice lines and imports them into the linked RPM job", async () => {
    const linkedJob = { ...job, status: "in_progress", xero_quote_id: null, xero_invoice_id: null, xero_invoice_number: "INV-7570" } as CostingJob
    const invoicePreview = { invoice: { ...preview.invoice, invoiceId: "invoice-1", invoiceNumber: "INV-7570", updatedAt: "2026-10-07T00:00:00Z", lines: [{ description: "Pylon survey", quantity: 1, unitAmount: 280 }] }, proposedLines: [], rpmItemCount: 0 }
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => invoicePreview })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, imported: 1 }) })
    vi.stubGlobal("fetch", fetchMock)
    const changed = vi.fn()
    render(<JobXeroInvoice job={linkedJob} onChanged={changed} />)
    expect(screen.queryByRole("button", { name: "Create Xero invoice" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Import Xero invoice lines" }))
    expect(await screen.findByText(/Pylon survey/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Import lines into RPM" }))
    await waitFor(() => expect(changed).toHaveBeenCalledOnce())
    expect(fetchMock.mock.calls[0][0]).toBe("/api/xero/invoices/job-1?importLines=1")
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "import-lines", expectedInvoiceId: "invoice-1", expectedUpdatedAt: "2026-10-07T00:00:00Z" })
  })
})
