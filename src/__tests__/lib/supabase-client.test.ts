import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock @supabase/ssr before importing the module under test
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({ from: vi.fn() })),
}))

describe('createClient', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should create a Supabase client when env vars are present', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

    const { createClient } = await import('@/lib/supabase/client')
    const client = createClient()
    expect(client).toBeDefined()
    expect(client).toHaveProperty('from')
  })

  it('should throw when env vars are missing in browser context', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    // jsdom sets typeof window !== 'undefined', simulating browser
    const { createClient } = await import('@/lib/supabase/client')
    expect(() => createClient()).toThrow('Supabase credentials missing')
  })
})
