export function siteDisplayName(name: string, customerName: string): string {
    if (!/^mcdonald(?:'|’)?s$/i.test(customerName.trim())) return name
    return name.replace(/^mcdonald(?:'|’)?s\b[\s:–—-]*/i, "").trim() || name
}

export function normalizedSiteName(name: string, customerName: string): string {
    return siteDisplayName(name, customerName).trim().replace(/\s+/g, " ").toLocaleLowerCase()
}
