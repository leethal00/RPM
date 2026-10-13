import { xeroAdmin } from "@/lib/xero"
import type { XeroRow } from "@/lib/xero-job-sync"

// The invoice ID is the durable link. A number alone could refer to a different
// invoice after edits in Xero, so only jobs with the exact ID are completed.
export async function completePaidLinkedJobs(invoices: XeroRow[]) {
  const paid = [...new Map(invoices.filter((invoice) =>
    String(invoice.Type).toUpperCase() === "ACCREC"
    && String(invoice.Status).toUpperCase() === "PAID"
    && typeof invoice.InvoiceID === "string"
    && invoice.InvoiceID.trim()
  ).map((invoice) => [String(invoice.InvoiceID), invoice])).values()]

  const completed: string[] = []
  for (const invoice of paid) {
    const { data, error } = await xeroAdmin().from("costing_jobs")
      .update({ status: "complete", updated_at: new Date().toISOString() })
      .eq("xero_invoice_id", invoice.InvoiceID)
      .eq("status", "in_progress")
      .select("id")
    if (error) throw error
    for (const job of data || []) completed.push(job.id)
  }
  return completed
}
