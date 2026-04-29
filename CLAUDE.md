# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product Overview

**Saveero** is a home decision platform that models five realistic housing scenarios (Stay, Refinance, Sell+Buy, Rent Out, Rent Out+Buy) for homeowners. The core engine calculates financial outcomes for each scenario based on 45 user inputs, generates a Decision Map with rankings and recommendations, and produces lead capture data for mortgage banks, realtors, and financial planners.

The product is split into three phases:
1. **Month 1 (Current)** — Scenario calculation engine (complete) ✓
2. **Month 2** — Lead capture loop + professional notifications (in progress)
3. **Month 3** — Multi-tenant white-label + billing + analytics (planned)

---

## Architecture Overview

### Backend (FastAPI + Python)

The backend is a stateless REST API that exposes the scenario engine via HTTP. Three routers handle distinct workflows:

```
main.py (FastAPI entry point)
├── /api/scenarios/*  (scenario_routes.py)  — Housing decision models
├── /api/mortgage/*   (mortgage_routes.py)  — Mortgage analysis  
└── /api/listings/*   (listing_wizard_routes.py)  — AI listing generation
```

### Scenario Engine (Pure Python Domain Logic)

The `scenarios/` module is the core—a stateless, deterministic calculator with no I/O:

```
scenarios/
├── inputs.py          — MasterInputs dataclass (45 fields all inputs)
├── stay.py            — Stay scenario calculation
├── refinance.py       — Refinance scenario calculation
├── sell_buy.py        — Sell + Buy scenario calculation
├── rent.py            — Rent (investment view) calculation
├── rent_out_buy.py    — Rent Out & Buy scenario calculation
├── decision_map.py    — Cross-scenario comparison, rankings, feasibility checks
├── audit.py           — Audit trail of all calculations (source tracking)
├── engine.py          — Orchestrator: runs all 5 scenarios + audit in sequence
├── schemas.py         — Pydantic models (HTTP request/response wire format)
└── __init__.py        — Public API exports
```

**Key design pattern:** The scenarios module exports **domain types** (dataclasses like `StayResult`, `RefinanceResult`). The API layer imports these and converts to/from Pydantic **schemas** for HTTP. This decouples internal logic from HTTP concerns.

### Data Flow

```
HTTP Request (JSON)
    ↓
MasterInputsRequest (Pydantic schema)
    ↓
.to_inputs() → MasterInputs (dataclass)
    ↓
run_all() / compute_* (pure Python)
    ↓
StayResult, RefinanceResult, ... (dataclasses)
    ↓
RunAllResponse.from_result() (convert to Pydantic)
    ↓
HTTP Response (JSON)
```

### Frontend (React + Vite)

The React SPA in `webapp/` consumes the backend API:

```
webapp/src/
├── pages/            — Route components (Dashboard, ListProperty, ScenarioComparison)
├── api/              — HTTP clients (auth.ts, listingApi.ts, scenarioApi.ts, ratesApi.ts)
├── components/ui/    — Reusable UI primitives (Button, Card, Input)
└── lib/              — Utilities (mortgage.ts, utils.ts)
```

---

## Development Commands

### Backend

```bash
# Install dependencies
pip install -r requirements.txt

# Run the API server locally with auto-reload
python3 -m uvicorn main:app --reload

# Or use the CLI entry point (equivalent)
python3 main.py --reload --port 8000

# Run all tests
pytest

# Run a specific test
pytest tests/test_scenarios_golden.py

# Run tests in a module
pytest tests/test_scenarios_golden.py::TestStayScenario

# Run tests matching a keyword
pytest -k "stay" -v

# Run with coverage
pytest --cov=scenarios tests/

# Access interactive API docs
# Open http://localhost:8000/docs
```

### Frontend

```bash
cd webapp

# Install dependencies
npm install

# Run dev server (auto-reload, opens at http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Run tests
npm test

# Run tests in UI mode
npm test:ui

# Generate coverage report
npm run test:coverage
```

### Database

Migrations are SQL files in `db/migrations/`. Run them manually in Supabase:
1. Supabase dashboard → SQL Editor → "New Query"
2. Paste contents of migration file
3. Execute

---

## Key Files and Responsibilities

### Inputs & Validation

**`scenarios/inputs.py`** — `MasterInputs` dataclass holding all 45 inputs. Client provides these values via the HTTP API. Key methods:
- `validate()` — Raises `ValueError` if inputs are invalid
- Ranges and constraints are documented inline

**`api/scenario_routes.py`** — Accepts `MasterInputsRequest` (Pydantic), converts to `MasterInputs`, validates, calls compute functions.

### Scenario Calculations

Each scenario module exports a `compute_*()` function that takes `MasterInputs` and returns a result dataclass:

- **`stay.py`** → `compute_stay()` → `StayResult`
- **`refinance.py`** → `compute_refinance()` → `RefinanceResult`
- **`sell_buy.py`** → `compute_sell_buy()` → `SellBuyResult` (needs Stay for monthly-cost reference)
- **`rent.py`** → `compute_rent()` → `RentResult`
- **`rent_out_buy.py`** → `compute_rent_out_buy()` → `RentOutBuyResult` (needs Stay)

Each result dataclass has:
- `.from_result()` class method to convert to Pydantic schema for HTTP response
- Calculated fields (equity, monthly costs, break-even, etc.)

### Decision Map & Recommendations

**`decision_map.py`** — Takes all 5 scenario results and produces:
- **Recommendation** — Which scenario ranks #1 for the homeowner
- **Rankings** — All 5 scenarios ranked by wealth outcome
- **Feasibility flags** — Is this scenario actually doable? (e.g., "Rent Out & Buy" flags if insufficient liquidity)
- **Comparison table** — Side-by-side monthly costs and net position for all scenarios

