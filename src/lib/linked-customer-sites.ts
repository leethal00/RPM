export async function linkedCustomerSiteIds(clientId: string): Promise<string[]> {
  try {
    const response = await fetch(`/api/customer-sites?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" })
    if (!response.ok) return []
    const body = await response.json() as { siteIds?: string[] }
    return Array.isArray(body.siteIds) ? body.siteIds : []
  } catch {
    return []
  }
}

export function customerSiteFilter(clientId: string, linkedSiteIds: string[]) {
  return linkedSiteIds.length
    ? `client_id.eq.${clientId},id.in.(${linkedSiteIds.join(",")})`
    : `client_id.eq.${clientId}`
}
