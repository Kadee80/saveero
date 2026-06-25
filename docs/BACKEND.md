# Backend

The backend is a thin FastAPI layer that wraps the deterministic
Python engines and the Supabase integration. Read this for the
package map + conventions; for system-level context, see
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Package map

```
main.py                   FastAPI app, mounts all routers, /api/health

api/                      One router per concern, each mounted at /api
  scenario_routes.py        /api/scenarios/*     homeowner engine
  fthb_routes.py            /api/fthb/*          first-time buyer engine
  portfolio_routes.py       /api/portfolio/*     portfolio engine
  mortgage_routes.py        /api/mortgage/*      single-scenario calc + save/load
  lead_routes.py            /api/leads/*, /api/me/profile, /api/me/lead   CRM
  listing_wizard_routes.py  /api/listings/*      AI listing generator

core/
  config.py                 Pydantic settings — single source for all env vars
  auth.py                   JWT validation against Supabase JWK
  database.py               Supabase admin client singleton
  notifications.py          Engaged-lead webhook (Zapier-bound)

scenarios/                Homeowner engine — pure Python, golden-tested
  inputs.py                 MasterInputs dataclass (~45 fields)
  stay.py                   Stay scenario
  refinance.py              Refinance scenario
  sell_buy.py               Sell + Buy scenario
  rent.py                   Rent Out scenario
  rent_out_buy.py           Rent Out + Buy scenario
  decision_map.py           Cross-scenario ranking + feasibility checks
  engine.py                 Orchestrator: run_all() composes everything
  audit.py                  Calculation audit trail
  schemas.py                Pydantic wire format for HTTP
  core.py                   Shared utilities (amortization, tax, etc.)

scenarios/fthb/           First-time-buyer engine — same shape
  inputs.py engine.py decision_map.py audit.py schemas.py core.py
  starter.py preferred.py assistance.py delay.py rent.py
  _buy_common.py

portfolio/                Portfolio Strategy engine — same shape, larger
  inputs.py engine.py schemas.py
  portfolio_analytics.py   per-property analytics + portfolio totals
  target_property.py       what the user wants to buy
  strategy_scoring.py      8 dimensions × goal-weighted scoring
  goal_profiles.py         WEIGHTING_PROFILES keyed by InvestorGoal
  product_rules.py         editable rules-of-thumb constants
  dashboard.py             top-strategy summary

mortgage/                 Mortgage calculator + analyzer (separate from scenarios)
  analyzer.py refinance.py affordability.py
  schemas.py core.py

listing_wizard/           AI listing generator (OpenRouter vision + text)
  listing_generator.py image_describer.py models.py

db/
  migrations/               numbered SQL files — see MIGRATIONS.md

tests/                    pytest suite — mirrors the engine packages
```

---

## The router pattern

Every router follows the same shape. Internalize this — it's the
single most important pattern in the backend.

```python
# api/scenario_routes.py (simplified)
from scenarios.engine import run_all
from scenarios.schemas import MasterInputsRequest, RunAllResponse

@router.post("/scenarios/run", response_model=RunAllResponse)
def run_full_engine(body: MasterInputsRequest) -> RunAllResponse:
    result = run_all(body.to_inputs())           # Pydantic → dataclass → engine
    return RunAllResponse.from_result(result)    # dataclass → Pydantic → HTTP
```

The router knows about HTTP. The engine doesn't. The Pydantic schemas
in `<engine>/schemas.py` are the wire-format layer between them.

**Don't put math in the router.** If you find yourself writing
arithmetic in a route handler, it belongs in the engine package.

**Don't return engine dataclasses directly.** Convert through the
schema's `.from_result()` (or equivalent) — this gives us a stable
HTTP contract independent of the engine's internal types.

---

## Auth model

We're **anonymous-first**: most engine endpoints accept anonymous
requests. Persistence (save / load / list of saved analyses) requires
auth. The split:

| Surface | Auth required? |
|---|---|
| `POST /api/scenarios/*` (engine runs) | No |
| `POST /api/fthb/scenarios/*` (engine runs) | No |
| `POST /api/portfolio/run` (engine runs) | No |
| `POST /api/mortgage/analyze`, `/affordability`, `/refinance` (engine runs) | No |
| `POST/GET/DELETE /api/mortgage/analyses` (persistence) | **Yes** |
| `POST/GET /api/fthb/analyses` (persistence) | **Yes** |
| All `/api/leads/*`, `/api/me/*` | **Yes** |
| All `/api/listings/*` | **Yes** |

Auth is enforced via FastAPI's `Depends(get_current_user)` —
`core/auth.py` validates the Supabase JWT against the project's JWK
(loaded once at startup from `SUPABASE_JWT_JWK`, see
[`ENV_VARS.md`](./ENV_VARS.md)). The dependency returns a
`CurrentUser` dataclass which routers can introspect for `user_id`
and `email`.

