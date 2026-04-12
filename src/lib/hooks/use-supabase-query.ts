import useSWR, { type SWRConfiguration } from 'swr'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export function useSupabaseQuery<T>(
  key: string | null,
  query: () => Promise<{ data: T | null; error: any }>,
  config?: SWRConfiguration
) {
  return useSWR<T>(
    key,
    async () => {
      const { data, error } = await query()
      if (error) throw error
      return data as T
    },
    config
  )
}

export { supabase }
