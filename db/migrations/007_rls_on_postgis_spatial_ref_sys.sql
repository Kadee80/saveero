-- 007_rls_on_postgis_spatial_ref_sys.sql
-- Silences the Supabase Security Advisor 'rls_disabled_in_public' lint on
-- the PostGIS-owned `spatial_ref_sys` table.
--
-- Background
-- ----------
-- PostGIS installs into the `public` schema by default and creates
-- `spatial_ref_sys` to hold the SRID -> coordinate-system catalog (EPSG
-- codes, WGS84, etc.). It's standard, globally-readable reference data;
-- PostGIS ships it without RLS by design because the data isn't sensitive.
-- Supabase's linter doesn't whitelist the table, so it surfaces as a
-- critical "rls_disabled_in_public" alert in the dashboard even though
-- there is no actual data exposure (the rows are the same on every PostGIS
-- install on the planet).
--
-- This migration enables RLS and adds a permissive SELECT policy, which is
-- the standard fix recommended by the Supabase community for this exact
-- false positive. Behaviour is unchanged in practice — anon/authenticated
-- still read SRID rows the same way they would without RLS — but the
-- Security Advisor alert clears.
--
-- Why not move PostGIS to its own schema:
--   The schema move (`alter extension postgis set schema extensions`) is
--   invasive — every PostGIS function reference would need re-qualifying
--   and we'd risk breaking the optional geo index in 001. Out of scope
--   for what's effectively a linter fix.
--
-- Why not just `drop extension postgis`:
--   The `properties` table in 001 has an optional GIST index built off
--   PostGIS for lat/lng proximity queries. The Python application doesn't
--   use it today, but the index is cheap to keep and useful when the
--   geospatial search story comes online.
--
-- Idempotent: `drop policy if exists` + `create policy` so this can re-run
-- safely if the migration is replayed against a partially-applied DB.

alter table public.spatial_ref_sys enable row level security;

drop policy if exists spatial_ref_sys_select_anyone on public.spatial_ref_sys;
create policy spatial_ref_sys_select_anyone on public.spatial_ref_sys
  for select using (true);
