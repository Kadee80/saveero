# System architecture

High-altitude view of how Saveero is put together. Read this to get
the mental model; then go deep into [`BACKEND.md`](./BACKEND.md) or
[`FRONTEND.md`](./FRONTEND.md) for area-specific detail.

If you're new to the project, read [`ONBOARDING.md`](./ONBOARDING.md)
first.

---

## The big picture

```
                              ┌─────────────────────────────┐
                              │       Browser (SPA)         │
                              │  React 18 + Vite + TS       │
                              │  Tailwind + shadcn          │
                              │  GSAP (animations)          │
                              │  mixpanel-browser           │
                              └──────────────┬──────────────┘
                                             │
                          /api/*  (proxied by Vercel rewrite)
                         /fred-proxy/*  (proxied to FRED)
                                             │
            ┌────────────────────────────────┴────────────────────────────┐
            │                                                              │
            ▼                                                              ▼
   ┌─────────────────────┐                                       ┌──────────────────┐
   │   Vercel (CDN)      │                                       │   FRED API       │
   │   serves static     │                                       │   (mortgage      │
   │   build of webapp/  │                                       │    rates)        │
   └─────────────────────┘                                       └──────────────────┘
            │
            │  /api/*  rewrite target
            ▼
   ┌─────────────────────┐
   │   Render            │
   │   FastAPI (uvicorn) │
   │   Python 3.11       │
   └──────┬─────┬────────┘
          │     │
          │     │  service-role JWT
          │     ▼
          │   ┌────────────────────────────────────────┐
          │   │   Supabase                             │
          │   │   - Postgres (RLS by auth.uid)         │
          │   │   - Auth (JWT, JWK validated above)    │
          │   │   - Storage (unused today)             │
          │   └────────────────────────────────────────┘
          │
          │  optional outbound integrations
          ▼
   ┌─────────────────────────────────────────────────────────┐
   │   OpenRouter (vision + text LLMs — listing wizard)      │
   │   Zapier Catch Hook (engaged-lead notification webhook) │
   │   Bridge RESO MLS (optional; Perplexity fallback)       │
   └─────────────────────────────────────────────────────────┘

   Client-side telemetry (independent of backend):
   Browser → Mixpanel (no-op without VITE_MIXPANEL_TOKEN)
```

---

## Three engines, one shape

The product is built around **three deterministic Python engines**,
all following the same pattern:

| Engine | Audience | Package | Page | Inputs | Outputs |
|---|---|---|---|---|---|
| Homeowner | Already own a home | `scenarios/` | `/decision-map` | ~45 fields | 5 scenarios compared + recommendation |
| First-time homebuyer | Buying first home | `scenarios/fthb/` | `/fthb-decision-map` | ~25 fields | 5 scenarios compared + recommendation |
| Real-estate portfolio | Investor / landlord | `portfolio/` | `/portfolio-builder` *(flagged off)* | portfolio array + target + profile | 8 strategies scored + recommendation |

**The contract every engine follows:**
- **Pure Python.** No I/O, no LLM calls, no network. Stateless
  functions over dataclass inputs.
- **Deterministic.** Same input → same output, every time. No
  randomness, no time-dependence, no globals.
- **Pinned to Excel.** Every cell-level output has a golden test
  asserting it matches the corresponding Excel model the client
  validated against. When math changes, re-pin if and only if you
  understand why the new value is correct.
- **Decoupled from HTTP.** Engine doesn't know about FastAPI. Routers
  in `api/` import the engine + Pydantic schemas alongside and
  convert at the boundary.

This contract is the most important architectural commitment in the
codebase. Don't violate it — the engines are the trust anchor for the
whole product. If the AI Coach (in design — see below) ever produces
a dollar figure not derived from an engine output, we've lost the
property that distinguishes this product from "yet another LLM that
makes up mortgage math."

---

## Layers

### 1. Engines (pure Python)

```
scenarios/                Homeowner engine
  inputs.py               MasterInputs dataclass
  stay.py refinance.py sell_buy.py rent.py rent_out_buy.py
  decision_map.py         cross-scenario ranking + feasibility checks
  engine.py               orchestrator — runs all 5 + audit
  audit.py                calculation trail
  schemas.py              Pydantic HTTP wire format
  core.py                 shared utilities (amortization, tax)

scenarios/fthb/           First-time-buyer engine — same shape
  inputs.py engine.py decision_map.py …

portfolio/                Portfolio Strategy engine — same shape, larger
  inputs.py engine.py …
  strategies/             one module per strategy (open registry)
  goal_profiles.py        weighting matrix keyed by InvestorGoal
  product_rules.py        editable rules-of-thumb constants
```

Tests live in `tests/`, mirroring the engine packages.

### 2. API (FastAPI)

