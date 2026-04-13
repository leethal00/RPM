import useSWR, { SWRConfiguration } from "swr"

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
    {
      revalidateOnFocus: false,
      ...config,
    }
  )
}
