# Schema drift inventory

**Status:** Resolved on `dev` branch — migration `20260520050939_prod_schema_alignment.sql` captures every decision and is idempotent. **Pending application to prod** as part of the next dev → main promotion PR.

## Background

On 2026-05-20 the dev environment was migrated from a self-hosted Supabase on a Synology NAS to the cloud Supabase project `rpm-dev`. During that migration we discovered three different schemas in play:

- **Repo migration files** (`supabase/migrations/*.sql`) — the *documented* schema
- **Prod** (`ywjwqxrrnmqlhvqdfvua.supabase.co`) — drifted via hand-ALTERs in the Supabase dashboard
- **DiskStation** (the dev DB until 2026-05-20) — *also* drifted independently

Cloud-dev was rebuilt with the repo's migrations + dev branch's RLS migrations + prod's data via column-intersection import. The reconciliation migration was then written and applied to cloud-dev. **Cloud-dev's schema is now what we want prod to look like post-promotion.**

## Decisions made

For each drifted column, the decision rule was: **does the column have real data in prod, and is that data plausibly useful?**

### Kept (5 columns) — added to cloud-dev, real data backfilled from prod

| Column | Justification | Wired into dev UI? |
|---|---|---|
| `assets.pm_interval_months` | 6/6 prod assets have values (mostly 6, one 12) — real PM scheduling | ✅ Now editable in asset form, displayed on asset detail |
| `jobs.responded_at` | 1/9 prod jobs has a value (the resolved one) — meaningful "first response" timestamp | ✅ Shown alongside resolved timestamp on job detail |
| `site_photos.caption` | 9/9 populated (original filenames) | ✅ Displayed under each photo in site gallery (was always there, now properly typed) |
| `site_photos.updated_at` | 9/9 populated, standard tracking column | Used internally; trigger added to auto-update |
| `asset_photos.caption` | 8/8 populated (original filenames) | ✅ Displayed under each photo in asset gallery (newly added) |

### Dropped (7 columns) — all NULL in prod, never used

| Column | Action |
|---|---|
| `asset_types.sub_cat_1`, `sub_cat_2`, `sub_cat_3` | DROP — 0/14 populated |
| `asset_types.code` | DROP — 0/14 populated |
| `assets.asset_code` | DROP — 0/6 populated |
| `vendors.address`, `vendors.service_type` | DROP — 0 vendor rows in prod; dev branch uses `trade`/`account_code` instead |

### Added to prod (7 columns) — dev branch needs these, prod missing them

| Column | Notes |
|---|---|
| `vendors.client_id`, `vendors.trade`, `vendors.account_code` | Dev vendor form uses all three. `trade NOT NULL` since prod has 0 vendor rows. |
| `jobs.budget_impact`, `jobs.project_id`, `jobs.vendor_id`, `jobs.media_urls` | All used by dev branch UI; were in repo's `add_extended_tables.sql` but never applied to prod |
| `projects.store_id` | HQ project ↔ store FK used by dev |

### Other adjustments

- `stores.bento_bowl → brand_bento_bowl` rename (idempotent — `IF EXISTS` guard; prod already has new name)
- `stores.brand_bento_bowl SET DEFAULT false` (alignment)
- `stores.maintenance_score` widened `NUMERIC(3,1) → NUMERIC(5,1)` (prod had a value of 100)
- `assets.name` `DROP NOT NULL` (prod has a row with NULL name)
- Indexes added: `idx_vendors_client_id`, `idx_jobs_vendor_id`, `idx_jobs_project_id`, `idx_projects_store_id`, `idx_site_photos_store_id`, `idx_asset_photos_asset_id`, `idx_maintenance_schedules_asset_id`
- `set_updated_at()` trigger function + trigger on `site_photos` (auto-update timestamp on UPDATE)

## Storage policies

The 4 dev RLS migrations rewrote the storage policies under `storage.objects` for the `asset-photos`, `site-photos`, `job-attachments` buckets. These have been applied to cloud-dev but **not yet to prod**. When promoting dev → prod, the same 4 RLS migrations must run on prod (they're idempotent — `DROP POLICY IF EXISTS` then `CREATE POLICY`).

## Promotion checklist (when ready to merge dev → main)

1. Apply `20260520050939_prod_schema_alignment.sql` to prod
2. Apply `20260316000000_fix_rls_policies.sql` to prod
3. Apply `20260316100000_fix_assets_jobs_rls.sql` to prod
4. Apply `20260317000000_fix_rls_security.sql` to prod
5. Apply `20260412000000_rls_hardening.sql` to prod
6. Verify schema matches cloud-dev (`pg_dump --schema-only` diff should be near-empty)
7. Smoke-test prod app end-to-end
8. Delete this file
