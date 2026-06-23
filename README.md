# Saveero

A web platform that helps homeowners and prospective homebuyers compare
their realistic housing options — stay, refinance, sell, rent, buy a
first home, or build a real-estate portfolio — using deterministic
scenario engines pinned cell-for-cell to client-validated Excel models.

Every number is derived from inputs the user provides. No black boxes,
no generic advice. AI is the interpretive layer on top (in design,
see [`docs/AI_COACH.md`](./docs/AI_COACH.md) when it lands), not a
replacement for the engine math.

---

## Engines

Three parallel scenario engines, forked at signup based on the user's
self-reported role:

**Homeowner** — `/decision-map`
1. **Stay** — keep the home and current mortgage (baseline)
2. **Refinance** — keep the home, replace the loan at a lower rate
3. **Sell + Buy** — sell current home and purchase a replacement
4. **Rent Out** — convert current home to a rental
5. **Rent Out & Buy** — retain current as rental + purchase new primary

**First-time homebuyer** — `/fthb-decision-map`
1. **Continue renting** — invest the cash, accumulate savings
2. **Buy starter home** — entry-priced purchase
3. **Buy preferred home** — higher-priced "reach" purchase
4. **Buy with downpayment assistance** — starter + DPA (50bps rate premium, forced repayment at horizon)
5. **Delay purchase** — wait one year, save more, reassess

