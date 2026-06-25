# Testing

Test conventions, layout, and how to run things. The most important
discipline in this codebase is the **golden-test pattern for the
engines** — covered in detail below.

For higher-altitude context, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).
For where new tests should live when adding endpoints / pages, see
[`BACKEND.md`](./BACKEND.md) and [`FRONTEND.md`](./FRONTEND.md).

---

## Test layout

### Backend (pytest)

```
tests/
  conftest.py                       Shared fixtures, env stubs
  mock_responses.py                 Canned responses for external services

  test_scenarios_golden.py          Homeowner engine — cell-for-cell goldens
  test_scenarios_core.py            Shared scenario utilities
  test_fthb_golden.py               FTHB engine — cell-for-cell goldens
  test_portfolio_golden.py          Portfolio engine — cell-for-cell goldens

  test_mortgage_analyzer.py         Mortgage analyzer
  test_mortgage_affordability.py    Affordability calc
  test_mortgage_refinance.py        Refinance calc
  test_mortgage_core.py             Shared mortgage utilities

  test_auth.py                      JWT validation
  test_listing_routes.py            AI listing wizard endpoints
  test_notifications.py             Engaged-lead webhook firing
```

The directory mirrors the source layout — when adding a router or an
engine module, add a `test_*.py` file beside the existing peers.

### Frontend (Vitest + React Testing Library)

```
webapp/src/__tests__/
  api/
    auth.test.ts
  pages/
    Dashboard.test.tsx
    Login.test.tsx
  lib/
    mortgage.test.ts
```

Mirror the source layout — `pages/X.tsx` → `__tests__/pages/X.test.tsx`.

---

## Running tests

### Backend

```bash
# Full suite
pytest

# By file
pytest tests/test_scenarios_golden.py -v
pytest tests/test_fthb_golden.py -v
pytest tests/test_portfolio_golden.py -v

# By keyword (matches test or class names)
pytest -k "stay" -v
pytest -k "refinance and not rent" -v

# By class / function
pytest tests/test_auth.py::TestLogin -v
pytest tests/test_auth.py::TestLogin::test_valid_credentials -v

# Coverage report (HTML output in htmlcov/)
pytest --cov=scenarios --cov=portfolio --cov=api --cov-report=html

# Parallel (faster, needs pytest-xdist)
pip install pytest-xdist
pytest -n auto
```

### Frontend

```bash
cd webapp
npm test                       # vitest, headless
npm test -- --watch            # watch mode
npm test -- --ui               # Vitest UI in browser
npm test Login                 # specific test
npm run test:coverage          # coverage
```

---

## The golden-test pattern (engines)

The most important discipline in the codebase. Every engine output is
pinned to the client-validated Excel model with a golden test.

**What a golden test looks like:**

```python
# tests/test_scenarios_golden.py
def test_stay_scenario_net_position_at_5yr(default_inputs):
    result = compute_stay(default_inputs.set(hold_years=5))
    assert result.net_position == approx(412_345, abs=1)
```

The expected value (`412_345`) comes from the Excel model. Same
inputs → same number → test passes. If the engine math changes and
the new value differs from Excel:

- **Engine output is correct (Excel was wrong, or we changed the
  spec):** re-pin the golden. Commit message must explain WHY the new
  value is correct.
- **Engine output is wrong (we introduced a bug):** fix the engine
  until the golden passes again.

**Never change a golden to make a failing test pass without
understanding why.** The Excel model is the trust anchor — if we lose
that property, we lose the thing that distinguishes this product from
"yet another LLM that makes up mortgage math."

**Default-inputs fixtures** live in `conftest.py` and mirror the
default values in each engine's source Excel workbook. New engines
should add their own default-inputs fixture; new scenarios should
extend the existing fixture.

---

## Test environment

`tests/conftest.py` sets a handful of env vars at import time so the
backend's Pydantic settings load without requiring a real `.env`:

```python
os.environ['SUPABASE_URL'] = 'http://localhost:54321'
os.environ['SUPABASE_SERVICE_ROLE_KEY'] = 'test-key'
os.environ['OPENROUTER_API_KEY'] = 'test-key'
# ...
```

Tests that need to interact with Supabase or external services use
mocked clients from `conftest.py` fixtures — they never hit a real
service. If you add a test that genuinely needs a live Supabase
project, that's a sign the test should probably be mocking instead.

For external-service responses (OpenRouter, FRED, Bridge MLS),
canned responses live in `tests/mock_responses.py`.

---

## Frontend test conventions

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits with valid credentials', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)
    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/password/i), 'pw')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(mockedSignIn).toHaveBeenCalledWith('a@b.com', 'pw')
  })
})
```

- **Query by role / label**, not by class name or test-id.
  Test-IDs are an escape hatch for accessibility holes; don't reach
  for them first.
- **Mock at the API client boundary** (`webapp/src/api/*`), not at
  `fetch`. Keeps tests resilient to implementation churn.
- **`vi.clearAllMocks()` in `beforeEach`** to prevent state leak
  between tests.

---

## Pre-merge checklist

Before opening / merging a PR:

```bash
pytest                          # backend, all-green
cd webapp && npm test           # frontend, all-green
cd webapp && npm run build      # tsc + vite build, no errors
```

The `npm run build` step catches TypeScript errors that the
dev server silently ignores. Don't skip it.

If the PR touches engine math, run the relevant golden suite
specifically and look at what passed / failed. If you re-pinned
anything, the PR description should say so + explain why.

---

## CI

GitHub Actions workflows in `.github/workflows/`:

- **`ci.yml`** — runs `pytest` on every PR.
- **`tests.yml`** — runs the frontend suite (vitest) on every PR.
- **`deploy.yml`** — touches deployment-related actions.

Branch protection requires both checks to pass before merge — see
[`BRANCH_PROTECTION.md`](./BRANCH_PROTECTION.md).

---

## Things to avoid

- **Don't change a golden to make a failing test pass without
  re-deriving the Excel value.** Either the engine is wrong (fix
  it) or the Excel was wrong (re-pin and document).
- **Don't write tests that hit live external services.** Mock at the
  client boundary.
- **Don't share state between tests.** `beforeEach` should reset
  every mock and any module-level state.
- **Don't add `it.skip` to silence a failing test.** Either fix it,
  delete it, or open a follow-up issue with the test temporarily
  expected to fail (`xfail`) and a clear deadline.
- **Don't gold-plate test coverage on the engines via integration
  tests.** Per-cell unit goldens are how the engines stay trustworthy.
  An integration test that runs the whole engine and asserts on a
  summary number can pass while individual cells silently drift.

---

## See also

- [`BACKEND.md`](./BACKEND.md) — where to add backend tests
- [`FRONTEND.md`](./FRONTEND.md) — where to add frontend tests
- [`SCENARIOS.md`](./SCENARIOS.md) — engine math (the goldens pin to this)
- [`PORTFOLIO_ENGINE_ARCH.md`](./PORTFOLIO_ENGINE_ARCH.md) — golden discipline
  for the third engine
- [`BRANCH_PROTECTION.md`](./BRANCH_PROTECTION.md) — what CI checks gate merges