```
main.py                   FastAPI entry, mounts the routers
api/
  scenario_routes.py      /api/scenarios/*     homeowner
  fthb_routes.py          /api/fthb/*          FTHB
  portfolio_routes.py     /api/portfolio/*     portfolio (when shipped)
  mortgage_routes.py      /api/mortgage/*      single-scenario calc
  lead_routes.py          /api/leads/*, /api/me/lead   CRM
  listing_wizard_routes.py /api/listings/*     AI listing generator
core/
  config.py               Pydantic settings (env vars)
  auth.py                 JWT validation against Supabase JWK
  database.py             Supabase admin client singleton
```

**Router pattern (verbatim):**
```python
@router.post("/scenarios/run")
def run_full_engine(body: MasterInputsRequest) -> RunAllResponse:
    result = run_all(body.to_inputs())           # schema → dataclass → engine
    return RunAllResponse.from_result(result)    # dataclass → schema → HTTP
```

Maintain this separation. Don't put math in the router. Don't make
the engine know about FastAPI.

### 3. Database (Supabase Postgres)

Schema lives in `db/migrations/*.sql`, applied in order. Every
user-owned table has Row Level Security enabled with at least one
`_select_owner` policy gating on `auth.uid()`.

Auth tokens are validated server-side in `core/auth.py` against the
Supabase JWK (stored as the `SUPABASE_JWT_JWK` env var — see
[`ENV_VARS.md`](./ENV_VARS.md) for why it's static).

For the schema in detail + migration workflow + gotchas, see
[`MIGRATIONS.md`](./MIGRATIONS.md).

### 4. Frontend (React + Vite SPA)

```
webapp/src/
  App.tsx                 top-level routing + shells
                          (AnonymousShell for logged-out,
                          full sidebar shell for authed)
  pages/                  one component per route
    DecisionMap.tsx       FTHBDecisionMap.tsx PortfolioBuilder.tsx
    AdminCRM.tsx          Landing.tsx StartIntake.tsx
    OnboardingWizard.tsx  Dashboard.tsx Login.tsx
    MortgageCalculator.tsx ScenarioComparison.tsx
    ListProperty.tsx
  api/                    HTTP clients (one per backend router)
    scenarioApi.ts fthbApi.ts portfolioApi.ts
    mortgageApi.ts leadsApi.ts listingsApi.ts
    auth.ts ratesApi.ts anonStash.ts
  components/             shared UI
    InputWizard.tsx       the shared step-wizard, used by all 3 engines
    InputCollector        wraps wizard + dense-form view toggle
    HelpTip.tsx           tooltip for field help copy
    SignupPrompt.tsx      anonymous-mode signup conversion
    ContactPipelineButton.tsx
    ui/                   shadcn primitives
  copy/tooltips.ts        centralized tooltip copy, slug-addressed
  analytics/mixpanel.ts   typed Mixpanel wrapper (no-op without token)
  hooks/useGsapFadeIn.ts  GSAP animation hooks
  lib/                    utils, chartPalette, currency
```

**Key conventions:**
- One TS API client per backend router. Functions return Pydantic-
  matching types. No fetching from components.
- `InputWizard` + `InputCollector` is the **shared** step-wizard.
  Adding a new wizard step elsewhere should reuse it — same
  `WizardStep` shape, same `FieldKind` enum, same illustration slot.
  Don't fork it.
- Every calculator page works end-to-end **without auth**.
  `AnonymousShell` wraps unauthed routes with a slim sidebar that
  shows every nav item — locked items get a Lock icon and route to
  signup (each click is a conversion event).
- `useSession()` returns `Session | null | undefined`. `undefined`
  means "still loading" — routing decisions made on `null` before
  the session resolves will mis-route.
- All AI/coach work is **interpretive only**. Dollar figures come
  from engines. AI text wraps around them.

### 5. Third-party services

| Service | Used for | Failure mode |
|---|---|---|
| **Vercel** | Frontend hosting | Hard outage = no app. Cached previous build keeps serving until rolled back. |
| **Render** | Backend hosting | Hard outage = API down. Frontend still loads but every recalculate fails. Free tier sleeps after 15min — first request takes 10–30s while it spins up. |
| **Supabase** | DB + auth | Hard outage = sign-in fails + saves fail. Free tier auto-pauses after ~1 week inactivity — see [`INFRA_ROADMAP.md`](./INFRA_ROADMAP.md) item 1. |
| **OpenRouter** | Vision + text LLMs (listing wizard) | Falls back to error messages; user can retry. |
| **FRED** | Live mortgage rates | Falls back to hardcoded rates with a warning banner. |
| **Mixpanel** | Product analytics | All `analytics.track()` calls are silent no-ops if the token's unset; app runs fine. |
| **Bridge RESO** | MLS property lookup | Falls back to Perplexity. |
| **Zapier** | Outbound engaged-lead notifications | Silently skipped if `ENGAGED_LEAD_WEBHOOK_URL` is unset. |

The cost trade-offs for the paid-tier upgrades on the first three
are documented in [`INFRA_ROADMAP.md`](./INFRA_ROADMAP.md).

---

## Two cross-cutting flows worth knowing

### Anonymous user flow

1. Visitor lands on `/` → Landing page (marketing).
2. Clicks any CTA → routes to `/start` (intake wizard).
3. Intake wizard collects role + intent + persona; stashes answers to
   `localStorage` (no DB writes yet).
4. On finish → routes to the matching engine page (`/decision-map` or
   `/fthb-decision-map`) based on derived role.
5. User runs the engine, gets results. All engine endpoints accept
   anonymous requests. Save-scenario + contact-a-pro buttons render
   as `SignupPrompt` instead of doing their normal action.
6. User clicks signup. After auth lands:
   - **Lead seed** — `createLead()` upserts a row in `leads` keyed on
     `user_id`.
   - **Anon stash replay** — `App.tsx`'s session-mount effect reads
     the localStorage stash and PUTs the intake answers into the lead
     row, so the user's first authed Dashboard view shows an enriched
     lead (no double-wizard).
   - **Run replay** — if the user also ran an FTHB analysis
     anonymously, that gets saved as their first analysis.
7. Dashboard renders, persona-aware (forks the hero tool by
   `lead.role`).

See `webapp/src/App.tsx` for the session-mount replay logic and
`webapp/src/api/anonStash.ts` for the localStorage structure.

### Engaged-lead notification flow

1. Authed user clicks a "Contact a Mortgage Broker" button (or any
   pipeline CTA).
2. Frontend POSTs the click to `/api/me/lead` with an activity entry
   `clicked_contact_<pipeline>`.
3. Backend's status-ladder logic detects the activity kind, bumps
   the lead's `status` from `enriched` → `engaged`.
4. If `ENGAGED_LEAD_WEBHOOK_URL` is set, backend fires an outbound
   POST to that URL with the lead payload + CRM deep link
   (`APP_BASE_URL` + `/admin/crm?lead=<id>`).
5. Zapier (or whatever receiver) picks up the webhook and routes the
   notification to Slack / email / SMS / etc.

The destination side of the webhook is configured entirely in Zapier,
so we can change the channel (Slack channel name, email recipient,
etc.) without a code deploy.

---

## What's in design, not yet built

Worth knowing because docs reference these and the code doesn't have
them yet:

### Home Decision Coach (AI orchestration layer)

- **Status:** Master System Prompt V1 drafted by Van (in
  `~/Desktop/VAN/AI Prompt_Home Decision Coach V1.docx`). Engineering
  response with proposed refinements drafted at
  `~/Desktop/VAN/email_to_van_ai_prompt_v1_response.md`.
- **Shape:** LLM (likely Claude) wraps each engine output with
  interpretation: "what the analysis shows / what this may mean /
  key tradeoffs / risks to validate / next best action / who should
  help."
- **Contract:** AI may interpret engine outputs but NEVER compute
  dollar figures. Engine remains source of truth.
- **Trigger model:** event-driven, not request-driven. Fires on
  `ANALYSIS_COMPLETED`, `SCENARIO_CHANGED`, `WORKFLOW_STALLED`, etc.
- **UI:** Insights Panel that appears throughout the workflow.
- **Eval anchor:** golden test set (trigger + structured context →
  expected insight) — must exist before the panel ships to users.

### Portfolio Engine V1

- **Status:** Architecture spec at
  [`PORTFOLIO_ENGINE_ARCH.md`](./PORTFOLIO_ENGINE_ARCH.md). Engine
  not built yet; awaiting weighting matrix from Van.
- **Estimated build:** ~1.5 weeks once weighting matrix lands.
- Feature-flagged off in prod via `VITE_PORTFOLIO_ENABLED`.

---

## See also

- [`ONBOARDING.md`](./ONBOARDING.md) — new dev's day-one read
- [`BACKEND.md`](./BACKEND.md) — backend internals and conventions
- [`FRONTEND.md`](./FRONTEND.md) — frontend internals and conventions
- [`SCENARIOS.md`](./SCENARIOS.md) — engine math + Excel mapping
- [`PORTFOLIO_ENGINE_ARCH.md`](./PORTFOLIO_ENGINE_ARCH.md) — V1 spec
- [`USER_FLOWS.md`](./USER_FLOWS.md) — product surface map
- [`DEPLOYING.md`](./DEPLOYING.md) — production deployment
- [`STAGING_SETUP.md`](./STAGING_SETUP.md) — parallel staging env
- [`MIGRATIONS.md`](./MIGRATIONS.md) — DB schema workflow
- [`ENV_VARS.md`](./ENV_VARS.md) — env var catalog
- [`INFRA_ROADMAP.md`](./INFRA_ROADMAP.md) — what to spend on, in what order
