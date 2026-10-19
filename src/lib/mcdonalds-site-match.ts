type Customer = { id: string; name: string }
type Site = { id: string; name: string; client_id: string }
type ContactLink = { xero_contact_id: string; client_id: string; store_id: string | null }

export function mcdonaldsSiteKey(name: string) {
    return name.trim().toLocaleLowerCase("en-NZ")
        .replace(/^mc\s*donald['’]?s?\s*/i, "")
        .replace(/[^a-z0-9]/g, "")
}

/** Only one-to-one, exact-name matches may be linked without staff review. */
export function unambiguousMcDonaldsSiteLinks(
    genericClientId: string,
    customers: Customer[],
    sites: Site[],
    contacts: ContactLink[],
) {
    const genericSites = sites.filter((site) => site.client_id === genericClientId)
    const siteCounts = new Map<string, number>()
    const customerCounts = new Map<string, number>()
    const contactsByCustomer = new Map<string, ContactLink[]>()
    const ownedSiteCounts = new Map<string, number>()

    for (const site of genericSites) {
        const key = mcdonaldsSiteKey(site.name)
        siteCounts.set(key, (siteCounts.get(key) || 0) + 1)
    }
    for (const site of sites) {
        ownedSiteCounts.set(site.client_id, (ownedSiteCounts.get(site.client_id) || 0) + 1)
    }
    for (const customer of customers) {
        if (customer.id === genericClientId || !/^mc\s*donald/i.test(customer.name)) continue
        const key = mcdonaldsSiteKey(customer.name)
        customerCounts.set(key, (customerCounts.get(key) || 0) + 1)
    }
    for (const contact of contacts) {
        const list = contactsByCustomer.get(contact.client_id) || []
        list.push(contact)
        contactsByCustomer.set(contact.client_id, list)
    }

    return customers.flatMap((customer) => {
        if (customer.id === genericClientId || !/^mc\s*donald/i.test(customer.name)) return []
        const key = mcdonaldsSiteKey(customer.name)
        const links = contactsByCustomer.get(customer.id) || []
        if (!key || siteCounts.get(key) !== 1 || customerCounts.get(key) !== 1 ||
            ownedSiteCounts.has(customer.id) || links.length !== 1 || links[0].store_id) return []
        const site = genericSites.find((entry) => mcdonaldsSiteKey(entry.name) === key)!
        return [{ siteId: site.id, customerId: customer.id, contactId: links[0].xero_contact_id }]
    })
}
