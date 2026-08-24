import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the server client
const mockSingle = vi.fn()
const mockEq = vi.fn(() => ({ single: mockSingle }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ select: mockSelect }))
const mockGetUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

describe('auth helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getUserRole', () => {
    it('should return null when no user is authenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const { getUserRole } = await import('@/lib/supabase/auth')
      const result = await getUserRole()
      expect(result).toBeNull()
    })

    it('should return role and clientId for authenticated user', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      })
      mockSingle.mockResolvedValue({
        data: { role: 'client_hq', client_id: 'client-456' },
        error: null,
      })

      const { getUserRole } = await import('@/lib/supabase/auth')
      const result = await getUserRole()

      expect(result).toEqual({
        role: 'client_hq',
        clientId: 'client-456',
      })
      expect(mockFrom).toHaveBeenCalledWith('users')
      expect(mockSelect).toHaveBeenCalledWith('role, client_id')
      expect(mockEq).toHaveBeenCalledWith('id', 'user-123')
    })

    it('should return null on database error', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      })
      mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'not found' },
      })

      const { getUserRole } = await import('@/lib/supabase/auth')
      const result = await getUserRole()
      expect(result).toBeNull()
    })
  })

  describe('isAdmin', () => {
    it('should return true for super_admin', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      })
      mockSingle.mockResolvedValue({
        data: { role: 'super_admin', client_id: null },
        error: null,
      })

      const { isAdmin } = await import('@/lib/supabase/auth')
      const result = await isAdmin()
      expect(result).toBe(true)
    })

    it('should return true for rodier_admin', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      })
      mockSingle.mockResolvedValue({
        data: { role: 'rodier_admin', client_id: 'client-456' },
        error: null,
      })

      const { isAdmin } = await import('@/lib/supabase/auth')
      const result = await isAdmin()
      expect(result).toBe(true)
    })

    it('should return false for non-admin roles', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
      })
      mockSingle.mockResolvedValue({
        data: { role: 'client_store', client_id: 'client-456' },
        error: null,
      })

      const { isAdmin } = await import('@/lib/supabase/auth')
      const result = await isAdmin()
      expect(result).toBe(false)
    })

    it('should return false when no user is authenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const { isAdmin } = await import('@/lib/supabase/auth')
      const result = await isAdmin()
      expect(result).toBe(false)
    })
  })
})
