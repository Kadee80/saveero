-- ---------------------------------------------------------------------------
-- 006_pro_type_and_branched_intent.sql
--
-- Wizard branching support (per Van's post-demo feedback, 2026-05-18):
--   #1 — first-time buyers need an FTHB-specific Intent step instead of
--        the homeowner-flavored options
--   #2 — industry pros need pro-specific final steps instead of consumer
--        intent + pipeline
--
-- Two changes here, both additive + idempotent:
--
--   (a) ALTER TABLE leads ADD COLUMN pro_type. Captures the kind of pro
--       a lead is when role='pro' (financial-planner / real-estate-agent /
--       mortgage-broker). Nullable — irrelevant for consumers. Stored as
--       text rather than a new enum because the pipeline column already
--       uses these same three slugs as free-form strings; staying with
--       text keeps the two columns interchangeable for reporting.
--
--   (b) ALTER TYPE lead_intent ADD VALUE for 7 new intents:
--         - fthb_saving           — saving up to buy
--         - fthb_pre_approved     — pre-approved and actively looking
--         - fthb_exploring        — just exploring / kicking tires
--         - fthb_unsure           — not sure yet
--         - pro_evaluating        — evaluating Saveero as a partner
--         - pro_using_with_clients — looking for tools to use with clients
--         - pro_curious           — just curious
--
--       Existing values (considering_move, refinance, rental_explore,
--       curious, unknown) stay — they remain the right options for the
--       current-homeowner consumer path.
--
-- Each ADD VALUE lives in its own DO block so a partial re-run doesn't
-- short-circuit the rest (Postgres ALTER TYPE ADD VALUE can't be batched
-- in a single transaction).
-- ---------------------------------------------------------------------------

-- (a) pro_type column on leads
alter table public.leads add column if not exists pro_type text;

-- (b) FTHB intent values
do $$ begin
  alter type lead_intent add value if not exists 'fthb_saving';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type lead_intent add value if not exists 'fthb_pre_approved';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type lead_intent add value if not exists 'fthb_exploring';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type lead_intent add value if not exists 'fthb_unsure';
exception when duplicate_object then null; end $$;

-- (c) Pro purpose intent values
do $$ begin
  alter type lead_intent add value if not exists 'pro_evaluating';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type lead_intent add value if not exists 'pro_using_with_clients';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type lead_intent add value if not exists 'pro_curious';
exception when duplicate_object then null; end $$;
