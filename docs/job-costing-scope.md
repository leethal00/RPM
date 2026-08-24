# Job Costing & BOM — Scope (Draft v0.3)

Source: Stu Jones (GM, Rodier) process email + Messenger Q&A, 25 Jun 2026. Rodier = signage
manufacturer, Albany, Auckland NZ. Projects = one sign or many; collected ex-factory,
freighted, or installed. Xero org = **Rodier (AIS01)**.

**Goal:** give Rodier a lean costing / BOM / job-card layer on top of RPM that feeds Xero —
so they can see **estimated vs. actual** materials & labour and know each project made profit.
Deliberately simpler than Ostendo (the system Stu used before and is benchmarking against).

## 0. The one thing that matters

> *"The big thing I'd like to see is a way of seeing our estimated vs proposed BOM / labour
> times… That way we know we are actually making profit."* — Stu

Everything below exists to serve that comparison. If we nail estimated-vs-actual, we win.

## 0a. Design principles (from Stu's Q&A — non-negotiable)

- **Override everything.** *"The ability to override all costs and margins would be great."*
  Every line's cost, sell price, and margin is editable. Catalogue prices are defaults, not
  locks. Labour rates flex per client (he charges difficult/low-volume clients more).
- **Project is the spine; client + site are optional.** Lots of ad-hoc/wholesale work has no
  known end client (*"make a lightbox… no idea where it's going"* → `26-06-25 Lightbox 1234`).
  So `client_id` and `site_id` are nullable; a project can stand alone with just title + number.
- **Find items by code OR description.** Codes are hard to remember; search must hit both.
- **No approval gate now.** 3 people quote and self-approve. (Future: optional "over $X → senior
  approval", as Ostendo had. Backlog.)
- **Revisions = snapshots.** Stu saves Rev1/Rev2 quote PDFs to the drive; Xero holds the latest.
  We keep BOM version snapshots; no heavy versioning workflow.

## 1. Xero stays the system of record — we do NOT build invoicing

Quotes and invoices live in **Xero**. Our app produces the **costing + BOM + job card +
actuals**, and feeds totals to Xero. The Xero number flows back as the project reference.

```
cost sheets (Manufacture / Install / Travel)  ──►  totals → Xero QUOTE
   │  (BOM lines from a priced master table)             │
 our app                                          approve → Xero DRAFT INVOICE
   │                                                = 4-digit job number assigned
 job card (auto from BOM, + internal notes)  ◄──── number ties folder/drawings/job
   │
 log ACTUAL time + materials  ──►  ESTIMATED vs ACTUAL report
```

## 2. What we build (on top of today's RPM)

RPM already has: clients, stores/sites, assets, jobs, projects, technicians, roles,
and an `internal_only` flag pattern (on photos) we can reuse for job-card notes.

| New piece | What it does |
|---|---|
| `materials` master table | priced catalogue with **ID codes** (Stu's preference) — code, description, unit, cost, sell/markup, supplier. BOM calls items by code or description |
| `cost_sheet` / sections | a project's BOM, grouped into **Manufacture / Install / Travel** (rolls up, breaks down on quote) |
| `job_line_items` (BOM) | one row per line — **estimated vs. actual**, type = labour or material, section, public description + **internal-only note**, sell price (manually adjustable) |
| `time_entries` | who / hours / date logged **against a project** (new — Xero can't do this for them) |
| Xero link fields | store Xero quote id + invoice number/status against the project |
| Job card (PDF) | auto-generated from the BOM; public descriptions show, internal notes don't |

## 3. The flow, in their words

1. Enquiry → project created (`client > year > YY-MM-DD Title NNNN`; NNNN = Xero number)
2. Build cost sheet(s) from drawings — Manufacture / Install / Travel
3. Totals → **Xero quote**
4. Approved → **Xero draft invoice** → gets the 4-digit number → tied back to the project
5. **Job card** auto-produced (today: printed + handwritten — Hugo's pain point)
6. Project runs; staff log **time + materials actuals**
7. Stu reviews **estimated vs. actual**; adjusts sell prices / adds invoice lines in Xero
8. Approve draft → invoice sent to client (in Xero)

## 4. MVP (ship first)

1. **Materials master table** (imported from Stu's xls) with codes
2. **Build a BOM / cost sheet** for a project from those materials, in sections
3. **Job card PDF** from the BOM (public desc + internal notes)
4. **Log actual time + materials** against the project
5. **Estimated vs. actual view** — labour + materials, per section and total

Xero push (totals → quote) and number read-back layer on once the costing core is in use.

## 5. Inputs still needed from Stu

Q&A answered: ad-hoc=yes (client/site optional); revisions=PDF snapshots; approval=none;
Xero org=Rodier (AIS01); labour rates vary + override everything; materials search by code/desc.

Still outstanding:
- [ ] **The costing spreadsheet** — Stu emailed it ("current costing spreadsheet… divided by
      sub-sections"). Defines the materials table, sections, and the varying labour rates.
      *Most valuable input — still need the actual file on disk.*
- [ ] Confirm we can create a Xero OAuth2 app connection on the Rodier (AIS01) org.

## 6. Not in scope

Replacing Xero invoicing; purchase orders (they use the job number as the purchase ref);
stock levels; payroll/wages (Sharon runs these from timesheets separately). Backlog, not core.

## People
- **Stu Jones** — GM; quoting, costing, estimated-vs-actual review
- **Hugo** — produces jobs/sells; job-card automation directly targets his "napkin" problem
- **Sharon / Aisha** — admin; Xero entry, supplier invoices, wages/timesheets
