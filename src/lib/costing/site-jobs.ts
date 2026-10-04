import type { SupabaseClient } from "@supabase/supabase-js"

export type SiteCostingJob = {
    id: string
    title: string
    production_title: string | null
    job_number: string | null
    status: string
    created_at: string
    client_name: string | null
    can_open_job: boolean
}

export async function loadSiteCostingJobs(supabase: SupabaseClient, storeId: string): Promise<SiteCostingJob[]> {
    const { data, error } = await supabase.rpc("site_costing_jobs", { p_store_id: storeId })
    if (error) throw error
    return (data || []) as SiteCostingJob[]
}
