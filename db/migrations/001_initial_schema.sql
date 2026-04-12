-- Saveero Database Schema (Postgres/Supabase)
-- This schema is compatible with Supabase. It uses auth.uid() for RLS and pgcrypto for UUIDs.
-- PostGIS is optional; if unavailable, the geospatial index step is skipped.

-- Extensions
create extension if not exists pgcrypto; -- for gen_random_uuid()
create extension if not exists postgis; -- optional, for geospatial index

-- Enums
do $$ begin
  create type user_role as enum ('seller', 'agent', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type property_status as enum ('draft', 'published', 'active');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('open', 'done');
exception when duplicate_object then null; end $$;

do $$ begin
  create type comp_source as enum ('mls', 'llm');
exception when duplicate_object then null; end $$;

-- Helper function to auto-update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

-- Users table
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  role user_role not null default 'seller',
  created_at timestamptz not null default now()
);

-- Properties
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  address text,
  lat double precision,
  lng double precision,
  beds integer,
  baths integer,
  baths_full integer,
  baths_half integer,
  sqft integer,
  lot_sqft integer,
  year_built integer,
  condition text,
  status property_status not null default 'draft',
  price_min_suggested numeric(14,2),
  price_max_suggested numeric(14,2),
  price_mid numeric(14,2),
  price_confidence numeric(5,2),
  description_ai text,
  last_ai_pricing_at timestamptz,
  last_ai_desc_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger properties_set_updated_at
before update on public.properties
for each row execute procedure public.set_updated_at();

-- Property Photos
create table if not exists public.property_photos (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  url text not null,
  width integer,
  height integer,
  labels_json jsonb,
  created_at timestamptz not null default now()
);

-- Comparables (comps)
create table if not exists public.comps (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  source comp_source,
  raw_json jsonb,
  distance_m numeric(12,2),
  similarity_score numeric(6,3),
  price numeric(14,2),
  closed_date date,
  address text,
  beds integer,
  baths numeric(4,1),
  sqft integer
);

-- Offers
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  source text,
  amount numeric(14,2),
  contingencies_json jsonb,
  closing_date date,
  notes_ai text,
  created_at timestamptz not null default now()
);

-- Tasks
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  task_type text,
  status task_status not null default 'open',
  due_at timestamptz,
  created_at timestamptz not null default now()
);

-- MLS Mapping (prep)
create table if not exists public.mls_mapping (
  id uuid primary key default gen_random_uuid(),
  field_client text,
  field_bright text,
  type text,
  required boolean,
  notes text
);

-- Audit logs
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  entity text not null,
  entity_id uuid,
  action text not null,
  payload_json jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_properties_owner on public.properties(owner_id);
create index if not exists idx_offers_property on public.offers(property_id);
create index if not exists idx_comps_property on public.comps(property_id);

-- Optional geospatial index: point from lng/lat using PostGIS geography
-- Only created if postgis is available
do $$
begin
  perform PostGIS_Version();
  execute 'create index if not exists idx_properties_geo on public.properties using gist (geography(ST_SetSRID(ST_MakePoint(lng, lat), 4326)))';
exception when undefined_function then
  -- Fallback: simple btree index on lat,lng
  execute 'create index if not exists idx_properties_lat on public.properties(lat)';
  execute 'create index if not exists idx_properties_lng on public.properties(lng)';
end$$;

-- RLS Policies
-- Enable RLS
alter table public.users enable row level security;
alter table public.properties enable row level security;
alter table public.property_photos enable row level security;
alter table public.comps enable row level security;
alter table public.offers enable row level security;
alter table public.tasks enable row level security;
alter table public.mls_mapping enable row level security;
alter table public.audit_logs enable row level security;

-- Helper: check if current user is admin based on users table.
-- Note: In Supabase, auth.uid() returns the JWT subject (user id). We assume users.id = auth.uid().
create or replace function public.is_admin(uid uuid)
returns boolean language sql as $$
  select exists (
    select 1 from public.users u where u.id = uid and u.role = 'admin'
  );
$$;

-- Users table policies
-- Users can see themselves; admins can see all.
create policy if not exists users_select_self on public.users
for select using (
  id = auth.uid() or public.is_admin(auth.uid())
);

create policy if not exists users_update_self on public.users
for update using (
  id = auth.uid() or public.is_admin(auth.uid())
) with check (
  id = auth.uid() or public.is_admin(auth.uid())
);

create policy if not exists users_insert_self on public.users
for insert with check (
  id = auth.uid() or public.is_admin(auth.uid())
);

-- Properties policies: owner sees only their rows; admins see all.
create policy if not exists properties_select_owner on public.properties
for select using (
  owner_id = auth.uid() or public.is_admin(auth.uid())
);

create policy if not exists properties_mod_owner on public.properties
for all using (
  owner_id = auth.uid() or public.is_admin(auth.uid())
) with check (
  owner_id = auth.uid() or public.is_admin(auth.uid())
);

-- Property photos inherit property ownership
create policy if not exists photos_access_owner on public.property_photos
for all using (
  exists (
    select 1 from public.properties p
    where p.id = property_id and (p.owner_id = auth.uid() or public.is_admin(auth.uid()))
  )
) with check (
  exists (
    select 1 from public.properties p
    where p.id = property_id and (p.owner_id = auth.uid() or public.is_admin(auth.uid()))
  )
);

-- Comps inherit property ownership
create policy if not exists comps_access_owner on public.comps
for all using (
  exists (
    select 1 from public.properties p
    where p.id = property_id and (p.owner_id = auth.uid() or public.is_admin(auth.uid()))
  )
) with check (
  exists (
    select 1 from public.properties p
    where p.id = property_id and (p.owner_id = auth.uid() or public.is_admin(auth.uid()))
  )
);

-- Offers inherit property ownership
create policy if not exists offers_access_owner on public.offers
for all using (
  exists (
    select 1 from public.properties p
    where p.id = property_id and (p.owner_id = auth.uid() or public.is_admin(auth.uid()))
  )
) with check (
  exists (
    select 1 from public.properties p
    where p.id = property_id and (p.owner_id = auth.uid() or public.is_admin(auth.uid()))
  )
);

-- Tasks: owner is either assigned user or property owner
create policy if not exists tasks_access_owner on public.tasks
for all using (
  user_id = auth.uid() or public.is_admin(auth.uid()) or (
    property_id is not null and exists (
      select 1 from public.properties p
      where p.id = property_id and (p.owner_id = auth.uid() or public.is_admin(auth.uid()))
    )
  )
) with check (
  user_id = auth.uid() or public.is_admin(auth.uid()) or (
    property_id is not null and exists (
      select 1 from public.properties p
      where p.id = property_id and (p.owner_id = auth.uid() or public.is_admin(auth.uid()))
    )
  )
);

-- MLS mapping: admins only by default; allow read to all authenticated if desired
create policy if not exists mls_mapping_admin_all on public.mls_mapping
for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Audit logs: admins can see all; users can see their own entries
create policy if not exists audit_logs_select on public.audit_logs
for select using (public.is_admin(auth.uid()) or user_id = auth.uid());

create policy if not exists audit_logs_insert_self on public.audit_logs
for insert with check (user_id = auth.uid() or public.is_admin(auth.uid()));

-- Notes:
-- 1) For Supabase, ensure you also create a row in public.users with id = auth.uid() after signup.
-- 2) If you prefer referencing auth.users directly, adjust users.id type to uuid and manage via triggers.
-- 3) PostGIS-related index will be created only when the extension is available.
