# Database migrations

How schema changes work today, what each existing migration does, and
the gotchas we've already hit. Read this before touching anything in
`db/migrations/` — the manual-apply workflow has sharp edges.

For env-var setup that migrations need (Supabase keys etc.), see
[`ENV_VARS.md`](./ENV_VARS.md). For the planned automation that
replaces the manual workflow, see
[`INFRA_ROADMAP.md`](./INFRA_ROADMAP.md) item 5.

---

## Where migrations live

```
db/migrations/
  001_initial_schema.sql                 — core tables + RLS
  002_mortgage_analyses.sql              — mortgage analyzer save/load
  003_leads.sql                          — CRM leads table + status enum
  004_lead_role_first_time_buyer.sql     — adds 'first_time_buyer' enum value
  005_fthb_analyses.sql                  — FTHB analysis save/load
  006_pro_type_and_branched_intent.sql   — pro_type column + intent values
```

Migrations are plain SQL files, numbered sequentially. Each is
idempotent where possible (uses `create table if not exists`,
`add value if not exists`, etc.) so re-running is safe.

There is no migration `007` in the tree — see *Reverted migrations*
below.

---

## Workflow today (manual)

The workflow is "paste into Supabase SQL editor and run." Lightweight
and works for a 1-2 person team; doesn't scale much past that.

### Adding a new migration

1. **Number** the file sequentially:
   `db/migrations/00N_short_description.sql`. Keep names short — they
   show up in commit messages and on-call notes.
2. **Header comment** at the top: filename + one-paragraph "what this
   does, and why." If the migration is non-trivial (re-shapes data,
   not just additive), include a rollback strategy comment.
3. **Make it idempotent** if possible:
   - `create table if not exists`
   - `alter type ... add value if not exists` (Postgres 12+)
   - `drop policy if exists` before `create policy`
4. **Include RLS** on any new user-owned table:
   - `alter table public.<name> enable row level security`
   - At least one policy per access pattern (`select_owner`,
     `mod_owner`).
   - See `005_fthb_analyses.sql` for the cleanest example.
5. **Test against local Supabase** (or against staging, when it's up
   per [`STAGING_SETUP.md`](./STAGING_SETUP.md)). Don't apply to prod
   first.
6. **Commit** with the convention from
   [`../CONTRIBUTING.md`](../CONTRIBUTING.md):
   `db: add <thing> to <table>` or similar.
7. **Apply to prod** after the PR merges. Open the Supabase dashboard
   → SQL Editor → paste contents → run. Confirm no errors in the
   output panel.
8. **Note the apply** in the PR thread or a team channel so anyone
   working against prod knows the schema has shifted.

### What to do if a migration fails mid-apply

Supabase's SQL editor runs the whole script as a single transaction
by default; if any statement fails, the entire script is rolled back
and the previous schema is intact.

If the script was wrapped in explicit `begin`/`commit` and a
statement failed:
- Read the error message — usually a missing column, a constraint
  violation on existing data, or a permission issue.
- Fix the migration file, push, then re-apply.

If a statement succeeded but its DOWNSTREAM effect was wrong (e.g.
the migration ran but the new column has the wrong default and now
rows are bad):
- Write a follow-up migration that corrects the data. Don't edit the
  applied migration in place — git history matters.
- If the bad data is small enough, manually `update` in the SQL
  editor and document what you did.
- On Supabase Pro, you can also restore the database to a
  pre-migration point in time via Point-in-Time Recovery (~7 days
  back).

---

## What each migration does

### 001 — Initial schema

Creates the core tables that everything else depends on:

- `users` (one row per Supabase auth user; extends `auth.users` with
  app-level fields like `is_admin`)
- `properties` (a homeowner's property records — used by listing
  wizard)
- `property_photos`, `comps`, `offers`, `tasks` (companion tables to
  `properties`)
- `mls_mapping`, `audit_logs` (admin/internal)

All tables have RLS enabled, each with at least one `_select_owner`
and one `_mod_owner` policy gated on `auth.uid()`.

Also enables the `pgcrypto` extension (for `gen_random_uuid()`) and
**optionally** PostGIS for a geospatial index on `properties` (lat/lng
proximity searches). The PostGIS step is wrapped in a `do $$ ... $$`
block that no-ops if PostGIS isn't installed — useful for environments
without the extension but be aware Supabase free + Pro both have
PostGIS available.

### 002 — `mortgage_analyses`

Adds persistence for the Mortgage Calculator's "save analysis" flow.
Single table keyed on `user_id`; payload is a JSONB blob.

### 003 — `leads`

The CRM data model. Single `leads` table; one row per signed-up user.
Fields: `name`, `role` (enum), `intent` (enum), `pipeline` (which
partner specialty they want to be matched with), `status` (enum:
`new`, `enriched`, `engaged`, etc.), `pro_type` (added later in 006),
plus an `activities` JSONB array for an append-only event log.