Called by `POST /api/scenarios/decision-map`.

### Audit Trail

**`audit.py`** — Traces every calculation back to inputs for transparency. `run_all()` calls `run_audit()` at the end.

**`engine.py`** — Orchestrates the full engine:
```python
result = run_all(inputs)
# Returns EngineResult with:
# - stay, refi, sell_buy, rent, rent_out_buy (all 5 scenarios)
# - decision_map (recommendations)
# - audit (source of truth)
```

### Schemas (HTTP Wire Format)

**`scenarios/schemas.py`** — Pydantic models for HTTP:
- `MasterInputsRequest` — What the client POSTs
- `StayOut`, `RefinanceOut`, `SellBuyOut`, etc. — What the API returns
- Each has `.from_result()` to convert domain types to HTTP schema

Example:
```python
@router.post("/scenarios/run")
def run_full_engine(body: MasterInputsRequest) -> RunAllResponse:
    result = run_all(body.to_inputs())
    return RunAllResponse.from_result(result)  # Domain → HTTP
```

---

## API Endpoints

All endpoints accept `MasterInputsRequest` (the 45 homeowner inputs) and return scenario results.

### Full Engine
- `POST /api/scenarios/run` → `RunAllResponse` (all 5 scenarios + decision map + audit)

### Individual Scenarios
- `POST /api/scenarios/stay` → `StayOut`
- `POST /api/scenarios/refinance` → `RefinanceOut`
- `POST /api/scenarios/sell-buy` → `SellBuyOut`
- `POST /api/scenarios/rent` → `RentOut`
- `POST /api/scenarios/rent-out-buy` → `RentOutBuyOut`

### Comparisons
- `POST /api/scenarios/decision-map` → `DecisionMapOut` (recommendations + rankings only, no detail cards)

### Other
- `GET /api/health` — Server health check
- `POST /api/listings/generate` — AI listing from photos
- `GET /api/mortgage/rates` — Live federal reserve rates

---

## Testing

**Backend tests** live in `tests/` and use `pytest`:

- **`test_scenarios_golden.py`** — Golden-path tests for all 5 scenarios. Each test provides inputs, calls the engine, and asserts expected outputs. **Start here when modifying scenario logic.**
- **`test_scenarios_core.py`** — Core utility tests (amortization, tax shields, etc.)
- **`test_auth.py`** — JWT authentication and Supabase integration
- **`test_mortgage_*.py`** — Mortgage calculator tests
- **`test_listing_routes.py`** — AI listing generation tests

**Conftest.py** provides shared fixtures:
- `mock_supabase_client` — Mocked Supabase (no DB calls)
- `test_inputs()` — Standard test input set matching the product briefs
- Other mocks for OpenRouter, FRED API, etc.

**Frontend tests** in `webapp/` use `vitest` (Vite's test runner).

---

## Configuration & Secrets

### Backend (`.env`)

```bash
# Supabase credentials (required for prod; mocked in tests)
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_AUDIENCE=authenticated
SUPABASE_JWT_JWK={...json...}

# AI/LLM (required for listing generation)
OPENROUTER_API_KEY=...

# Optional
BRIDGE_SERVER_KEY=...     # RESO MLS API key

# Frontend distribution directory (for static hosting)
FRONTEND_DIST_DIR=./webapp/dist
```

### Frontend (`webapp/.env`)

```bash
# Supabase (required)
VITE_SUPABASE_URL=https://...supabase.co
VITE_SUPABASE_ANON_KEY=...

# Backend API URL (blank for local dev)
VITE_API_URL=http://localhost:8000

# Mortgage rates API (required)
VITE_FRED_API_KEY=...
```

See `.env.example` files for templates.

---

## Common Development Workflows

### Adding a New Input Field

1. Add field to `MasterInputs` dataclass in `scenarios/inputs.py`
2. Add Pydantic field to `MasterInputsRequest` in `scenarios/schemas.py`
3. Update all scenario calculations if this input affects logic
4. Add to golden-path test inputs in `test_scenarios_golden.py`
5. Rebuild frontend form in `webapp/src/pages/ScenarioComparison.tsx`

### Modifying Scenario Calculation Logic

1. Edit the scenario module (e.g., `sell_buy.py`)
2. Update the result dataclass if needed
3. Add corresponding Pydantic schema change in `schemas.py`
4. **Run golden-path tests**: `pytest tests/test_scenarios_golden.py -v`
5. Update expected values in tests as needed
6. The audit module auto-documents what changed

### Running a Single Scenario Test

```bash
pytest tests/test_scenarios_golden.py::TestSellBuyScenario::test_sell_buy_basic -v
```

### Running Full API Workflow Test

The `test_listing_routes.py` and `test_auth.py` examples show how to hit the API endpoints end-to-end with mocked Supabase. Use as templates for new integrations.

---

## Deployment

See `DEPLOYING.md` for detailed instructions on deploying to:
- Backend → Render.com (Python/FastAPI)
- Frontend → Vercel (React/Vite)
- Database → Supabase (PostgreSQL + Auth)

---

## Useful References

- **FastAPI docs**: http://localhost:8000/docs (Swagger UI) — auto-generated from code
- **Product spec**: See `/VAN/Saveero_Master_Brief.docx` for full scenario definitions and formulas
- **Database schema**: `db/migrations/001_initial_schema.sql`
- **Test fixtures**: `tests/conftest.py` — mock data, clients, test inputs