To add auth to an endpoint:
```python
from core.auth import CurrentUser, get_current_user

@router.post("/my-thing")
def create_thing(body: ThingIn, user: CurrentUser = Depends(get_current_user)):
    # user.user_id, user.email available
    ...
```

To make an endpoint anonymous-friendly, just don't add the dependency.
Any `auth.uid()`-driven RLS still applies to DB calls, so leaving
auth off without thinking about persistence will silently break
anything that writes to a user-owned table.

---

## Adding a new endpoint

1. **Pick the router.** Endpoint serves an existing concern → use
   that router. Genuinely new concern → new file in `api/` and add
   to `main.py`'s `include_router` list.
2. **Define the request + response Pydantic models** in the
   appropriate `schemas.py` (engine-side if it wraps engine output;
   alongside the router otherwise).
3. **Write the route.** Follow the router pattern: convert at the
   boundary, don't compute in the handler.
4. **Decide auth.** If user-owned data crosses the boundary, add
   `Depends(get_current_user)`.
5. **Test.** Add a test under `tests/` — mirror the location of
   the router file. Use the existing fixtures (`tests/conftest.py`
   provides auth stubs, Supabase client mocks, etc.).
6. **Add a TS client.** Frontend should call through a typed
   function in `webapp/src/api/` — one client per backend router.

---

## Adding a new engine

Rare, but the pattern is established. The three existing engines
all follow it.

1. New top-level package (e.g. `affordability/`).
2. Pure-Python module-level functions with dataclass inputs and
   dataclass outputs. No I/O, no LLM calls, no time-dependence.
3. `engine.py` exposes the orchestrator (`run_all` or equivalent).
4. `schemas.py` holds Pydantic wire-format models with
   `.to_inputs()` and `.from_result()` converters.
5. **Cell-for-cell golden tests** pinning every output to the
   client-validated Excel model. Non-negotiable — see
   [`SCENARIOS.md`](./SCENARIOS.md) for the discipline.
6. New router in `api/<engine>_routes.py`. Mount in `main.py`.
7. TS client in `webapp/src/api/<engine>Api.ts`.
8. Architecture spec in `docs/<ENGINE>_ARCH.md` if the engine has
   substantive design decisions worth documenting separately.

The Portfolio engine is the most recent example — see
[`PORTFOLIO_ENGINE_ARCH.md`](./PORTFOLIO_ENGINE_ARCH.md) for the
spec that drove its build.

---

## Things to avoid

- **Don't put math in the API layer.** Routers convert HTTP to
  engine inputs and back. Math lives in the engine.
- **Don't read env vars outside `core/config.py`.** All env access
  goes through `settings`. If you need a new var, add it to the
  `Settings` class, the `.env.example`, and
  [`ENV_VARS.md`](./ENV_VARS.md).
- **Don't make the engine import from `api/` or `core/`.** Engines
  are pure Python. They depend on the standard library and a few
  shared utilities. That's it.
- **Don't bypass RLS by using the service role client for
  user-owned data.** The service role bypasses Row Level Security.
  Use the user's JWT for reads that should be RLS-gated. The service
  role client is for legitimately privileged operations (admin CRM,
  webhook payloads, etc.).
- **Don't change a golden test to make a failing test pass.** If
  the engine output is correct, re-pin; if it's wrong, fix the engine.
- **Don't catch and swallow engine exceptions in the router.** Let
  them bubble; FastAPI converts to 422/500 with useful detail.
  Silent fallback values mask broken math.

---

## Testing

```bash
pytest                                              # full suite
pytest tests/test_scenarios_golden.py -v            # homeowner engine
pytest tests/test_fthb_golden.py -v                 # FTHB engine
pytest tests/test_portfolio_*.py -v                 # portfolio engine
pytest -k "stay" -v                                 # keyword filter
pytest --cov=scenarios tests/                       # coverage
```

For test conventions + the golden-test discipline, see
[`TESTING.md`](./TESTING.md).

---

## See also

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system overview with diagram
- [`SCENARIOS.md`](./SCENARIOS.md) — engine math + Excel mapping
- [`PORTFOLIO_ENGINE_ARCH.md`](./PORTFOLIO_ENGINE_ARCH.md) — portfolio engine spec
- [`ENV_VARS.md`](./ENV_VARS.md) — every backend env var
- [`MIGRATIONS.md`](./MIGRATIONS.md) — schema workflow + gotchas
- [`FRONTEND.md`](./FRONTEND.md) — the consuming side
- [`TESTING.md`](./TESTING.md) — pytest setup + conventions