RLS: `_select_owner` and `_mod_owner` policies gate by `auth.uid()`;
an additional `_select_admin` policy lets admins see all leads.

### 004 — `lead_role` enum: add `first_time_buyer`

Single-line migration that extends the `lead_role` enum with the new
`first_time_buyer` value. Was needed before the FTHB engine could
route leads correctly.

### 005 — `fthb_analyses`

Persistence for the FTHB analyzer's "save analysis" flow. Mirrors 002
in structure — JSONB payload, user-owned, RLS by `auth.uid()` — with
a few denormalized columns (income, starter price, etc.) for fast
list queries on the Dashboard's Recent panel.

### 006 — `pro_type` column + branched intent values

Adds:
- `pro_type` column on `leads` (what kind of pro the user IS, when
  `role='pro'` — distinct from `pipeline`, which is what kind of pro
  they WANT to work with).
- New values on the `lead_intent` enum: `fthb_saving`,
  `fthb_pre_approved`, `fthb_exploring`, `fthb_unsure`,
  `pro_evaluating`, `pro_using_with_clients`, `pro_curious`. These
  unlock the branched-by-persona steps in the post-signup
  OnboardingWizard.

---

## Reverted migrations

### 007 — RLS on `spatial_ref_sys` (REVERTED 2026-06-12)

**The intent.** Supabase Security Advisor flagged the PostGIS-owned
`spatial_ref_sys` table as `rls_disabled_in_public` (critical alert).
The migration enabled RLS + added a permissive SELECT policy — the
standard community fix.

**Why it failed.** `spatial_ref_sys` is owned by Supabase's internal
`supabase_admin` role, not the role the SQL editor runs as. Applying
the migration via the SQL editor returns:

```
ERROR: 42501: must be owner of table spatial_ref_sys
```

This is a real Supabase + PostGIS limitation, not user error. There's
no clean workaround from the SQL editor; you'd need to:
- Move PostGIS to its own schema (`alter extension postgis set
  schema extensions`) — requires the same owner privileges; same
  failure.
- `drop extension postgis cascade` — removes the table entirely
  along with the geospatial index on `properties`. Drastic for an
  alert that's a false positive.

**The accepted answer.** Mark the Security Advisor finding as a
**known issue / accepted risk** in the Supabase dashboard. The data
in `spatial_ref_sys` is public EPSG/coordinate reference info,
identical on every PostGIS install — there's nothing to "expose."

The migration was reverted in commit `41581ff`. Don't re-create it
under a different number. If you see this Security Advisor alert
again, dismiss it the same way.

---

## Upcoming schema work (not yet in tree)

These migrations are planned for when the corresponding feature
ships. Listed here so the next dev knows what's queued.

### Portfolio Engine schema (when V1 ships)

Per [`PORTFOLIO_ENGINE_ARCH.md`](./PORTFOLIO_ENGINE_ARCH.md):
- `portfolio_analyses` parent table (user_id, label, target_property
  blob, user_profile blob, output blob, timestamps)
- `portfolio_properties` child table (per-property inputs, foreign
  key to parent with `on delete cascade`)
- Extend `lead_role` enum with `investor`
- Extend `pipeline` enum with investor-specialty pros (DSCR lender,
  commercial broker, 1031 specialist) — currently only
  `financial-planner | real-estate-agent | mortgage-broker`

### AI Coach schema (when V1 ships)

Per the in-progress AI Coach spec:
- `ai_insights` table (user_id, scenario_id, trigger_event,
  structured_context_hash, output_json, model, latency_ms, created_at)
  — primarily for caching and eval, not user-facing.

---

## The October 30, 2026 default change

Supabase notified us 2026-05-27 that the `public` schema will no
longer auto-expose tables to the Data API. By **2026-10-30** any
table created in `public` without explicit `GRANT` statements will be
unreachable from PostgREST / GraphQL / supabase-js.

**What this means for us:**
- All current tables (001–006) were created under the old default
  and will keep working past the cutover — no action needed.
- **New migrations should include explicit GRANTs** to future-proof:
  ```sql
  grant select, insert, update, delete on <table> to authenticated;
  ```
  RLS still gates the actual rows; the `grant` just lets PostgREST
  see the table at all.

Worth a 15-minute audit pass via Supabase dashboard → Security
Advisor before Oct 30, to add `GRANT`s to anything that's currently
exposed but lacks them.

---

## See also

- [`DEPLOYING.md`](./DEPLOYING.md) — overall deployment workflow
- [`INFRA_ROADMAP.md`](./INFRA_ROADMAP.md) item 5 — planned migration
  automation (Supabase CLI + CI runner)
- [`STAGING_SETUP.md`](./STAGING_SETUP.md) — staging environment for
  testing migrations before prod
- [`ENV_VARS.md`](./ENV_VARS.md) — Supabase credential env vars
