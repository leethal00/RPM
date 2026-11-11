// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'

let db: PGlite
beforeAll(async () => {
    db = new PGlite()
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;')
    await db.exec(readFileSync('supabase/migrations/20261111021101_google_maps_browser_config.sql', 'utf8'))
    await db.exec("INSERT INTO public.google_maps_browser_config (browser_api_key,map_id) VALUES ('AIza-test-browser-key','test-map')")
}, 30000)
afterAll(async () => { await db.close() })

it('permits only server-role access, with RLS enabled and no anonymous or authenticated table privileges', async () => {
    expect((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.google_maps_browser_config'::regclass")).rows).toEqual([{ relrowsecurity: true }])
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`SET ROLE ${role}`)
        await expect(db.query('SELECT * FROM public.google_maps_browser_config')).rejects.toThrow('permission denied')
        await expect(db.exec("UPDATE public.google_maps_browser_config SET map_id='changed'")).rejects.toThrow('permission denied')
        await db.exec('RESET ROLE')
    }
    await db.exec('SET ROLE service_role')
    expect((await db.query('SELECT map_id FROM public.google_maps_browser_config')).rows).toEqual([{ map_id: 'test-map' }])
    await db.exec('RESET ROLE')
})