**Real estate portfolio** — `/portfolio-builder` *(feature-flagged off in prod pending Van's weighting matrix)*
- 8 starting strategies (Use Available Cash, HELOC, Conventional Cash-Out, DSCR Cash-Out, No-Ratio, Sell & Redeploy, Combination, Bridge/Hard Money) scored across 8 dimensions and weighted by the user's stated goal (Build Wealth / Generate Passive Income / Preserve Liquidity / Minimize Risk). Designed as an open registry — adding a 9th strategy is one new file + one registry entry.

All three engines are golden-tested against the underlying Excel models.

---

## Surfaces

| Page | Path | Notes |
|---|---|---|
| Landing | `/` | Anonymous marketing page. Six scenario cards, sticky top nav, every CTA routes to `/start`. |
| Intake wizard | `/start` | Anonymous-friendly version of `OnboardingWizard` — stashes answers to localStorage, routes the user to the matching engine on completion, replays into the lead row on signup. |
| Homeowner Decision Map | `/decision-map` | Anonymous-friendly. Step wizard (default) or "All fields" form (default for industry pros), toggle persists. |
| FTHB Decision Map | `/fthb-decision-map` | Anonymous-friendly. Same shared `InputWizard` chrome. |
| Portfolio Builder | `/portfolio-builder` | Feature-flagged (`VITE_PORTFOLIO_ENABLED`). |
| Mortgage Calculator | `/mortgage-calculator` | Live single-scenario calculator with live FRED rates. |
| Compare Scenarios | `/scenarios` | Stack up to three financing scenarios. |
| List Property | `/list-property` | AI listing wizard — photo + vision + LLM pipeline. |
| Dashboard | `/` (authed) | Persona-aware hub. Forks the hero tool by `lead.role`. |
| Admin CRM | `/admin/crm` | Kanban + table views, faceted filtering, CSV export, in-drawer edit. Engaged-lead webhook → Zapier. |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 · Vite 5 · TypeScript · Tailwind · shadcn/ui · GSAP (animations) |
| Backend | FastAPI · Python 3.11 |
| Engines | Pure Python (stateless, deterministic, golden-tested) |
| Database + Auth | Supabase (PostgreSQL + JWT) |
| AI / LLM | OpenRouter (vision + text) — listings today; Home Decision Coach in design |
| Product analytics | Mixpanel (client-side; no-op without `VITE_MIXPANEL_TOKEN`) |
| Frontend hosting | Vercel |
| Backend hosting | Render |

---

## Documentation map

Three docs at the root, everything else in [`docs/`](./docs/):

| Audience | Start here |
|---|---|
| **New devs (joining the team)** | [`docs/ONBOARDING.md`](./docs/ONBOARDING.md) → [`CONTRIBUTING.md`](./CONTRIBUTING.md) → [`docs/INFRA_ROADMAP.md`](./docs/INFRA_ROADMAP.md) |
| **Devops / infra work** | [`docs/DEPLOYING.md`](./docs/DEPLOYING.md), [`docs/STAGING_SETUP.md`](./docs/STAGING_SETUP.md), [`docs/BRANCH_PROTECTION.md`](./docs/BRANCH_PROTECTION.md), [`docs/INFRA_ROADMAP.md`](./docs/INFRA_ROADMAP.md), [`docs/ENV_VARS.md`](./docs/ENV_VARS.md), [`docs/MIGRATIONS.md`](./docs/MIGRATIONS.md) |
| **Backend / engine work** | [`docs/BACKEND.md`](./docs/BACKEND.md), [`docs/SCENARIOS.md`](./docs/SCENARIOS.md), [`docs/PORTFOLIO_ENGINE_ARCH.md`](./docs/PORTFOLIO_ENGINE_ARCH.md) |
| **Frontend work** | [`docs/FRONTEND.md`](./docs/FRONTEND.md), [`docs/USER_FLOWS.md`](./docs/USER_FLOWS.md) |
| **Test work** | [`docs/TESTING.md`](./docs/TESTING.md) |
| **Analytics** | [`docs/MIXPANEL_EVENTS.md`](./docs/MIXPANEL_EVENTS.md) |
| **High-altitude overview** | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| **Working with Claude in this repo** | [`CLAUDE.md`](./CLAUDE.md) |

---

## Quick start

**Prerequisites:** Python 3.11, Node 18+, a Supabase project, an OpenRouter API key.

```bash
# Backend
git clone https://github.com/Kadee80/saveero.git && cd saveero
pip install -r requirements.txt
cp .env.example .env       # fill in SUPABASE_* + OPENROUTER_API_KEY
python3 -m uvicorn main:app --reload          # http://localhost:8000

# Frontend (in a second terminal)
cd webapp
npm install
cp .env.example .env       # fill in VITE_SUPABASE_*
npm run dev                # http://localhost:5173

# Tests
pytest                                           # backend
cd webapp && npm test                            # frontend
```

The frontend dev server proxies `/api/*` to `localhost:8000`, so both run together against your local backend + real Supabase.

**Database setup:** run the SQL files in [`db/migrations/`](./db/migrations/) in order in your Supabase SQL editor. See [`docs/MIGRATIONS.md`](./docs/MIGRATIONS.md) for the full workflow + gotchas.

For a fuller setup walkthrough, see [`docs/ONBOARDING.md`](./docs/ONBOARDING.md).

---

## Project structure

```
saveero/
├── main.py                       # FastAPI entry point
├── requirements.txt
├── api/                          # FastAPI routers (one per concern)
│   ├── scenario_routes.py        # /api/scenarios/*    homeowner engine
│   ├── fthb_routes.py            # /api/fthb/*         FTHB engine
│   ├── portfolio_routes.py       # /api/portfolio/*    portfolio engine
│   ├── mortgage_routes.py        # /api/mortgage/*     calculator
│   ├── lead_routes.py            # /api/leads/*, /api/me/lead   CRM
│   └── listing_wizard_routes.py  # /api/listings/*     AI listings
├── scenarios/                    # Homeowner engine (pure Python)
│   ├── inputs.py engine.py decision_map.py audit.py schemas.py core.py
│   └── stay.py refinance.py sell_buy.py rent.py rent_out_buy.py
├── scenarios/fthb/               # FTHB engine (pure Python)
│   └── inputs.py engine.py decision_map.py …
├── portfolio/                    # Portfolio Strategy engine (pure Python)
│   ├── engine.py inputs.py schemas.py
│   ├── portfolio_analytics.py target_property.py
│   └── strategy_scoring.py goal_profiles.py product_rules.py
├── core/                         # Config, auth, DB clients
├── mortgage/                     # Mortgage calculator utilities
├── listing_wizard/               # AI listing generator
├── db/migrations/                # SQL schema files (run in order)
├── tests/                        # pytest suite
├── scripts/                      # one-off scripts (incl. gen_illustrations.py)
├── webapp/                       # React + Vite frontend
│   ├── src/
│   │   ├── pages/                # Route-level components
│   │   ├── api/                  # HTTP clients (one per backend router)
│   │   ├── components/           # Shared UI (InputWizard, HelpTip, etc.)
│   │   ├── components/ui/        # shadcn primitives
│   │   ├── copy/tooltips.ts      # Centralised help-tip copy
│   │   ├── analytics/mixpanel.ts # Typed Mixpanel wrapper
│   │   ├── hooks/                # useGsapFadeIn etc.
│   │   └── App.tsx               # Top-level routing + shells (authed + anon)
│   └── vercel.json
├── docs/                         # All long-form docs (see Documentation map above)
├── CLAUDE.md                     # Guidance for Claude when editing this repo
└── CONTRIBUTING.md               # How to work in this codebase
```

---

## License

Proprietary. © Saveero.
