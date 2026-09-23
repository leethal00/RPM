# CNC department trial

The reusable `department_operator` role lands at `/production`. An operator belongs to one department through `users.department_id`. Administrators assign approved jobs to a department in **Portal Settings → Production access** (`/settings/production`). CNC is the first department; no account name or email is hard-coded.

## Set up Sam

1. In **Users**, create or edit Sam's verified account; choose **Department Operator** and **CNC**. An email address must be supplied by the account owner. Existing user creation uses the application's established password/confirmation flow.
2. In **Production access**, choose the CNC department and an approved job, add workshop instructions and optional estimated department hours, and save.
3. Have Sam sign in through the normal login page. He sees the department workspace immediately. No assignment means an empty workspace, not access to all jobs.

## What operators can do

- Read department-assigned jobs with status approved, in progress, complete or invoiced. Quote, cancelled and template records are excluded.
- Read production title/details, job number, due date, job lead, department instructions and planned material descriptions/quantities. Generic sales notes and pricing fields are not returned.
- Record their own dated labour, material quantities/units and department progress. User and department attribution are resolved from the authenticated database identity, never from form values.
- Review department totals and logs. Closed jobs are read-only. Entries are append-only for operators; administrators handle corrections in the existing job actuals workflow.
- Compare department hours with a department estimate, and department material usage with whole-job planned quantities. The UI explicitly labels these different scopes.

Time and materials use the existing `costing_time_entries` and `costing_material_actuals` tables. Added department, unit and costing-line links support future reporting without a second set of actuals. Material prices are not supplied by operators; new material actuals leave cost unset for later reconciliation. Progress is manually reported and does not change the job lifecycle or infer completion from hours.

## Enforcement

- A default-deny route allowlist for operators hides the management sidebar and redirects forbidden pages to production. Unrelated APIs return 403. The production page also verifies the role server-side.
- Raw public tables and authenticated storage operations have restrictive operator policies, so existing permissive policies cannot accidentally grant CNC access. Operators can read only their own user profile.
- The two exposed RPCs are security-invoker wrappers around private, narrowly scoped functions. Those functions validate `auth.uid()`, read the current role/department, check job assignment and lifecycle, and return explicit non-priced projections. No service-role key is used in the browser or production workspace.
- A profile trigger prevents users from changing their own role, department, client, store scope, developer access or identity. Existing administrator management remains available.
- Removing an assignment immediately removes read and write access. Previously recorded actuals remain for management reporting.
- When introducing new tables/views/RPCs, extend the operator boundary and regression test. Do not expose definer views over costing tables or return `SELECT *` to operators. Existing public storage URLs are not made private by this feature; drawings/files are intentionally not exposed through this trial workspace.

## Validation

Run `npm test`, `npx tsc --noEmit`, targeted ESLint and `npm run build`. Execute `supabase/tests/department-production.sql` as postgres on a development database; it creates temporary fixture accounts/jobs and rolls back all data. It tests pricing exclusion, raw-table denial, assigned/unassigned/closed jobs, department spoofing, role escalation, input validation, attribution, revocation, anonymous/client rejection and administrator access.

The browser trial should verify login redirect, saving time and materials, progress, forbidden navigation/API calls, reload persistence and mobile overflow using a disposable operator and disposable jobs. Remove all disposable records and authentication sessions after testing.

Migrations have been applied to `rpm-dev` (`jtotzntmndxanhjijqcz`). Production database changes are outside this trial. Schema drift exists between this database and older repository migrations; the new migration deliberately uses only verified fields (optional production fields are read through JSON).
