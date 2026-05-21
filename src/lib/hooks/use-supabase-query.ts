import useSWR, { SWRConfiguration } from "swr"

export function useSupabaseQuery<T>(
  key: string | null,
  query: () => Promise<{ data: T | null; error: unknown }>,
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
      // Show the previous result while a new one is fetching. Filter
      // changes (e.g. flipping the customer dropdown) update in-place
      // instead of flashing to skeleton on every keystroke.
      keepPreviousData: true,
      ...config,
    }
  )
}
