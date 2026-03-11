# RPM Database Migration Guide

This guide explains how to manage database migrations across production and development Supabase environments.

## Overview

The RPM application uses Supabase migrations to track schema changes. All migration files are stored in `/supabase/migrations/` and are applied in chronological order based on their timestamp prefix.

## Migration Files

Current migrations in order:

1. **20240304000000_initial_schema.sql** - Base schema with core tables (clients, users, stores, assets, jobs, asset_types)
2. **20240305000000_add_extended_tables.sql** - Extended tables and columns (vendors, projects, regions, photos, maintenance_schedules)
3. **20240306000000_setup_storage.sql** - Storage buckets and policies (job-attachments, site-photos, asset-photos)

## Syncing Schema from Production to Dev

### Method 1: Using Supabase Dashboard (Recommended for Initial Setup)

#### Step 1: Apply Migrations to Dev Database

1. Open your **rpm-dev** Supabase project dashboard
2. Navigate to **SQL Editor**
3. Apply migrations in order:

   **Migration 1: Initial Schema**
   ```sql
   -- Copy and paste contents of supabase/migrations/20240304000000_initial_schema.sql
   -- Then click "Run"
   ```

   **Migration 2: Extended Tables**
   ```sql
   -- Copy and paste contents of supabase/migrations/20240305000000_add_extended_tables.sql
   -- Then click "Run"
   ```

   **Migration 3: Storage Setup**
   ```sql
   -- Copy and paste contents of supabase/migrations/20240306000000_setup_storage.sql
   -- Then click "Run"
   ```

4. Verify tables were created:
   ```sql
   SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public'
   ORDER BY table_name;
   ```

   You should see: assets, asset_photos, asset_types, clients, jobs, maintenance_schedules, projects, regions, site_photos, stores, users, vendors

#### Step 2: Seed Development Data

Run the seed script to populate dev with test data:

```bash
NEXT_PUBLIC_SUPABASE_URL=<your-dev-supabase-url> \
SUPABASE_SERVICE_ROLE_KEY=<your-dev-service-role-key> \
npx tsx scripts/seed-dev.ts
```

