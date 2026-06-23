# CLAUDE.md

Guidance for Claude when working in this repository. Read this first, then go deep into the per-area docs in `docs/`.

---

## What this codebase is

Saveero is a web platform that compares housing decisions using deterministic Python engines pinned to client-validated Excel models. The product has three audiences, served by three parallel engines that share UI chrome:

- **Homeowners** → `scenarios/` engine, `/decision-map` page
- **First-time buyers** → `scenarios/fthb/` engine, `/fthb-decision-map` page
- **Real-estate investors** → `portfolio/` engine, `/portfolio-builder` page (feature-flagged off in prod pending the goal weighting matrix)

All three engines are pure Python, stateless, deterministic. The backend wraps them in FastAPI; the frontend is a React + Vite SPA. Auth + storage is Supabase. See [`README.md`](./README.md) for the broader picture and [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for system-level diagrams.

---

## Where things live

```
api/                  FastAPI routers   one per concern (scenarios, fthb, portfolio,
                                        mortgage, leads, listings)
scenarios/            Homeowner engine  pure Python — pinned to Excel via golden tests
scenarios/fthb/       FTHB engine       same pattern, separate package
portfolio/            Portfolio engine  same pattern; open strategy registry
core/                 Config, auth, DB clients (Supabase admin + anon)
mortgage/             Mortgage calculator utilities (single-scenario math)
listing_wizard/       AI listing generator (OpenRouter — vision + text)
db/migrations/        SQL files, run in order in Supabase SQL editor
tests/                pytest — engine + API + auth + listing
webapp/src/           React + Vite SPA
  pages/              Route-level (DecisionMap, FTHBDecisionMap, PortfolioBuilder,
                      AdminCRM, OnboardingWizard, StartIntake, Landing, etc.)
  api/                Frontend HTTP clients — one per backend router
  components/         Shared UI (InputWizard, HelpTip, SignupPrompt, …)
  components/ui/      shadcn primitives
  copy/tooltips.ts    Centralized help-tip copy (referenced by slug from FieldDef.help)
  analytics/mixpanel.ts  Typed wrapper around mixpanel-browser
  hooks/useGsapFadeIn.ts GSAP fade/split-text helpers
  App.tsx             Top-level routing + auth-conditional shells (AnonymousShell
                      for logged-out, full sidebar shell for authed)
docs/                 All long-form docs (see README.md "Documentation map")
scripts/              One-off scripts (gen_illustrations.py for DALL-E images)
```

---

## Key design patterns

### Engines are pure functions; routers convert to HTTP

Each scenario module exports compute functions taking dataclass inputs and returning dataclass results. The `engine.py` orchestrates them. Routers in `api/` import the engine + Pydantic schemas (defined alongside in `schemas.py`) and convert between the two. The pattern, verbatim, is:

```python
@router.post("/scenarios/run")
def run_full_engine(body: MasterInputsRequest) -> RunAllResponse:
    result = run_all(body.to_inputs())           # Pydantic → dataclass → engine → dataclass
    return RunAllResponse.from_result(result)    # dataclass → Pydantic → HTTP
```

This decoupling matters. The engine has no HTTP concerns; it's testable as pure Python. The schemas can evolve independently of the math. Maintain this separation when adding new endpoints.

### Engines are golden-tested against Excel

Every cell-level output the engine produces has a golden test asserting it matches the corresponding Excel model. When changing engine math, run the relevant golden suite (`pytest tests/test_scenarios_golden.py -v` for homeowner, `pytest tests/test_fthb_golden.py -v` for FTHB) and re-pin if the new value is correct. Don't change a golden without understanding why.

### The frontend wizard chrome is shared

`InputWizard` + `InputCollector` in `webapp/src/components/InputWizard.tsx` is the shared step-wizard component used by all three Decision Map pages. Adding a new wizard step elsewhere should reuse it — same `WizardStep` shape, same field kinds (`money`, `percent`, `months_as_years`, etc.), same illustration slot. Don't fork it.

### Anonymous users are first-class

Every calculator page runs end-to-end without auth. `AnonymousShell` wraps the unauthed routes with a slim sidebar; engines accept anonymous requests; save/contact-a-pro buttons degrade to `SignupPrompt`. The `useSession()` hook returns `Session | null | undefined` — `undefined` means "still loading", which matters because routing decisions made on `null` before the session resolves will mis-route. See `webapp/src/api/auth.ts` and `webapp/src/api/anonStash.ts` (intake answers + last-run survive signup and replay into the lead row).

### Mixpanel is no-op without a token

`webapp/src/analytics/mixpanel.ts` initializes only if `VITE_MIXPANEL_TOKEN` is set; without it, every `analytics.track()` and `analytics.identify()` call is a silent no-op. Safe to add tracking calls anywhere — they cost nothing if the token is absent. Event catalog (when it lands) at [`docs/MIXPANEL_EVENTS.md`](./docs/MIXPANEL_EVENTS.md).

---

## Commands

### Backend

```bash
pip install -r requirements.txt
python3 -m uvicorn main:app --reload                      # http://localhost:8000
                                                          # /docs for Swagger UI

pytest                                                    # full suite
pytest tests/test_scenarios_golden.py -v                  # homeowner engine
pytest tests/test_fthb_golden.py -v                       # FTHB engine
pytest tests/test_portfolio_*.py -v                       # portfolio engine
pytest -k "stay" -v                                       # keyword filter
pytest --cov=scenarios tests/                             # coverage
```

### Frontend

```bash
cd webapp
npm install
npm run dev                                               # http://localhost:5173

npm run build                                             # production bundle
npm run preview                                           # serve the prod bundle
npm test                                                  # vitest
npm run test:coverage                                     # coverage
```

The Vite dev server proxies `/api/*` → `localhost:8000`, so backend + frontend run together against your local backend + real Supabase.

### Database

Migrations are SQL files in `db/migrations/`, numbered, run in order. Manual run-after-merge convention today: paste contents into the Supabase SQL Editor and execute. Detailed workflow + the `spatial_ref_sys` gotcha at [`docs/MIGRATIONS.md`](./docs/MIGRATIONS.md).

---

## Common workflows

### Adding a new field to an engine

1. Add to the dataclass in `scenarios/inputs.py` (or `scenarios/fthb/inputs.py`, etc.)
2. Add to the Pydantic request schema in `schemas.py`
3. Update the compute function(s) that use it
4. Update the golden test fixture inputs + re-run the golden suite
5. If user-facing: add to the relevant `STEPS` array in `webapp/src/pages/DecisionMap.tsx` or `FTHBDecisionMap.tsx`; add tooltip copy to `webapp/src/copy/tooltips.ts`

### Adding a new API endpoint

1. Pick (or add) the router in `api/`
2. Define request/response Pydantic models in the relevant `schemas.py`
3. Wire up the endpoint: convert request → dataclass → engine → dataclass → response
4. Add a test in `tests/`
5. Mount the router in `main.py` if it's a new file
6. Add a thin TS client in `webapp/src/api/` if the frontend will call it

### Adding a new wizard step

1. Add a `WizardStep` entry to the page's `STEPS` array
2. Set `title`, `icon`, optional `description` (warm, conversational copy), `illustrationName`
3. Generate the illustration: add a prompt to `scripts/gen_illustrations.py` PROMPTS dict, delete any existing file at that name, run `python scripts/gen_illustrations.py`
4. The shared `InputWizard` picks it up automatically

### Reading a saved scenario

Auth-gated endpoints under `/api/scenarios/saved/*` and `/api/fthb/analyses/*`. Recent panel on the Dashboard pulls from both. See `webapp/src/api/scenarioApi.ts` and `fthbApi.ts`.

---

## Things to avoid

- **Don't put math in the API layer.** Routers should be pass-throughs. Math lives in the engine package, period.
- **Don't make LLM-generated numbers appear in results.** Engine output is the source of truth for any dollar figure. AI's role is interpretation, not calculation.
- **Don't fork `InputWizard` per page.** Add a new `FieldKind` if a new input type is needed, but keep the shared component.
- **Don't add a redirect guard on `/decision-map` or `/fthb-decision-map`.** Direct URLs are intentionally shareable; people send them to friends. See `feedback_shareable_calculator_urls.md` in agent memory.
- **Don't surface auth-only nav items as hidden.** The anonymous sidebar shows everything with a Lock icon on locked items — every click is a conversion event. See `feedback_locked_features_visible.md` in agent memory.
- **Don't change golden test expected values to make a failing test pass.** If the engine output is correct, re-pin; if it's wrong, fix the engine.

---

## Pointers

- **Product surface map (user-flow oriented):** [`docs/USER_FLOWS.md`](./docs/USER_FLOWS.md)
- **Backend internals + conventions:** [`docs/BACKEND.md`](./docs/BACKEND.md)
- **Frontend internals + conventions:** [`docs/FRONTEND.md`](./docs/FRONTEND.md)
- **Scenario engine math + Excel mapping:** [`docs/SCENARIOS.md`](./docs/SCENARIOS.md)
- **Portfolio engine V1 spec:** [`docs/PORTFOLIO_ENGINE_ARCH.md`](./docs/PORTFOLIO_ENGINE_ARCH.md)
- **Deploying:** [`docs/DEPLOYING.md`](./docs/DEPLOYING.md) and [`docs/STAGING_SETUP.md`](./docs/STAGING_SETUP.md)
- **What's stale / how to onboard:** [`docs/ONBOARDING.md`](./docs/ONBOARDING.md) *(in progress)*
- **Env vars (single source of truth):** [`docs/ENV_VARS.md`](./docs/ENV_VARS.md) *(in progress)*
- **Conventions for the team:** [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- **Infra costs + roadmap:** [`docs/INFRA_ROADMAP.md`](./docs/INFRA_ROADMAP.md)
- **Product brief (canonical scenario definitions):** `~/Desktop/VAN/Saveero_Master_Brief.docx`
