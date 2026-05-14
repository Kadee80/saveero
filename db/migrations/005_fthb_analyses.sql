-- 005_fthb_analyses.sql
-- Adds persistence for the First-Time Homebuyer (FTHB) scenario engine.
--
-- Each row captures one user-initiated FTHB analysis. The inputs and result
-- JSONB blobs are kept so the UI can re-display a saved analysis without
-- re-running the engine, and so calculations are auditable.
--
-- Mirrors the pattern from 002_mortgage_analyses.sql. Unlike the mortgage
-- analyzer there is a single FTHB analysis shape, so no enum is needed.
--
-- Safe to run multiple times — table/index statements use `if not exists`
-- guards (the trigger + policy statements match 002's style).

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.fthb_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,

  -- User-supplied display label (e.g. "Plan A — buy starter in 2 yrs").
  label text,

  -- Denormalized fields for cheap list queries (no need to parse JSON).
  -- Pulled from the FTHB inputs...
  annual_household_income numeric(14,2),
  starter_home_price numeric(14,2),
  preferred_home_price numeric(14,2),
  horizon_years numeric(5,2),
  -- ...and from the Decision Map recommendation snapshot.
  best_executable_path text,
  best_net_position numeric(14,2),

  -- Full inputs and result as sent/computed. Kept for replay + auditability.
  inputs jsonb not null,
  result jsonb not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger fthb_analyses_set_updated_at
before update on public.fthb_analyses
for each row execute procedure public.set_updated_at();


-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_fthb_analyses_user
  on public.fthb_analyses(user_id);

create index if not exists idx_fthb_analyses_user_created
  on public.fthb_analyses(user_id, created_at desc);


-- ---------------------------------------------------------------------------
-- Row-Level Security — users see and modify only their own analyses.
-- Admins (via public.is_admin) can see everything.
-- ---------------------------------------------------------------------------
alter table public.fthb_analyses enable row level security;

create policy fthb_analyses_select_owner on public.fthb_analyses
for select using (
  user_id = auth.uid() or public.is_admin(auth.uid())
);

create policy fthb_analyses_mod_owner on public.fthb_analyses
for all using (
  user_id = auth.uid() or public.is_admin(auth.uid())
) with check (
  user_id = auth.uid() or public.is_admin(auth.uid())
);
