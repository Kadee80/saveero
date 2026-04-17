-- 002_mortgage_analyses.sql
-- Adds persistence for the mortgage analyzer.
--
-- Each row captures one user-initiated analysis (purchase, affordability check,
-- or refinance comparison). The inputs and result JSONB blobs are kept so the
-- UI can re-display a saved analysis without re-running the engine, and so
-- calculations are auditable (ties to the MVP plan's raw_calc concept).
--
-- Safe to run multiple times — all statements use `if not exists` guards.

-- ---------------------------------------------------------------------------
-- Enum for the three analysis types the engine currently produces.
-- ---------------------------------------------------------------------------
do $$ begin
  create type mortgage_analysis_type as enum ('analyze', 'affordability', 'refinance');
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.mortgage_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,

  -- Optional link to a listing/property the analysis is about.
  property_id uuid references public.properties(id) on delete set null,

  -- User-supplied display label (e.g. "123 Main St — 20% down").
  label text,

  analysis_type mortgage_analysis_type not null,

  -- Denormalized fields for cheap list queries (no need to parse JSON).
  purchase_price numeric(14,2),
  loan_amount numeric(14,2),
  monthly_total numeric(12,2),
  annual_rate_percent numeric(5,3),
  term_years integer,

  -- Full inputs and result as sent/computed. Kept for replay + auditability.
  inputs jsonb not null,
  result jsonb not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger mortgage_analyses_set_updated_at
before update on public.mortgage_analyses
for each row execute procedure public.set_updated_at();


-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_mortgage_analyses_user
  on public.mortgage_analyses(user_id);

create index if not exists idx_mortgage_analyses_user_created
  on public.mortgage_analyses(user_id, created_at desc);

create index if not exists idx_mortgage_analyses_property
  on public.mortgage_analyses(property_id);


-- ---------------------------------------------------------------------------
-- Row-Level Security — users see and modify only their own analyses.
-- Admins (via public.is_admin) can see everything.
-- ---------------------------------------------------------------------------
alter table public.mortgage_analyses enable row level security;

create policy mortgage_analyses_select_owner on public.mortgage_analyses
for select using (
  user_id = auth.uid() or public.is_admin(auth.uid())
);

create policy mortgage_analyses_mod_owner on public.mortgage_analyses
for all using (
  user_id = auth.uid() or public.is_admin(auth.uid())
) with check (
  user_id = auth.uid() or public.is_admin(auth.uid())
);
