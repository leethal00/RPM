# McDonalds customer and site reconciliation — 19 October 2026

The first CSV records all 176 sites that belonged to the generic `Mcdonalds` customer before the change. Matching removed the McDonalds prefix and punctuation from site and customer names. A site was moved only when there was exactly one matching customer, exactly one linked Xero contact, no existing site owned by that customer, and no conflicting contact-to-site link.

| Result | Sites |
| --- | ---: |
| Reassigned to their existing site-specific Xero customer | 115 |
| Left with the generic customer for review | 61 |
| Total original generic sites | 176 |

The 115 existing `stores.id` values were retained. Their Xero contact links now point to those same site IDs. Existing quotes and jobs kept their billing customer, including the Coates Signco projects at McDonalds locations. The existing `sales@rodier.co.nz` HQ test profile retained visibility to the original 176 sites through its site portfolio. No Lina Tere account or access was created.

The second CSV lists the 61 remaining sites and the nearest Xero-linked customer names as review suggestions. These are **not approved matches**. Thames has two similarly named RPM customers. Verify each suggestion against Xero's contact ID and site address before moving its site. Do not create another physical site to resolve a customer match.

Files:

- `mcdonalds-site-customer-review-2026-10-19.csv` — before-change mapping, proposed exact matches, existing job counts.
- `mcdonalds-sites-needing-review-2026-10-19.csv` — remaining sites, addresses, and candidate customers.
