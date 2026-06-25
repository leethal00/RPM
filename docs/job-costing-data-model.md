# Job Costing — Data Model (Draft v0.1)

Derived from Stu's 4 attachments: master quote template, Kennards pylon example,
Job card 2025, and Xero Quote QU-2708 / Invoice INV-6637. Pairs with
[job-costing-scope.md](job-costing-scope.md).

## The three layers (this is the key structure)

```
CATALOGUE            COSTING (internal BOM)          CUSTOMER-FACING        XERO
materials  ──────►   job_line_items (est)   ──roll──►  quote_items  ──push──►  Quote
(priced,   pick      grouped in sections               (sign S21,             │ approve
 coded)              cost/sell/margin per line          qty, unit price)      ▼
                          ▲                                              draft Invoice
                          │ compare                                     (INV number)
                     time_entries + material_actuals  ◄── job card ──────────┘
                     (ACTUALS)                            (number tied back)
```

The internal cost sheet is granular (every sheet of ACM, every hour). The customer only
sees summarised **sign items** (e.g. "1200mm Arch Logo Template – S21, qty 3 @ $285").
Many BOM lines roll up into one priced sign item.

## Line math (from the template formulas — identical on every line)

- `cost  = qty * unit_cost`            (E = C*D)
- `sell  = cost * (1 + markup)`        (G = E*(F+1)) — **markup is markup-on-cost**, stored as
  a decimal (0.5 = 50% markup → 33% margin)
- `margin = 1 - cost/sell`             (H)
- Section totals = Σcost, Σsell, margin recomputed
- Grand: `COST=Σsection costs`, `SELL=Σsection sells`, `Total Hours=Σ labour qty`,
  `ADJUSTED TOTAL` = **manual override** (e.g. 9572.11 → 9572), `Profit=adjusted-cost`,
  `Per Unit=adjusted/project_qty`
- Everything overridable (Stu's hard requirement): qty, unit_cost, markup per line; plus the
  adjusted total. Catalogue values are defaults copied onto the line, never live links.

## Tables

### `materials` (catalogue — ~250 common items, he'll add codes)
`id, code (nullable), description, supplier, unit, unit_cost, default_markup,
section, subsection, date_last_checked (nullable), check_note (text: 'Old'/'Guess'/
'Discontinued'/'Check if exists'), active`
- Search by **code OR description**.
- Labour lives here too (supplier='Rodier', unit_cost=hourly rate, markup ~0.1–0.2).
- Markup defaults observed: most materials 0.5; aluminium sheet 0.55; extrusions 0.6;
  freight 0.25; digital print 0.8; paint 0.2; LED modules/ribbon 1.0; labour 0.1–0.2.

### `costing_jobs` (the spine — client & site OPTIONAL) — NEW table, do NOT reuse `jobs`/`projects`
`id, title, client_id (nullable → clients), store_id (nullable → stores), reference,
quoted_by (→ users), qty, status (costing_status), adjusted_total (nullable override),
xero_quote_id, xero_quote_number, xero_invoice_number, folder_ref ('YY-MM-DD Title NNNN'),
created_at`

**Reconciliation decision (2026-06-25): build a NEW costing spine; do not overload existing
`jobs` or `projects`.** Reasons:
- RPM `jobs` = maintenance/fault tickets, `store_id` NOT NULL, asset/severity/map-marker
  semantics, 12 query sites. `projects` = "HQ Projects" groupings, store effectively required
  (list inner-joins stores). Neither models a make-to-order signage job.
- **Ad-hoc wholesale jobs have no client/store** — breaks both existing tables.
- **Confidentiality**: existing `jobs`/`projects` are client-visible via RLS (client_hq/
  client_store roles). Cost sheets carry supplier costs + margins → must be Rodier-internal.
- → New `costing_*` tables, own `costing_status` enum, **RLS limited to super_admin/
  rodier_admin**. Reuse `clients`/`stores`/`users`/`vendors` as optional FKs only.
- UI: a distinct top-level section (working name "Quoting"/"Workshop" — label TBD with Stu;
  "Projects"/"Jobs" are taken by the maintenance side).

### `job_line_items` (the internal BOM — estimated and actual)
`id, project_id, kind ('estimate'|'actual'), section, subsection, sort,
material_id (nullable — null = ad-hoc/manual line), description, supplier,
qty, unit_cost, markup, internal_note (text — shows on job card, NOT on invoice),
weight_kg (nullable — steel→galvanising auto-calc)`
- `cost/sell/margin` computed, not stored.

### `quote_items` (customer-facing sign lines → Xero)
`id, project_id, sign_code (S21…), name, qty, unit_price, size, details,
delivery ('ex-factory'|'freight'|'install'), sort`
- This is what becomes a Xero quote line. GST 15% applied by Xero.

### `time_entries` (actual labour — from job card HOURS table)
`id, project_id, work_date, person, hours, description, labour_type (nullable → maps to a
Factory/Install labour catalogue line for est-vs-actual)`

### `material_actuals` (actual materials — from job card Materials/Orders table)
`id, project_id, order_date, supplier, description, qty (nullable), cost (nullable),
material_id (nullable)`

## Section / subsection taxonomy (seed data from the template)

- **Materials**: ACM-Fabrication, ACM-FEVE, Acrylic Opal/Clear, Acrylic White/Black/Coloured,
  Polycarbonate, Multiboard, Aluminium Sheet, Aluminium Extrusions, Flexface, Vinyl, Fixings,
  Paint, Misc
- **Wiring-LED**: Modules, Transformers (with watts allowance calc), Misc (wire/controllers)
- **Labour**: Factory Time, Install Time
- **Pack/Despatch/Freight**: Powdercoating, Painting, Laser cutting, Guillotine/Presswork,
  Access, Galvanising, General

## Job card (auto-generated PDF — replaces Hugo's napkins)

Header: job number / invoice number, client, description, job manager, creation/due/
completion/invoiced dates. Department routing checkboxes (CNC, Metal, Fab, Electrical,
Vinyl, Install). Details + sketch area. **HOURS table** and **Materials/Orders table**
(blank for the floor to fill, or pre-seeded from the BOM). H&S "Take 5" risk block. Notes.
→ The two tables are the actuals funnel feeding est-vs-actual.

## Xero integration

- Org: **Rodier (AIS01)**; legal entity "Aisha Services Limited t/a Rodier", GST 104-408-745.
- OAuth2 connection. Push `quote_items` → Xero **Quote** (Reference = project title/ref).
- On approval: Xero creates **draft Invoice**, assigns INV number → store back on project.
  Quote→invoice is a straight pass-through (INV-6637 == QU-2708 line-for-line).
- We do NOT build invoicing, payments, or POs (job/invoice number is the purchase ref).
