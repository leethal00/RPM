# RPM — Rodier Preventive Maintenance

Signage asset management platform for Rodier Preventive Maintenance, serving multiple restaurant brands (St Pierre's Sushi, Bento Bowl, K10 Sushi Train) across New Zealand.

**Stack:** Next.js 16 (App Router, React 19) · Supabase (Postgres + Auth + Storage) · Tailwind v4 · shadcn/ui · Leaflet · Recharts · Vitest

## Environments

| | Production | Development / Preview |
|---|---|---|
| **App** | https://rpm-sandy.vercel.app | https://rpm-git-dev-leethal00s-projects.vercel.app |
| **Branch** | `main` | `dev` (plus any other preview branches) |
| **Supabase project** | `rpm` (ref `ywjwqxrrnmqlhvqdfvua`, ap-south-1) | `rpm-dev` (ref `jtotzntmndxanhjijqcz`, ap-southeast-2) |
| **Region** | Mumbai | Sydney |

The DiskStation-hosted Supabase that previously backed dev is decommissioned (containers may still run as a hobby fallback; Tailscale Funnel exposure removed).

## Local development

```bash
git clone https://github.com/leethal00/RPM.git
cd RPM
npm ci
vercel link --project rpm                                         # one-time
vercel env pull .env.development.local --environment=development  # pulls cloud-dev creds
npm run dev
```

Open http://localhost:3000 — local dev hits the cloud-dev Supabase (same backend as the Vercel dev preview).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server on :3000 |
| `npm run build` | Production build |
| `npm run lint` | ESLint (CI requires clean) |
| `npm test` | Vitest run (CI requires green) |
| `npm run test:watch` | Vitest watch mode |

## Database migrations

All schema changes go in `supabase/migrations/<timestamp>_<name>.sql` and are committed to the repo. **Do not ALTER schema via the Supabase dashboard** — see [CLAUDE.md → Migration Policy](./CLAUDE.md#migration-policy) for the rule and rationale.

To apply migrations to either env:
```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/<file>.sql
```

(See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for the full workflow including dev→prod promotion.)

## CI

GitHub Actions runs `npm run lint && npm test && npm run build` on push/PR to `main` and `dev`. PRs must be green to merge.

## Schema drift

Prod has accumulated columns over time that aren't in the repo's migrations (and vice versa). See [SCHEMA_DRIFT.md](./SCHEMA_DRIFT.md) for the inventory — this needs reconciliation before the next dev→prod promotion.

## Roles

`super_admin` · `rodier_admin` · `technician` · `client_hq` · `client_store`

Multi-tenant via `client_id` on every row, enforced by Row Level Security.

## Docs

- **[CLAUDE.md](./CLAUDE.md)** — agent-readable implementation guide (architecture, schema, conventions, patterns)
- **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** — database migration workflow
- **[SCHEMA_DRIFT.md](./SCHEMA_DRIFT.md)** — known drift between prod and dev branch schemas
- **[RPM-Specification-v1.0.docx](./RPM-Specification-v1.0.docx)** — product specification
