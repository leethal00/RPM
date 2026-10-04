export type LinkedJobSite = {
    store_id: string
    sort: number
    stores: { id: string; name: string; address?: string | null } | null
}

type JobWithSites = {
    store_id?: string | null
    stores?: { name?: string | null; address?: string | null } | null
    costing_job_sites?: LinkedJobSite[]
}

export function jobSites(job: JobWithSites) {
    const sites = (job.costing_job_sites || []).slice().sort((a, b) => a.sort - b.sort)
        .flatMap((link) => link.stores ? [{ id: link.store_id, name: link.stores.name, address: link.stores.address }] : [])
    if (job.store_id && !sites.some((site) => site.id === job.store_id)) {
        sites.unshift({ id: job.store_id, name: job.stores?.name || "Site", address: job.stores?.address })
    }
    return sites
}

export function jobSiteNames(job: JobWithSites) {
    return jobSites(job).map((site) => site.name).join("; ") || "Manufacture only / No site"
}
