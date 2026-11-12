// @vitest-environment node
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

let db: PGlite
const coates = "10000000-0000-0000-0000-000000000001"
const mcdonalds = "10000000-0000-0000-0000-000000000002"
const other = "10000000-0000-0000-0000-000000000003"
const linwood = "20000000-0000-0000-0000-000000000001"
const staff = "30000000-0000-0000-0000-000000000001"
const client = "30000000-0000-0000-0000-000000000002"

beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE SCHEMA auth; CREATE SCHEMA rpm_private;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
            $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
        CREATE TABLE public.users(id uuid PRIMARY KEY, role text);
        CREATE FUNCTION rpm_private.current_role() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path='' AS
            $$ SELECT role FROM public.users WHERE id=auth.uid() $$;
        GRANT USAGE ON SCHEMA rpm_private,auth TO authenticated;
        CREATE TABLE public.clients(id uuid PRIMARY KEY, name text);
        CREATE TABLE public.stores(id uuid PRIMARY KEY, client_id uuid REFERENCES clients(id), name text);
        INSERT INTO users VALUES ('${staff}', 'rodier_admin'), ('${client}', 'client_hq');
        INSERT INTO clients VALUES ('${coates}', 'Coates Signco'), ('${mcdonalds}', 'McDonalds Linwood'), ('${other}', 'Other customer');
        INSERT INTO stores VALUES ('${linwood}', '${mcdonalds}', 'McDonalds Linwood'),
            ('20000000-0000-0000-0000-000000000002', '${other}', 'Other site'),
            ('20000000-0000-0000-0000-000000000003', '${other}', 'McDonalds supplier office');
    `)
    await db.exec(readFileSync("supabase/migrations/20261112053036_customer_site_links.sql", "utf8"))
}, 30000)
afterAll(async () => { await db.close() })

describe("Coates operational site links", () => {
    it("links the original McDonalds sites without moving sites or including unrelated customers", async () => {
        expect((await db.query("SELECT client_id,store_id FROM customer_site_links")).rows).toEqual([{ client_id: coates, store_id: linwood }])
        expect((await db.query("SELECT client_id FROM stores WHERE id=$1", [linwood])).rows).toEqual([{ client_id: mcdonalds }])
        expect((await db.query("SELECT count(*)::int AS count FROM stores")).rows).toEqual([{ count: 3 }])
    })

    it("allows staff to read links but keeps them unavailable to client logins", async () => {
        await db.exec("BEGIN; SET LOCAL ROLE authenticated")
        try {
            await db.query("SELECT set_config('test.uid',$1,true)", [staff])
            expect((await db.query("SELECT store_id FROM customer_site_links")).rows).toEqual([{ store_id: linwood }])
            await db.query("SELECT set_config('test.uid',$1,true)", [client])
            expect((await db.query("SELECT store_id FROM customer_site_links")).rows).toEqual([])
        } finally { await db.exec("ROLLBACK") }
        expect((await db.query("SELECT has_table_privilege('anon','public.customer_site_links','SELECT') AS allowed")).rows).toEqual([{ allowed: false }])
    })
})
