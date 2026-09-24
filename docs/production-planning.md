# Department Jobs

Open **Job & Project Management → Department Jobs** (`/quoting/production`) as a Rodier Admin or Super Admin. CNC is selected initially.

The list is derived automatically from the BOMs of approved/in-progress, non-template jobs. No import or department assignment is needed. A job can appear in several departments. Dates use the existing job `completion_date`. The global customer filter still applies. Click any column heading to sort in either direction; unknown values remain last. There are no table filters.

## BOM routing and hours

Positive-quantity labour lines are grouped using their description/subsection:

- **CNC:** Design, drawing, programming, CNC/router and laser machining.
- **Metalshop:** Metal fabrication (cutting, preparation and sanding), welding, press brake and guillotine.
- **Acrylic fab/wiring/finishing:** Acrylic fabrication, wiring/electrical, painting, polishing, assembly, vinyl/print finishing and packing.
- **Installation:** Installation/site labour and installation travel labour.

Estimated hours sum the matching BOM labour quantity multiplied by the costing item's `qty`, matching item costing totals. `build_qty` is a descriptive batch size, not a second multiplier. Legacy job-level BOM lines count once. Simple-mode items and zero-quantity work do not contribute.

Raw material quantities, kilometres, callout charges, allowances, outsourced work and project administration do not become production hours. Generic workshop time and supplier travel are not guessed into a department. Existing labour records without a unit use the catalogue's hours convention. An explicit non-hour unit produces an unknown/partial estimate rather than inventing hours. Custom labour labels must identify the relevant work to be included.

Actual hours use recorded department links, combined into the four groups. Where no department is recorded, known labour types such as Design, Welding and Install are used. Explicit department links always take precedence; generic Workshop/Admin/Other time stays unallocated. A recorded zero stays zero; a dash means unknown/unrecorded.

The summary reflects active job BOM scope. It does not infer departmental completion from consumed hours or remove rows based on manual assignment progress. Jobs leave when their overall status is no longer active or their BOM no longer includes that department's work.

## Calendar example

The capacity chart and weekly calendar are static examples, labelled **Example only · Not active**. Their sample hours are independent of live workloads. They save no schedules. Future scheduling should support dragging jobs between days, splitting work across days, capacity totals and warnings about overload/due dates.

## Permissions and preserved work

The existing admin route guard and costing RLS remain in force. Sam's restricted operator workspace at `/production` still uses explicit assignments under Settings → Production access. Automatic BOM inclusion grants no new access to quotes, leads, map or raw costing data.

The detailed planning screen, operation helpers, migration `20260923014206_production_planning_operations.sql` and SQL tests are retained for later. This summary does not require that migration and makes no database writes. Before enabling detailed planning, reconcile operation progress with existing assignment progress. Completion remains independent of consumed hours.

## Verification

```sh
npm test -- src/lib/production src/components/production src/app/quoting/production src/__tests__/lib/permissions.test.ts
npx tsc --noEmit
npx eslint src/lib/production src/components/production src/app/quoting/production
npm run build
```

Tests cover BOM routing, quantity multiplication, charge exclusions, missing/zero hours, customer and active-job scoping, pagination/batching, explicit department precedence, combined tabs, numeric sorting and preserved permissions/detailed planning.
