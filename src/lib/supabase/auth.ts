import { createClient } from './server'

export type UserRole = 'super_admin' | 'rodier_admin' | 'technician' | 'client_hq' | 'client_store'

export async function getUserRole() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const { data, error } = await supabase
        .from('users')
        .select('role, client_id')
        .eq('id', user.id)
        .single()

    if (error || !data) return null

    return {
        role: data.role as UserRole,
        clientId: data.client_id,
    }
}

export async function isAdmin() {
    const roleData = await getUserRole()
    return roleData?.role === 'super_admin' || roleData?.role === 'rodier_admin'
}
