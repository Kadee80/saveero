-- ---------------------------------------------------------------------------
-- 004_lead_role_first_time_buyer.sql
--
-- Add 'first_time_buyer' to the lead_role enum.
--
-- Background: the original wizard had two consumer personas (homeowner /
-- pro) plus 'unknown'. The post-demo wizard (2026-05-13) inserts a new
-- step 2 asking "Do you currently own a home?" — answering "no" routes
-- the user to the FTHB scenario engine instead of the homeowner one.
-- We capture the answer in lead_role so the engine fork is a single
-- field on the leads row that the dashboard can read directly.
--
-- Idempotent: ALTER TYPE ... ADD VALUE wrapped in the same
-- duplicate_object guard pattern used elsewhere in this migrations
-- folder. Postgres requires ADD VALUE to run outside a transaction
-- when committing to the same enum, but ALTER TYPE inside a DO block
-- is fine because the DO block executes as its own implicit transaction
-- per statement and the IF NOT EXISTS clause handles re-runs cleanly.
-- ---------------------------------------------------------------------------

do $$ begin
  alter type lead_role add value if not exists 'first_time_buyer';
exception when duplicate_object then null; end $$;
