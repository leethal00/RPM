export function siteDisplayName(name: string, customerName: string): string {
    if (!/^mcdonald(?:'|’)?s$/i.test(customerName.trim())) return name
    return name.replace(/^mcdonald(?:'|’)?s\b[\s:–—-]*/i, "").trim() || name
}

export function normalizedSiteName(name: string, customerName: string): string {
    return siteDisplayName(name, customerName).trim().replace(/\s+/g, " ").toLocaleLowerCase()
}

export function nameForCustomerSite(name: string, customerName: string): string {
    const trimmed = name.trim()
    if (!/^mcdonald(?:'|’)?s(?:\b|$)/i.test(customerName.trim())) return trimmed
    const siteName = trimmed.replace(/^mcdonald(?:'|’)?s(?:\b|$)[\s:–—-]*/i, "").trim()
    return siteName ? `McDonalds ${siteName}` : "McDonalds"
}

const siteNameCollator = new Intl.Collator("en-NZ", { sensitivity: "base", numeric: true })

export function sortSitesByDisplayName<T extends { name: string }>(sites: T[], customerName: string): T[] {
    return [...sites].sort((a, b) => siteNameCollator.compare(
        siteDisplayName(a.name, customerName),
        siteDisplayName(b.name, customerName),
    ))
}

