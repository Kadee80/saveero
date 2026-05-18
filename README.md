# Saveero

A web platform that models a household's housing decisions, ranks them by
expected wealth outcome, and routes engaged leads to partner professionals.
Every number is derived from inputs the user provides — no black boxes, no
generic advice. **Two parallel scenario engines** serve the two main audiences:

**Homeowner engine** (`/decision-map`) — for users who already own:
1. **Stay** — keep the home and current mortgage (baseline)
2. **Refinance** — keep the home, replace the loan at a lower rate
3. **Sell + Buy** — sell current home and purchase a replacement
4. **Rent Out** — convert current home to a rental
5. **Rent Out & Buy** — retain current as rental + simultaneously purchase new primary

**First-time-homebuyer engine** (`/fthb-decision-map`) — for users buying their first home:
1. **Continue Renting** — invest the cash, accumulate savings
2. **Buy Starter Home** — entry-priced purchase at the universal down payment
3. **Buy Preferred Home** — higher-priced "reach" purchase
4. **Buy with Downpayment Assistance** — starter + DPA (50bps rate premium + forced repayment at horizon)
5. **Delay Purchase** — wait one year, save more, reassess

Both engines are bit-for-bit golden-tested against the client's Excel models.

## Features

- **Dual scenario engines** — Homeowner (5 scenarios) and FTHB (5 scenarios), forked at signup
- **Decision Map** — Side-by-side comparison + recommendation with feasibility checks
- **Step-wizard input collection** — One decision per screen for consumers, with a one-click toggle to a dense all-fields form for power users (industry pros default to all-fields)
- **Mortgage Calculator** — Live single-scenario calculator with live Fed rates
- **Compare Scenarios** — Stack up to three financing scenarios (down payment / rate / term variants)
- **AI listing wizard** — Photo-to-listing with vision + LLM pipeline; staged progress UI for the ~1-2 min run
- **Save & resume** — Save named analyses; deep-link back from the Dashboard's Recent panel
- **Admin CRM** (`/admin/crm`) — Kanban or table view of leads; faceted filtering; CSV export; bulk delete; in-drawer edit
- **Engaged-lead webhook** — Outbound notification (Zapier Catch Hook → any channel) when a lead clicks Contact-a-partner

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 + TypeScript + Tailwind CSS |
| Backend | FastAPI + Python 3.11 |
| Core Engine | Pure Python (stateless scenario calculations) |
| Database + Auth | Supabase (PostgreSQL + JWT) |
| AI | OpenRouter (vision + text models) |
| Frontend hosting | Vercel |
| Backend hosting | Render |

## Architecture Overview

The platform is built in three layers:

**1. Scenario engines** — two parallel packages
- `scenarios/` — homeowner engine (5 scenarios, ~45 inputs)
- `scenarios/fthb/` — first-time-homebuyer engine (5 scenarios, ~25 inputs)
- Pure Python, stateless, deterministic; both bit-for-bit golden-tested against the client's Excel models
- See [SCENARIOS.md](./SCENARIOS.md) for detailed calculation logic (Part 1 = homeowner, Part 2 = FTHB)

**2. Backend API** (FastAPI)
- REST endpoints for both scenario engines (`/api/scenarios/*` and `/api/fthb/scenarios/*`), mortgage analysis, AI listings, CRM lead management
- Supabase integration for authentication and persistence (leads, mortgage analyses, FTHB analyses)
- Outbound webhook for engaged-lead notifications (dormant unless `ENGAGED_LEAD_WEBHOOK_URL` is set)

**3. Frontend** (React + Vite)
- SPA with persona-aware routing — Dashboard hero forks by `lead.role`
- Shared `<InputCollector>` component for both Decision Map pages: step-wizard view (default for consumers) or dense all-fields view (default for industry pros), choice persisted in localStorage
- Admin CRM with Kanban / table views, faceted filtering, CSV export

**For end-user / user-guide writers:** Start with **[USER_FLOWS.md](./USER_FLOWS.md)** — page-by-page surface map written from the user's perspective.

**For developers:** Start with **[CLAUDE.md](./CLAUDE.md)** for commands and architecture overview. Then see:
- **[USER_FLOWS.md](./USER_FLOWS.md)** — Product surface map (user flows, page behaviors)
- **[SCENARIOS.md](./SCENARIOS.md)** — Complete scenario engine documentation for both engines
- **[BACKEND.md](./BACKEND.md)** — FastAPI architecture and API endpoints
- **[FRONTEND.md](./FRONTEND.md)** — React SPA structure and components

### Quick Start

**Backend:**
```bash
pip install -r requirements.txt
cp .env.example .env
# Edit .env with Supabase and OpenRouter keys
python3 -m uvicorn main:app --reload
# API available at http://localhost:8000/docs
```

**Frontend:**
```bash
cd webapp
npm install
cp .env.example .env
# Edit .env with Supabase and FRED API keys
npm run dev
# App available at http://localhost:5173
```

**Tests:**
```bash
pytest                                    # Run all tests
pytest tests/test_scenarios_golden.py -v # Run scenario engine tests
cd webapp && npm test                     # Run frontend tests
```

