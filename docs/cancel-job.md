# Cancel Job

Rodier admins (`super_admin` and `rodier_admin`) can cancel an in-progress,
non-template job from `/quoting/jobs/[id]`. The confirmation identifies the job,
explains retention and the separate Xero responsibility, and accepts an optional
reason of up to 2000 characters. Review work and material commitments first.

The signed-in API request updates only the status and reason. An invoker trigger
checks the admin's database profile, stamps `cancelled_at` and `cancelled_by`, and
prevents reopening, deletion, or rewriting the cancellation record. It does not
delete BOMs, time, materials, notes, quote history, or invoice references. Existing
cancelled rows remain valid with unknown cancellation metadata; no historical
actor or date is invented.

Cancelled Jobs is separate from Active Jobs and Completed Jobs, including printed
reports. Active Jobs remains restricted to `in_progress`; cancelled values do not
belong in an active revenue sum. No separate expected-revenue metric exists in
this branch. Sales estimates remain intact for history, rather than being zeroed.

Xero cancellation/voiding is a separate accounting action. Cancellation makes no
Xero requests. The existing PAID sync uses an atomic update restricted to
`in_progress`; cancelled jobs remain cancelled even on retries. The database
guard also rejects status changes by other writers. If PAID completion wins a
race before cancellation, cancellation returns a conflict for review.

## Rollout

- Based on `stu-dev`, which contains the current Xero/BOM job model. `main` and
  `dev` have older application code.
- Apply `20261109230712_cancel_costing_job.sql` to `rpm-dev` before deploying
  the application change to `stu-dev`. Its costing schema and cancelled status
  have been verified. Keep production and Xero changes separate.
- Tests execute the exact migration in disposable PGlite PostgreSQL, with
  synthetic users and a synthetic job. This validates SQL and business guards;
  it is not a substitute for staging validation of existing RLS policies.
- On compatible staging, sign in as each admin role and a non-admin; cancel a
  synthetic active job; verify its preserved BOM, invoice identity, reason and
  actor; verify separate list/report views; replay a PAID event for that invoice.
- Do not cancel INV-7657 or change production/Xero as part of this change.

