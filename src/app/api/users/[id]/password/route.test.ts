import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
    actor: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role: 'super_admin' } as { id: string; role: string } | null,
    targetExists: true,
    authEmail: 'selected@example.com',
    updateUserById: vi.fn(),
    resetPasswordForEmail: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: state.actor ? { id: state.actor.id } : null }, error: null }) },
        from: () => ({ select: () => ({ eq: (_field: string, id: string) => ({
            single: async () => id === state.actor?.id
                ? { data: { role: state.actor.role }, error: null }
                : { data: state.targetExists ? { id } : null, error: state.targetExists ? null : new Error('Missing') },
        }) }) }),
    }),
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: (_url: string, key: string) => key === 'service-key'
        ? { auth: { admin: {
            getUserById: async () => ({ data: { user: { email: state.authEmail } }, error: null }),
            updateUserById: state.updateUserById,
        } } }
        : { auth: { resetPasswordForEmail: state.resetPasswordForEmail } },
}))

import { POST } from './route'

const targetId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const context = { params: Promise.resolve({ id: targetId }) }
const send = (body: object) => POST(new NextRequest(`https://rpm.example/api/users/${targetId}/password`, {
    method: 'POST', body: JSON.stringify(body),
}), context)

describe('admin password management', () => {
    beforeEach(() => {
        state.actor = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role: 'super_admin' }
        state.targetExists = true
        state.authEmail = 'selected@example.com'
        state.updateUserById.mockReset().mockResolvedValue({ error: null })
        state.resetPasswordForEmail.mockReset().mockResolvedValue({ error: null })
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example')
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key')
    })

    it('sets the selected auth password without changing profile fields', async () => {
        const response = await send({ action: 'set', password: 'SecurePass123', confirmPassword: 'SecurePass123' })
        expect(response.status).toBe(200)
        expect(state.updateUserById).toHaveBeenCalledWith(targetId, { password: 'SecurePass123' })
        expect(state.resetPasswordForEmail).not.toHaveBeenCalled()
    })

    it('rejects weak and mismatched passwords before contacting Auth', async () => {
        expect((await send({ action: 'set', password: 'short', confirmPassword: 'short' })).status).toBe(400)
        expect((await send({ action: 'set', password: 'SecurePass123', confirmPassword: 'DifferentPass123' })).status).toBe(400)
        expect(state.updateUserById).not.toHaveBeenCalled()
    })

    it('emails the selected auth address through Supabase recovery', async () => {
        const response = await send({ action: 'email', email: 'attacker@example.com' })
        expect(response.status).toBe(200)
        expect(state.resetPasswordForEmail).toHaveBeenCalledWith('selected@example.com', {
            redirectTo: 'https://rpm.example/reset-password',
        })
    })

    it('denies non-admins and unauthenticated callers', async () => {
        state.actor = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role: 'rodier_admin' }
        expect((await send({ action: 'email' })).status).toBe(403)
        state.actor = null
        expect((await send({ action: 'set', password: 'SecurePass123', confirmPassword: 'SecurePass123' })).status).toBe(401)
        expect(state.updateUserById).not.toHaveBeenCalled()
        expect(state.resetPasswordForEmail).not.toHaveBeenCalled()
    })

    it('reports provider errors', async () => {
        state.updateUserById.mockResolvedValue({ error: new Error('Auth rejected password') })
        expect((await send({ action: 'set', password: 'SecurePass123', confirmPassword: 'SecurePass123' })).status).toBe(502)
        state.resetPasswordForEmail.mockResolvedValue({ error: new Error('Mail limit reached') })
        expect((await send({ action: 'email' })).status).toBe(502)
    })
})
