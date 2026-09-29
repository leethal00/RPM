import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const state = vi.hoisted(() => ({
    code: null as string | null,
    setSession: vi.fn(),
    exchangeCodeForSession: vi.fn(),
}))

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    useSearchParams: () => ({ get: () => state.code }),
}))
vi.mock('@/lib/supabase/client', () => ({
    createClient: () => ({ auth: {
        setSession: state.setSession,
        exchangeCodeForSession: state.exchangeCodeForSession,
    } }),
}))

import ResetPasswordPage from './page'

describe('password recovery link', () => {
    beforeEach(() => {
        state.code = null
        state.setSession.mockReset().mockResolvedValue({ error: null })
        state.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null })
        window.history.replaceState(null, '', '/reset-password')
    })
    afterEach(() => window.history.replaceState(null, '', '/reset-password'))

    it('accepts an implicit recovery link sent by an administrator', async () => {
        window.location.hash = '#access_token=access&refresh_token=refresh&type=recovery'
        render(<ResetPasswordPage />)
        await waitFor(() => expect(state.setSession).toHaveBeenCalledWith({ access_token: 'access', refresh_token: 'refresh' }))
        expect(screen.getByLabelText('New Password')).toBeEnabled()
        expect(window.location.hash).toBe('')
    })

    it('keeps the existing PKCE recovery link working', async () => {
        state.code = 'recovery-code'
        render(<ResetPasswordPage />)
        await waitFor(() => expect(state.exchangeCodeForSession).toHaveBeenCalledWith('recovery-code'))
        expect(screen.getByLabelText('New Password')).toBeEnabled()
    })
})
