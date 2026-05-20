# Schema drift inventory

**Status:** open. Not blocking dev work. Blocking the next dev → prod promotion.

## Background

On 2026-05-20 the dev environment was migrated from a self-hosted Supabase on a Synology NAS to the cloud Supabase project `rpm-dev`. During that migration we discovered three different schemas in play:

- **Repo migration files** (`supabase/migrations/*.sql`) — the *documented* schema
- **Prod** (`ywjwqxrrnmqlhvqdfvua.supabase.co`) — drifted via hand-ALTERs in the Supabase dashboard
- **DiskStation** (the dev DB until 2026-05-20) — *also* drifted independently

Cloud-dev was rebuilt with the repo's migrations + dev branch's RLS migrations, plus prod's data copied across using a column-intersection import (prod-only columns were silently dropped). This means **cloud-dev now matches what the dev branch's app code expects, but does not match prod's actual schema**.

When the dev branch is eventually promoted to `main`, prod's schema needs to be reconciled. That work is documented here.

---

## Drift by table

For each row: `prod has` = columns prod has that the dev branch doesn't know about. `dev has` = columns dev branch expects that prod doesn't have.

### `stores`
- **prod has**: nothing extra (the rename `bento_bowl → brand_bento_bowl` was applied to both prod and DiskStation but never to the repo migrations — fixed in cloud-dev via direct `ALTER TABLE stores RENAME COLUMN bento_bowl TO brand_bento_bowl;`)
- **dev has**: nothing extra
- **Reconciliation**: write a migration that renames `bento_bowl → brand_bento_bowl` idempotently. Prod already has the new name, so wrap in an `IF EXISTS` check.
- **Also**: dev's `maintenance_score` is `NUMERIC(5,1)` (widened from baseline's `NUMERIC(3,1)` because prod had a value of 100). Need a migration matching.

### `asset_types`
- **prod has**: `sub_cat_1`, `sub_cat_2`, `sub_cat_3`, `code`
- **dev has**: nothing extra
- **Decision needed**: are these prod columns still used? If yes, add them back to the dev branch as a migration. If no, drop them from prod.

### `assets`
- **prod has**: `pm_interval_months`, `asset_code`
- **dev has**: nothing extra
- **Same decision as asset_types**: keep or drop.
- **Also**: dev relaxed `name` to nullable because prod had a row with `name=NULL`. Need a matching migration OR backfill the NULL row in prod and re-add `NOT NULL`.

### `jobs`
- **prod has**: `responded_at`
- **dev has**: `budget_impact`, `project_id`, `vendor_id` (these came from the baseline `add_extended_tables.sql` migration but were apparently never applied to prod)
- **Reconciliation**: write a migration that adds the dev columns to prod with sensible defaults (`budget_impact` → 0, FKs → NULL). Decide what to do with `responded_at` (keep / migrate to a different concept / drop).

### `projects`
- **prod has**: nothing extra
- **dev has**: `store_id` (FK to stores)
- **Reconciliation**: migration to add `store_id` to prod (nullable, FK to stores, ON DELETE SET NULL). The existing 1 prod project would have `store_id=NULL`.

### `vendors`
- **prod has**: `address`, `service_type`
- **dev has**: `client_id`, `trade`, `account_code` (per baseline migration)
- **Reconciliation**: prod has **0 vendors**, so this is actually free — replace prod's vendors table with the dev branch shape entirely. Migration: `DROP TABLE vendors; CREATE TABLE vendors (...);`
- **Or** keep both column sets and let the app code accommodate. Worse choice — pick the dev shape.

### `site_photos`
- **prod has**: `caption`, `updated_at`
- **dev has**: nothing extra
- **Decision needed**: dev app doesn't use captions today, but the dev branch *could* surface them with minimal effort. Keeping prod's columns and adding dev-side UI is probably the right call.

### `asset_photos`
- **prod has**: `caption`
- **dev has**: nothing extra
- **Same as site_photos.**

### `clients`, `users`, `regions`, `maintenance_schedules`
No drift detected.

---

## Storage policies

The 4 dev RLS migrations rewrote the storage policies under `storage.objects` for the `asset-photos`, `site-photos`, `job-attachments` buckets. These have been applied to cloud-dev but **not yet to prod**. When promoting dev → prod, the same 4 RLS migrations must run on prod (they're idempotent — `DROP POLICY IF EXISTS` then `CREATE POLICY`).

---

## Suggested promotion sequence (when ready)

1. **Decide each "Decision needed" item above** (keep / drop / migrate)
2. **Write one reconciliation migration** capturing those decisions, e.g. `20260601000000_prod_schema_alignment.sql`
3. **Test it against cloud-dev first** — apply, verify dev app still works, then `ROLLBACK` or restore from backup
4. **Apply to prod** in the PR that promotes dev → main
5. **Apply the 4 dev RLS migrations** to prod (`20260316000000`, `20260316100000`, `20260317000000`, `20260412000000`)
6. **Delete this file** once drift is resolved
