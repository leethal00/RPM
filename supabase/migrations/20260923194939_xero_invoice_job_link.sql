-- Keep a stable link to the Xero sales invoice behind a costing job.
-- The number remains a display value; Xero's InvoiceID is the update target.
ALTER TABLE costing_jobs
  ADD COLUMN IF NOT EXISTS xero_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS xero_invoice_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS costing_jobs_xero_invoice_id_unique
  ON costing_jobs (xero_invoice_id)
  WHERE xero_invoice_id IS NOT NULL;
