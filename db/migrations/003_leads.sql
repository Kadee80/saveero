-- 003_leads.sql
-- Adds the CRM leads table.
--
-- One row per Saveero user, populated at signup with whatever we capture
-- there (today: name) and enriched as the user moves through the funnel
-- (post-signup wizard, in-app activity, Contact-pipeline clicks). The
-- internal admin /admin/crm view reads from this table; partner-scoped
-- access is a planned later milestone (will use RLS on a future
-- `assigned_partner_id` column).
--
-- Safe to run multiple times — all statements use `if not exists` guards.
-- Mirrors the pattern from 002_mortgage_analyses.sql.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Homeowner = end-user audience for the decision tools.
-- Pro       = a financial planner, agent, or broker who's evaluating
--             Saveero as a partner / lead source.
-- Unknown   = haven't asked yet (default until the post-signup wizard runs).
do $$ begin
  create type lead_role as enum ('homeowner', 'pro', 'unknown');
exception when duplicate_object then null; end $$;

-- What brought them in. Mirrors the four scenario options the landing page
-- gestures at, plus a catchall.
do $$ begin
  create type lead_intent as enum (
    'considering_move',
    'refinance',
    'rental_explore',
    'curious',
    'unknown'
  );
exception when duplicate_object then null; end $$;

-- Funnel status — drives the columns of the admin Kanban view.
--   new       — just signed up, nothing else known
--   enriched  — completed the post-signup wizard (have role + intent)
--   active    — has run a tool (calculator, compare, or decision map)
--   engaged   — clicked a Contact-pipeline button (planner/agent/broker)
--   converted — partner reports they signed / placed loan / etc. (future)
--   lost      — opted out / unresponsive (future)
do $$ begin
  create type lead_status as enum (
    'new',
    'enriched',
    'active',
    'engaged',
    'converted',
    'lost'
  );
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),

  -- One lead per user. Unique constraint enforces that; on user delete the
  -- lead goes with them.
  user_id uuid not null unique references public.users(id) on delete cascade,

  -- Captured at signup.
  name text,

  -- Captured by the post-signup wizard (Phase B). 'unknown' until then.
  role lead_role not null default 'unknown',
  intent lead_intent not null default 'unknown',

  -- Which partner pipeline they've expressed interest in. Set when they
  -- click a "Contact a {pipeline}" button. NULL until then.
  -- Stored as text so we can add new pipelines without an enum migration.
  pipeline text,

  status lead_status not null default 'new',

  -- Append-only activity timeline. Each entry is
  --   { "at": "<iso8601>", "kind": "<event>", "data": {...} }
  -- — e.g. signed_up, completed_wizard, ran_decision_map,
  -- saved_mortgage_analysis, clicked_contact_planner.
  activity_log jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger leads_set_updated_at
before update on public.leads
for each row execute procedure public.set_updated_at();


-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- Status filter is the bread-and-butter CRM query ("show me all 'engaged'
-- leads"), so it deserves its own index.
create index if not exists idx_leads_status
  on public.leads(status);

-- Newest-first is the default sort on the admin view.
create index if not exists idx_leads_created_at
  on public.leads(created_at desc);

-- For filtering by pipeline (e.g. "show me planner leads").
create index if not exists idx_leads_pipeline
  on public.leads(pipeline) where pipeline is not null;


-- ---------------------------------------------------------------------------
-- Row-Level Security
--
-- Users can see and update their OWN lead row (so the wizard and the
-- in-app enrichment can write to it). Admins can see and modify every
-- row — that's the entire CRM view.
--
-- Note: when we add partner-scoped access (planner / agent / broker can
-- see only their assigned leads), we'll add a partner role check here
-- against a future `assigned_partner_id` column.
-- ---------------------------------------------------------------------------
alter table public.leads enable row level security;

create policy leads_select_owner on public.leads
for select using (
  user_id = auth.uid() or public.is_admin(auth.uid())
);

create policy leads_mod_owner on public.leads
for all using (
  user_id = auth.uid() or public.is_admin(auth.uid())
) with check (
  user_id = auth.uid() or public.is_admin(auth.uid())
);
