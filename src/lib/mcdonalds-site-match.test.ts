import { describe, expect, it } from "vitest"
import { unambiguousMcDonaldsSiteLinks } from "./mcdonalds-site-match"

describe("McDonalds site reconciliation", () => {
    const customer = { id: "oamaru-customer", name: "McDonalds Oamaru" }
    const site = { id: "oamaru-site", name: "Oamaru", client_id: "generic" }
    const contact = { xero_contact_id: "xero-oamaru", client_id: customer.id, store_id: null }

    it("reuses a uniquely matching physical site for its Xero customer", () => {
        expect(unambiguousMcDonaldsSiteLinks("generic", [customer], [site], [contact]))
            .toEqual([{ siteId: site.id, customerId: customer.id, contactId: contact.xero_contact_id }])
    })

    it("leaves ambiguous and already owned sites for review", () => {
        expect(unambiguousMcDonaldsSiteLinks("generic",
            [customer, { id: "another", name: "McDonald's Oamaru" }], [site], [contact])).toEqual([])
        expect(unambiguousMcDonaldsSiteLinks("generic", [customer],
            [site, { id: "existing", name: "Oamaru", client_id: customer.id }], [contact])).toEqual([])
        expect(unambiguousMcDonaldsSiteLinks("generic", [customer], [site],
            [{ ...contact, store_id: "elsewhere" }])).toEqual([])
    })
})
