"use client"

import useSWR, { type SWRConfiguration, type KeyedMutator } from "swr"
import { useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import type { SupabaseClient } from "@supabase/supabase-js"

type SupabaseQueryBuilder = (client: SupabaseClient) => PromiseLike<{ data: unknown; error: unknown; count?: number | null }>

interface UseSupabaseQueryResult<T> {
  data: T | undefined
  count: number | null
  error: unknown
  isLoading: boolean
  isValidating: boolean
  mutate: KeyedMutator<{ data: T; count: number | null }>
}

export function useSupabaseQuery<T = unknown>(
  key: string | readonly unknown[] | null,
  queryFn: SupabaseQueryBuilder,
  config?: SWRConfiguration
): UseSupabaseQueryResult<T> {
  const supabase = useMemo(() => createClient(), [])

  const { data: result, error: swrError, isLoading, isValidating, mutate } = useSWR(
    key,
    async () => {
      const { data, error, count } = await queryFn(supabase)
      if (error) throw error
      return { data: data as T, count: count ?? null }
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 2000,
      ...config,
    }
  )

  return {
    data: result?.data,
    count: result?.count ?? null,
    error: swrError,
    isLoading,
    isValidating,
    mutate,
  }
}
