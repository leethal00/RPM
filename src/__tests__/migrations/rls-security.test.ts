import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../supabase/migrations/20260317000000_fix_rls_security.sql'
)

describe('RLS Security Migration (20260317000000)', () => {
  let sql: string

  beforeAll(() => {
    sql = fs.readFileSync(MIGRATION_PATH, 'utf-8')
  })

  describe('get_my_client_id() function', () => {
    it('should create get_my_client_id as SECURITY DEFINER', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_my_client_id()')
      expect(sql).toContain('SECURITY DEFINER')
    })

    it('should set search_path to public for security', () => {
      expect(sql).toContain('SET search_path = public')
    })

    it('should query users table by auth.uid()', () => {
      expect(sql).toContain('SELECT client_id FROM users WHERE id = auth.uid()')
    })

    it('should be marked as STABLE (no side effects)', () => {
      expect(sql).toContain('STABLE')
    })

    it('should grant execute to authenticated role', () => {
      expect(sql).toContain(
        'GRANT EXECUTE ON FUNCTION public.get_my_client_id() TO authenticated'
      )
    })
  })

  describe('client isolation policies use get_my_client_id()', () => {
    it('should update client_hq_view on clients table', () => {
      expect(sql).toContain('DROP POLICY IF EXISTS "client_hq_view" ON clients')
      expect(sql).toContain(
        'CREATE POLICY "client_hq_view" ON clients FOR SELECT USING'
      )
      // Must use get_my_client_id() not a JOIN through users
      expect(sql).toMatch(
        /CREATE POLICY "client_hq_view" ON clients FOR SELECT USING\s*\(\s*id = public\.get_my_client_id\(\)/
      )
    })

    it('should update client_isolation_stores on stores table', () => {
      expect(sql).toContain('DROP POLICY IF EXISTS "client_isolation_stores" ON stores')
      expect(sql).toMatch(
        /CREATE POLICY "client_isolation_stores" ON stores FOR SELECT USING\s*\(\s*client_id = public\.get_my_client_id\(\)/
      )
    })

    it('should update client_isolation_assets on assets table', () => {
      expect(sql).toContain('DROP POLICY IF EXISTS "client_isolation_assets" ON assets')
      expect(sql).toMatch(
        /client_isolation_assets.*FOR SELECT.*stores\.client_id = public\.get_my_client_id\(\)/s
      )
    })

    it('should update client_isolation_jobs on jobs table', () => {
      expect(sql).toContain('DROP POLICY IF EXISTS "client_isolation_jobs" ON jobs')
      expect(sql).toMatch(
        /client_isolation_jobs.*FOR SELECT.*stores\.client_id = public\.get_my_client_id\(\)/s
      )
    })

    it('should NOT join through users table in any client isolation policy', () => {
      // After the function definition, no policy should reference users table
      const afterFunction = sql.split('Step 2')[1] || ''
      // Policies should not JOIN users - that's the whole point of get_my_client_id()
      expect(afterFunction).not.toMatch(
        /CREATE POLICY.*USING\s*\([^)]*JOIN users/s
      )
    })
  })

  describe('vendors policies', () => {
    it('should have admin FOR ALL policy', () => {
      expect(sql).toContain('CREATE POLICY "admin_all_vendors" ON vendors FOR ALL')
    })

    it('should have client view policy using get_my_client_id()', () => {
      expect(sql).toMatch(
        /client_view_vendors.*FOR SELECT.*client_id = public\.get_my_client_id\(\)/s
      )
    })
  })

  describe('projects policies', () => {
    it('should have admin FOR ALL policy', () => {
      expect(sql).toContain('CREATE POLICY "admin_all_projects" ON projects FOR ALL')
    })

    it('should have client view policy through stores', () => {
      expect(sql).toMatch(
        /client_view_projects.*FOR SELECT.*stores\.client_id = public\.get_my_client_id\(\)/s
      )
    })
  })

  describe('regions policies (catalog table)', () => {
    it('should allow all authenticated users to SELECT', () => {
      expect(sql).toMatch(
        /CREATE POLICY "regions_select" ON regions FOR SELECT USING\s*\(\s*auth\.role\(\) = 'authenticated'/
      )
    })

    it('should have admin FOR ALL policy', () => {
      expect(sql).toContain('CREATE POLICY "admin_all_regions" ON regions FOR ALL')
    })
  })

  describe('photo table policies', () => {
    it('should have separate INSERT and DELETE policies for site_photos (no UPDATE)', () => {
      expect(sql).toContain('client_insert_site_photos')
      expect(sql).toContain('client_delete_site_photos')
      // No UPDATE policy for photos
      expect(sql).not.toMatch(/client_update_site_photos/)
    })

    it('should have separate INSERT and DELETE policies for asset_photos (no UPDATE)', () => {
      expect(sql).toContain('client_insert_asset_photos')
      expect(sql).toContain('client_delete_asset_photos')
      expect(sql).not.toMatch(/client_update_asset_photos/)
    })

    it('should revoke UPDATE on photo tables', () => {
      expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE ON site_photos FROM authenticated')
      expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE ON asset_photos FROM authenticated')
    })

    it('should re-grant only SELECT, INSERT, DELETE on photo tables', () => {
      expect(sql).toContain('GRANT SELECT, INSERT, DELETE ON site_photos TO authenticated')
      expect(sql).toContain('GRANT SELECT, INSERT, DELETE ON asset_photos TO authenticated')
    })
  })

  describe('maintenance_schedules policies', () => {
    it('should have admin FOR ALL policy', () => {
      expect(sql).toContain(
        'CREATE POLICY "admin_all_maintenance_schedules" ON maintenance_schedules FOR ALL'
      )
    })

    it('should have client view policy through assets->stores', () => {
      expect(sql).toMatch(
        /client_view_maintenance_schedules.*FOR SELECT.*assets\.id = maintenance_schedules\.asset_id.*stores\.client_id = public\.get_my_client_id\(\)/s
      )
    })
  })

  describe('asset_types RLS', () => {
    it('should enable RLS on asset_types', () => {
      expect(sql).toContain('ALTER TABLE asset_types ENABLE ROW LEVEL SECURITY')
    })

    it('should allow authenticated users to SELECT', () => {
      expect(sql).toContain('CREATE POLICY "asset_types_select" ON asset_types FOR SELECT')
    })

    it('should have admin FOR ALL policy', () => {
      expect(sql).toContain('CREATE POLICY "admin_all_asset_types" ON asset_types FOR ALL')
    })
  })

  describe('job INSERT policy for non-admins', () => {
    it('should allow authenticated users to INSERT jobs within their client', () => {
      expect(sql).toContain('CREATE POLICY "authenticated_insert_jobs" ON jobs FOR INSERT')
      expect(sql).toMatch(
        /authenticated_insert_jobs.*WITH CHECK.*auth\.role\(\) = 'authenticated'.*stores\.client_id = public\.get_my_client_id\(\)/s
      )
    })
  })
})
