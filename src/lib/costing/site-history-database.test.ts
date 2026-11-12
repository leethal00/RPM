// @vitest-environment node
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

const staff = "00000000-0000-0000-0000-000000000001"
const restaurantUser = "00000000-0000-0000-0000-000000000002"
const coatesUser = "00000000-0000-0000-0000-000000000003"
const assignedHQ = "00000000-0000-0000-0000-000000000004"
const unassignedHQ = "00000000-0000-0000-0000-000000000005"
const coates = "10000000-0000-0000-0000-000000000001"
const restaurant = "10000000-0000-0000-0000-000000000002"
const linwood = "20000000-0000-0000-0000-000000000001"
const repair = "30000000-0000-0000-0000-000000000001"
let db: PGlite

beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; CREATE SCHEMA rpm_private;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
            $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
        CREATE TABLE public.users(id uuid PRIMARY KEY, role text, client_id uuid, store_ids uuid[]);
        CREATE FUNCTION rpm_private.current_role() RETURNS text LANGUAGE sql AS
            $$ SELECT role FROM public.users WHERE id=auth.uid() $$;
        CREATE TABLE public.clients(id uuid PRIMARY KEY, name text);
        CREATE TABLE public.stores(id uuid PRIMARY KEY, client_id uuid);
        CREATE TABLE public.costing_jobs(
            id uuid PRIMARY KEY, client_id uuid, store_id uuid, title text, production_title text,
            job_number text, status text, created_at timestamptz DEFAULT now(), completion_date date,
            is_template boolean DEFAULT false
        );
        INSERT INTO clients VALUES ('${coates}', 'Coates Signco'), ('${restaurant}', 'McDonalds Linwood');
        INSERT INTO stores VALUES ('${linwood}', '${restaurant}');
        INSERT INTO users VALUES
            ('${staff}', 'rodier_admin', null, '{}'),
            ('${restaurantUser}', 'client_store', '${restaurant}', ARRAY['${linwood}']::uuid[]),
            ('${coatesUser}', 'client_hq', '${coates}', '{}'),
            ('${assignedHQ}', 'client_hq', '10000000-0000-0000-0000-000000000003', ARRAY['${linwood}']::uuid[]),
            ('${unassignedHQ}', 'client_hq', '10000000-0000-0000-0000-000000000003', '{}');
        INSERT INTO costing_jobs(id,client_id,store_id,title,status) VALUES
            ('${repair}', '${coates}', '${linwood}', 'Height restrictor warranty repair', 'in_progress');
    `)
    await db.exec(readFileSync("supabase/migrations/20261004222007_costing_job_multiple_sites.sql", "utf8"))
    await db.exec(readFileSync("supabase/migrations/20261112050159_assigned_site_job_summaries.sql", "utf8"))
}, 30000)
beforeEach(async () => {
    await db.exec(`BEGIN; SELECT set_config('test.uid', '${restaurantUser}', false);`)
})
afterEach(async () => { await db.exec("ROLLBACK") })
afterAll(async () => { await db.close() })

async function history() {
    const { rows } = await db.query<{ jobs: Array<Record<string, unknown>> }>("SELECT public.site_costing_jobs($1) AS jobs", [linwood])
    return rows[0].jobs
}

describe("a Coates repair in McDonalds site history", () => {
    it("shows McDonalds a shared summary while retaining Coates as the job customer", async () => {
        await db.exec(`UPDATE costing_jobs SET visible_to_client=true WHERE id='${repair}'`)
        expect(await history()).toEqual([expect.objectContaining({ id: repair, title: "Height restrictor warranty repair", can_open_job: false, client_name: null })])
        const { rows } = await db.query("SELECT client_id,store_id FROM costing_jobs")
        expect(rows).toEqual([{ client_id: coates, store_id: linwood }])
        await db.query("SELECT set_config('test.uid', $1, false)", [staff])
        expect(await history()).toEqual([expect.objectContaining({ id: repair, can_open_job: true, client_name: "Coates Signco" })])
    })

    it("keeps unshared jobs and draft quotes out of the restaurant's history", async () => {
        expect(await history()).toEqual([])
        await db.exec(`UPDATE costing_jobs SET visible_to_client=true, status='quote' WHERE id='${repair}'`)
        expect(await history()).toEqual([])
    })

    it("does not grant the paying customer access to the restaurant site", async () => {
        await db.query("SELECT set_config('test.uid', $1, false)", [coatesUser])
        await expect(history()).rejects.toThrow("Site access denied")
    })

    it("shows the same limited summary to McDonalds HQ when Linwood is in its assigned portfolio", async () => {
        await db.query("SELECT set_config('test.uid', $1, false)", [assignedHQ])
        expect(await history()).toEqual([])
        await db.exec(`UPDATE costing_jobs SET visible_to_client=true WHERE id='${repair}'`)
        const jobs = await history()
        expect(jobs).toEqual([expect.objectContaining({ id: repair, can_open_job: false, client_name: null })])
        expect(jobs[0]).not.toHaveProperty("adjusted_total")
    })

    it("rejects an HQ user without ownership or an explicit site assignment", async () => {
        await db.query("SELECT set_config('test.uid', $1, false)", [unassignedHQ])
        await expect(history()).rejects.toThrow("Site access denied")
    })
})