### Project Structure

```
saveero/
├── scenarios/              # Core scenario engine (pure Python, stateless)
│   ├── inputs.py          # Input validation
│   ├── stay.py, refinance.py, sell_buy.py, rent.py, rent_out_buy.py
│   ├── decision_map.py     # Rankings and recommendations
│   ├── engine.py           # Orchestrator
│   ├── audit.py            # Calculation trail
│   ├── schemas.py          # Pydantic HTTP models
│   └── core.py             # Shared utilities (amortization, tax, etc.)
├── api/
│   ├── scenario_routes.py  # POST /api/scenarios/* endpoints
│   ├── mortgage_routes.py  # Mortgage calculator endpoints
│   └── listing_wizard_routes.py  # AI listing endpoints
├── core/                   # Config, auth, database clients
├── mortgage/               # Mortgage analysis utilities
├── db/                     # Schema migrations
├── tests/                  # pytest test suite
├── webapp/                 # React frontend (Vite)
├── main.py                 # FastAPI entry point
├── CLAUDE.md               # Developer guide
├── SCENARIOS.md            # Scenario engine documentation
├── BACKEND.md              # Backend architecture
└── FRONTEND.md             # Frontend architecture
```

---

## Local Development

### Prerequisites
- Python 3.11 (via pyenv recommended)
- Node.js 18+
- A Supabase project
- An OpenRouter API key

### 1. Clone the repo
```bash
git clone https://github.com/Kadee80/saveero.git
cd saveero
```

### 2. Backend setup
```bash
# Install dependencies
pip install -r requirements.txt

# Copy and fill in the backend env file
cp .env.example .env
```

Edit `.env` with your Supabase and OpenRouter keys:
- **SUPABASE_URL** — From Supabase dashboard Settings → API
- **SUPABASE_SERVICE_ROLE_KEY** — From Supabase dashboard Settings → API
- **SUPABASE_JWT_JWK** — Fetch from `https://<your-project>.supabase.co/auth/v1/.well-known/jwks.json`
- **OPENROUTER_API_KEY** — From openrouter.ai

Run the database schema migration:
1. Log into your Supabase dashboard
2. Go to SQL Editor → "New Query"
3. Copy the contents of `db/migrations/001_initial_schema.sql`
4. Paste and execute

Start the backend:
```bash
python3 -m uvicorn main:app --reload
```

Backend API available at `http://localhost:8000`
- Access docs at `http://localhost:8000/docs` (Swagger UI)
- Health check: `curl http://localhost:8000/api/health`

### 3. Frontend setup
```bash
cd webapp
npm install
```

Copy and fill in the frontend env file:
```bash
cp .env.example .env
```

Start the dev server:
```bash
npm run dev
```
App available at `http://localhost:5173`

---

## Environment Variables

### Backend (`saveero/.env`)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role JWT (Settings → API) |
| `SUPABASE_JWT_AUDIENCE` | Set to `authenticated` |
| `SUPABASE_JWT_JWK` | Public key JSON from `<supabase-url>/auth/v1/.well-known/jwks.json` |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `BRIDGE_SERVER_KEY` | Optional — Bridge RESO MLS API key |
| `ENGAGED_LEAD_WEBHOOK_URL` | Optional — Zapier Catch Hook (or any webhook URL) fired when a lead enters `engaged`. Unset = notifications silently skipped. |
| `APP_BASE_URL` | Optional — public app URL used to build CRM deep-links in the notification payload |

### Frontend (`webapp/.env`)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_API_URL` | Backend URL (blank for local dev, Render URL for production) |
| `VITE_FRED_API_KEY` | FRED API key for live mortgage rates (free at fred.stlouisfed.org) |

---

## Deployment

See [DEPLOYING.md](./DEPLOYING.md) for full step-by-step instructions covering Render (backend), Vercel (frontend), and Supabase setup.

---

## Project Structure

```
saveero/
├── main.py                  # FastAPI app entry point
├── requirements.txt
├── api/
│   └── listing_wizard_routes.py   # Listing generate/save/list endpoints
├── core/
│   ├── auth.py              # JWT authentication dependency
│   ├── config.py            # Pydantic settings (reads from .env)
│   └── database.py          # Supabase client singleton
├── listing_wizard/
│   ├── listing_generator.py # AI listing generation (OpenRouter + LangChain)
│   ├── image_describer.py   # Vision model image analysis
│   └── models.py            # Pydantic data models
├── mortgage/                # Mortgage calculation logic
├── db/
│   └── migrations/          # SQL schema files
├── webapp/                  # React frontend (Vite)
│   ├── src/
│   │   ├── pages/           # Dashboard, ListProperty, MortgageCalculator, ScenarioComparison, Login
│   │   ├── api/             # Frontend API clients (auth, listings, rates)
│   │   └── components/      # Shared UI components
│   └── vercel.json          # Vercel routing config
├── DEPLOYING.md             # Deployment guide
└── CONTRIBUTING.md          # Local setup and contribution guide
```
