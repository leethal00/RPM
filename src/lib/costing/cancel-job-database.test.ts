// @vitest-environment node
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

const admin = "00000000-0000-0000-0000-000000000001"
const worker = "00000000-0000-0000-0000-000000000002"
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE public.users(id uuid PRIMARY KEY, role text);
    INSERT INTO users VALUES ('${admin}', 'rodier_admin'), ('${worker}', 'technician');
    CREATE TYPE costing_status AS ENUM ('in_progress', 'complete', 'cancelled');
    CREATE TABLE public.costing_jobs (
      id text PRIMARY KEY, status costing_status, is_template boolean DEFAULT false,
      updated_at timestamptz, xero_invoice_id text, adjusted_total numeric
    );
    CREATE TABLE public.bom(job_id text REFERENCES costing_jobs(id) ON DELETE CASCADE, history text);
    INSERT INTO costing_jobs VALUES ('job', 'in_progress', false, now(), 'invoice', 500);
    INSERT INTO bom VALUES ('job', 'original BOM');
  `)
  // Execute the exact deliverable migration in an isolated PostgreSQL engine.
  await db.exec(readFileSync("supabase/migrations/20261109234342_cancel_costing_job.sql", "utf8"))
}, 30000)
beforeEach(async () => { await db.exec(`BEGIN; SELECT set_config('test.uid', '${admin}', false);`) })
afterEach(async () => { await db.exec("ROLLBACK") })
afterAll(async () => { await db.close() })

describe("Database cancellation guard", () => {
  it("preserves BOM, invoice identity and sales values, records actor/time, and excludes cancelled revenue from active jobs", async () => {
    await db.exec("UPDATE costing_jobs SET status='cancelled', cancellation_reason='  Customer request  ' WHERE id='job'")
    const { rows } = await db.query("SELECT *, (SELECT history FROM bom WHERE job_id='job') AS bom FROM costing_jobs WHERE id='job'")
    expect(rows[0]).toMatchObject({ status: "cancelled", cancelled_by: admin, cancellation_reason: "Customer request", xero_invoice_id: "invoice", adjusted_total: "500", bom: "original BOM" })
    expect(rows[0].cancelled_at).toBeTruthy()
    expect((await db.query("SELECT coalesce(sum(adjusted_total),0)::int AS revenue FROM costing_jobs WHERE status='in_progress'")).rows).toEqual([{ revenue: 0 }])
    expect((await db.query("SELECT id FROM costing_jobs WHERE status='complete'")).rows).toEqual([])
  })
  it.each([worker, ""])("rejects a direct cancellation by a non-admin or service call without an actor (%s)", async (actor) => {
    await db.query("SELECT set_config('test.uid', $1, false)", [actor])
    await expect(db.exec("UPDATE costing_jobs SET status='cancelled' WHERE id='job'")).rejects.toThrow("Only Rodier admins")
  })
  it.each(["status='complete'", "status='in_progress'", "cancellation_reason='rewritten'", "cancelled_by=null", "cancelled_at=null"])("rejects changes to cancellation history: %s", async (change) => {
    await db.exec("UPDATE costing_jobs SET status='cancelled' WHERE id='job'")
    await expect(db.exec(`UPDATE costing_jobs SET ${change} WHERE id='job'`)).rejects.toThrow("cannot be reopened")
  })
  it("prevents deletion of cancelled job history", async () => {
    await db.exec("UPDATE costing_jobs SET status='cancelled' WHERE id='job'")
    await expect(db.exec("DELETE FROM costing_jobs WHERE id='job'")).rejects.toThrow("retained as history")
  })
  it("allows repeat PAID events without touching a cancelled job", async () => {
    await db.exec("UPDATE costing_jobs SET status='cancelled' WHERE id='job'")
    for (let i = 0; i < 2; i++) {
      expect((await db.query("UPDATE costing_jobs SET status='complete' WHERE xero_invoice_id='invoice' AND status='in_progress' RETURNING id")).rows).toEqual([])
    }
    expect((await db.query("SELECT status FROM costing_jobs")).rows).toEqual([{ status: "cancelled" }])
  })
  it("rejects cancellation after another writer completed the job", async () => {
    await db.exec("UPDATE costing_jobs SET status='complete' WHERE id='job'")
    expect((await db.query("UPDATE costing_jobs SET status='cancelled' WHERE id='job' AND status='in_progress' RETURNING id")).rows).toEqual([])
  })
  it("rejects cancellation of a template", async () => {
    await db.exec("UPDATE costing_jobs SET is_template=true WHERE id='job'")
    await expect(db.exec("UPDATE costing_jobs SET status='cancelled' WHERE id='job'")).rejects.toThrow("Only active jobs")
  })
})
