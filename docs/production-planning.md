# Department Jobs

Open **Job & Project Management → Department Jobs** (`/quoting/production`) as a Rodier Admin or Super Admin. CNC is selected initially.

The current screen is a read-only to-do list: one row per assigned job, showing job/client, job due date, estimated department hours and recorded department hours. Use department tabs and search to choose a workload. Finished department assignments (100% progress), closed jobs and templates are omitted. A dash means unknown/unrecorded hours; a recorded zero stays zero.

## Setup and use

This version builds on the existing restricted production workspace already on `stu-dev`. Its `departments`, `department_jobs` and department-linked `costing_time_entries` records are the source of truth. The simplified screen does not require the retained operations migration.

1. In **Settings → Production access** (`/settings/production`), select a department and approved job, enter estimated department hours and save the assignment.
2. Open `/quoting/production` to see the job. Dates come from the job's existing completion/due date (`completion_date`).
3. Labour recorded against that job and department in the existing factory workspace appears in Actual hours. Unassigned job-level labour is not guessed or counted against multiple departments.
4. Search and the global customer filter both apply. Refresh reloads the list.

At release verification, development had the CNC department configured and no department job assignments. No sample jobs, assignments or actuals were inserted into the live database. Other department tabs are ready for matching catalogue codes: `design`, `metalwork`, `finishing`, `assembly`, `installation`.

## Existing permissions

This admin summary retains the existing costing permissions and server-side route guard. Sam's `department_operator` role continues to use `/production` with its existing restricted data functions and route boundaries. This change grants no new operator access to quotes, leads, map or raw costing tables.

## Detailed planning retained for later

The earlier detailed screen remains in `src/components/production/detailed-production-planning.tsx`, with its editor, statuses, blockers, explicit progress and tests. It is not exposed by the current route. Its model and grouping helper are retained in `src/lib/production/`.

`supabase/migrations/20260923014206_production_planning_operations.sql` preserves the future operations table, RLS, invoker view and optional operation links for labour/material actuals. It has not been applied to the hosted database for this release. The simplified list reads existing department assignments instead.

Before enabling detailed planning, integrate it with existing department assignments and operator functions rather than maintaining two competing progress fields. The stable operation IDs can later support weekly resource/hour allocations. Completion must remain independent of consumed hours. The migration uses composite foreign keys to prevent actuals being attributed to operations on different jobs.

## Verification

Run the focused tests, typecheck and lint:

```sh
npm test -- src/lib/production src/components/production src/app/quoting/production src/__tests__/lib/permissions.test.ts
npx tsc --noEmit
npx eslint src/lib/production src/components/production src/app/quoting/production
npm run build
```

The assignment loader tests cover department/customer scoping, active-work filters, recorded zero versus missing hours, and actuals pagination. Earlier detailed-planning tests remain intact. `supabase/tests/production_planning.sql` is a rollback-only SQL test for the deferred operations migration; it was verified on an isolated PostgreSQL fixture baseline.
