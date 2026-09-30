import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
    role: 'super_admin',
    signedIn: true,
    availableJobs: [{ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }],
    invite: vi.fn(),
    insertProfile: vi.fn(),
    insertAssignments: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: state.signedIn ? { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } : null }, error: null }) },
        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: state.role }, error: null }) }) }) }),
    }),
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({
        auth: { admin: {
            inviteUserByEmail: state.invite,
            deleteUser: vi.fn(),
        } },
        from: (table: string) => {
            if (table === 'costing_jobs') {
                const query = { in: vi.fn(), eq: vi.fn() }
                query.in.mockReturnValueOnce(query).mockResolvedValueOnce({ data: state.availableJobs, error: null })
                query.eq.mockReturnValue(query)
                return { select: () => query }
            }
            if (table === 'users') return { insert: state.insertProfile, delete: () => ({ eq: vi.fn() }) }
            return { insert: state.insertAssignments }
        },
    }),
}))

import { POST } from './route'

const jobId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const send = (body: object, origin = 'https://rpm.example') => POST(new NextRequest('https://rpm.example/api/users/invite', {
    method: 'POST', headers: { origin }, body: JSON.stringify(body),
}))

describe('subcontractor invitation', () => {
    beforeEach(() => {
        state.role = 'super_admin'
        state.signedIn = true
        state.availableJobs = [{ id: jobId }]
        state.invite.mockReset().mockResolvedValue({ data: { user: { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc' } }, error: null })
        state.insertProfile.mockReset().mockResolvedValue({ error: null })
        state.insertAssignments.mockReset().mockResolvedValue({ error: null })
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example')
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key')
    })

    it('denies installers and requests from another origin before sending mail', async () => {
        state.role = 'installer'
        expect((await send({ email: 'sean@example.com', name: 'Sean', jobIds: [jobId] })).status).toBe(403)
        state.role = 'super_admin'
        expect((await send({ email: 'sean@example.com', name: 'Sean', jobIds: [jobId] }, 'https://elsewhere.example')).status).toBe(403)
        expect(state.invite).not.toHaveBeenCalled()
    })

    it('does not invite someone to an unavailable job', async () => {
        state.availableJobs = []
        expect((await send({ email: 'sean@example.com', name: 'Sean', jobIds: [jobId] })).status).toBe(400)
        expect(state.invite).not.toHaveBeenCalled()
    })

    it('sends the invite and saves only the requested assigned job', async () => {
        const response = await send({ email: 'Sean@Example.com', name: 'Sean', jobIds: [jobId] })
        expect(response.status).toBe(200)
        expect(state.invite).toHaveBeenCalledWith('sean@example.com', {
            data: { name: 'Sean' }, redirectTo: 'https://rpm.example/reset-password',
        })
        expect(state.insertProfile).toHaveBeenCalledWith(expect.objectContaining({
            role: 'installer', is_subcontractor: true, installer_all_jobs: false,
        }))
        expect(state.insertAssignments).toHaveBeenCalledWith([{ job_id: jobId, user_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc' }])
    })
})