This will create:
- 3 clients (St Pierre's, Bento Bowl, K10)
- 8 asset types
- 8 regions across NZ
- 7 stores with varied configurations
- 4 vendors
- ~20 assets across stores
- 2 HQ projects
- Maintenance schedules

---

### Method 2: Using Supabase CLI (For Future Migrations)

If you have Supabase CLI installed:

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Link to your dev project
supabase link --project-ref jtotzntmndxanhjijqcz

# Apply all pending migrations
supabase db push

# Or apply a specific migration
supabase db push --include-all
```

---

## Creating New Migrations

When you need to make schema changes:

### 1. Create a New Migration File

```bash
# Create a new timestamped migration file
touch supabase/migrations/$(date +%Y%m%d%H%M%S)_descriptive_name.sql
```

Example: `20260315120000_add_qr_codes_to_assets.sql`

### 2. Write Your Migration

```sql
-- Add new column
ALTER TABLE assets ADD COLUMN IF NOT EXISTS qr_code TEXT;

-- Create index
CREATE INDEX IF NOT EXISTS idx_assets_qr_code ON assets(qr_code);
```

**Important Rules:**
- ✅ Always use `IF NOT EXISTS` / `IF EXISTS` for idempotency
- ✅ Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for new columns
- ✅ Include rollback comments for complex changes
- ❌ Never drop columns in production (mark deprecated instead)
- ❌ Never rename tables/columns without migration strategy

### 3. Test in Dev First

```bash
# Apply to dev database
NEXT_PUBLIC_SUPABASE_URL=<your-dev-supabase-url> \
SUPABASE_SERVICE_ROLE_KEY=<your-dev-service-role-key> \
supabase db push
```

Or manually via dev SQL Editor.

### 4. Commit and Deploy

```bash
git add supabase/migrations/
git commit -m "feat: add qr codes to assets"
git push origin dev

# After testing in dev, merge to main for production
```

### 5. Apply to Production

Once merged to `main`, manually apply the migration to production:

1. Open **rpm-prod** Supabase dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the new migration SQL
4. Review carefully
5. Click **Run**

**⚠️ IMPORTANT:** Always test migrations in dev before applying to production!

---

## Migration Workflow Summary

```
┌─────────────────────────────────────────────────────────┐
│ Development Workflow                                    │
└─────────────────────────────────────────────────────────┘

1. Create new migration file locally
   └─> supabase/migrations/YYYYMMDDHHMMSS_description.sql

2. Apply to dev database (rpm-dev)
   └─> Test in dev Supabase SQL Editor

3. Test with dev application
   └─> Verify changes work with app code

4. Commit to git
   └─> git add supabase/migrations/
   └─> git commit -m "feat: description"
   └─> git push origin dev

5. Merge to main after testing
   └─> Create PR from dev → main
   └─> Review and merge

6. Apply to production (rpm-prod)
   └─> Manually run migration in prod SQL Editor
   └─> Verify in production app
```

---

## Keeping Environments in Sync

### Regular Sync Tasks

**Weekly (or after major schema changes):**
1. Verify dev schema matches production:
   ```sql
   -- Run in both dev and prod SQL Editor
   SELECT
     table_name,
     column_name,
     data_type,
     is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public'
   ORDER BY table_name, ordinal_position;
   ```

2. Compare results
3. Apply any missing migrations

**Before each feature development:**
1. Ensure dev has latest schema from production
2. Refresh dev seed data if needed:
   ```bash
   # Clear dev database (careful!)
   # Then re-run seed script
   npx tsx scripts/seed-dev.ts
   ```

---

## Troubleshooting

### Migration fails with "already exists" error
- Migration is not idempotent
- Add `IF NOT EXISTS` / `IF EXISTS` clauses
- Check if migration was partially applied

### Dev database out of sync with production
1. Export production schema:
   ```bash
   # Using Supabase CLI
   supabase db dump --project-ref ywjwqxrrnmqlhvqdfvua > prod_schema.sql
   ```

2. Compare with dev schema
3. Create new migration to fix differences

### Need to rollback a migration
- Supabase doesn't support automatic rollback
- Create a new migration that reverses the changes:
  ```sql
  -- Example rollback migration
  ALTER TABLE assets DROP COLUMN IF EXISTS qr_code;
  ```

---

## Best Practices

✅ **DO:**
- Test all migrations in dev first
- Use descriptive migration filenames
- Make migrations idempotent (can run multiple times safely)
- Include comments explaining complex changes
- Keep migrations small and focused
- Version control all migrations

❌ **DON'T:**
- Apply untested migrations to production
- Modify existing migration files after they've been applied
- Drop columns or tables without data migration plan
- Skip dev testing
- Make breaking changes without coordination

---

## Emergency Procedures

### If a migration breaks production:

1. **Assess damage:**
   - Check error logs in Vercel
   - Check Supabase logs
   - Identify affected tables/columns

2. **Quick fix options:**
   - Rollback deployment in Vercel (revert to previous commit)
   - Create emergency migration to fix issue
   - Restore from Supabase backup if critical

3. **Communication:**
   - Notify team immediately
   - Document incident
   - Update migration guide with lessons learned

### Supabase Backups

**Production backups:**
- Daily automatic backups (Supabase Pro plan)
- Point-in-time recovery available
- Access: Supabase Dashboard → Database → Backups

**Dev backups:**
- Not critical (can re-seed)
- Manual backup before major changes:
  ```bash
  supabase db dump > backup_$(date +%Y%m%d).sql
  ```

---

## Related Files

- `/supabase/migrations/*.sql` - All migration files
- `/scripts/seed-dev.ts` - Development seed data
- `/scripts/seed.ts` - Original minimal seed script
- `/scripts/setup-storage.ts` - Storage bucket setup (deprecated, now in migration)
- `/scripts/maintenance-schema.ts` - Maintenance table setup (deprecated, now in migration)

---

## Questions?

For migration help, consult:
1. This guide
2. Supabase docs: https://supabase.com/docs/guides/cli/local-development
3. Team lead or database administrator
