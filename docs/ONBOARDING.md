# Onboarding — your first week on Saveero

**You are the second engineer on this project.** This doc gets you
from "just got repo access" to "shipped your first PR" in a day or
two. Read it in order. Each section ends with a checkable action —
work through them in sequence rather than skimming everything first.

If something here is wrong, outdated, or confusing, **fix it as you
go**. The doc you're reading is in `docs/ONBOARDING.md`. The next
person to onboard will thank you.

---

## What we're building

Saveero is a web platform that compares housing decisions using
deterministic Python engines pinned to client-validated Excel models.
Three audiences, three engines:

- **Homeowners** → `scenarios/` engine, `/decision-map` page
- **First-time buyers** → `scenarios/fthb/`, `/fthb-decision-map`
- **Real-estate investors** → `portfolio/`, `/portfolio-builder` (in
  build, feature-flagged off in prod)

Every dollar figure in the product comes from one of those engines.
The AI layer (in design — see [`ARCHITECTURE.md`](./ARCHITECTURE.md))
will wrap engine outputs with interpretation but **never** compute
dollar figures itself. Protect that boundary in code review.

Tech stack at a glance: React + Vite + TypeScript frontend, FastAPI +
Python backend, Supabase for DB + auth, Render for backend hosting,
Vercel for frontend hosting. Full picture in
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Day 1 — read these in order

1. **[`README.md`](../README.md)** — product elevator pitch and where
   each page lives. 5 minutes.
2. **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — system diagram +
   layer-by-layer mental model. 15 minutes.
3. **[`../CONTRIBUTING.md`](../CONTRIBUTING.md)** — how we commit,
   branch, PR, and review. Includes the "panic log" story from the
   previous iteration's commit history that explains our standards.
   10 minutes.
4. **[`INFRA_ROADMAP.md`](./INFRA_ROADMAP.md)** — what we're going to
   spend money on next, in what order, and why. Devops-aimed. This
   is what you'll likely own first. 10 minutes.
5. **[`ENV_VARS.md`](./ENV_VARS.md)** — every env var the app reads
   and where it lives in each environment. Reference doc, skim now,
   come back when setting things up.

**☑ Action:** by end of Day 1, you should be able to:
- Describe what the three engines compute, in one sentence each.
- Name the top three items on `INFRA_ROADMAP.md` and why they're #1-3.
- Find the file that owns env-var loading on the backend.

---

## Day 1.5 — get the app running locally

Detailed walkthrough in [`DEPLOYING.md`](./DEPLOYING.md) "Local
development" section. The short version:

```bash
# Clone
git clone https://github.com/Kadee80/saveero.git
cd saveero

# Backend (in one terminal)
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_JWK,
# OPENROUTER_API_KEY. Ask Katie for the values. (.env.example is
# currently missing SUPABASE_JWT_JWK — add it manually; full
# explanation in ENV_VARS.md.)
pip install -r requirements.txt
python3 -m uvicorn main:app --reload
# http://localhost:8000/docs for Swagger UI

# Frontend (in another terminal)
cd webapp
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (same
# Supabase project as the backend).
npm install
npm run dev
# http://localhost:5173

# Tests
pytest                                # backend
cd webapp && npm test                  # frontend
```

**☑ Action:**
- App loads at `http://localhost:5173`.
- You can sign up with a test email (`yourname+test@gmail.com`),
  reach the Dashboard, click into the Decision Map, run a
  recalculate, and see results render.
- `pytest` returns all-green locally.
- `cd webapp && npm test` returns all-green locally.

**If any of those fail**, that's your first bug to file and fix.
Document the fix in this doc and `DEPLOYING.md` if it's something a
future onboard would hit.

---

## Day 2 — understand the engines

The engines are the trust anchor for the whole product. Spend an
afternoon here even if you don't expect to touch them.

1. Open `scenarios/inputs.py`. Read the `MasterInputs` dataclass.
   That's the full input surface for the homeowner engine.
2. Open `scenarios/stay.py`. Read `compute_stay`. It's the simplest
   scenario — current home, current mortgage, project forward over
   `hold_years`.
3. Open `scenarios/engine.py`. Read `run_all`. That's the
   orchestrator: takes `MasterInputs`, runs each scenario, builds
   the decision map.
4. Open `tests/test_scenarios_golden.py`. Pick any test. Read what
   it asserts — every test pins one cell of one scenario against the
   Excel model.

Now run those tests with verbose output:
```bash
pytest tests/test_scenarios_golden.py -v | head -40
```

Each test name describes which scenario/which cell it pins. The
green dots are the trust anchor.

**Engine conventions worth internalizing:**
- **Pure Python.** No I/O, no LLM calls, no network, no
  time-dependence. Stateless functions over dataclass inputs.
- **Decoupled from HTTP.** Routers in `api/` import the engine and
  the Pydantic schemas alongside, then convert at the boundary.
  Don't put math in routers.
- **Golden-tested.** Every cell-level output has a test. When you
  change engine math, run the relevant golden suite. Re-pin if and
  only if you understand why the new value is correct. Don't change
  a golden to make a failing test pass — fix the engine instead.

The same pattern applies to `scenarios/fthb/` (next step up in
complexity) and `portfolio/` (in build).

**☑ Action:** be able to answer "where would I add a new scenario to
the homeowner engine?" and "what test would I write?"

---

## Day 3 — understand the frontend chrome

The frontend is mostly conventional React + Vite. A few patterns are
load-bearing and worth knowing.

1. Open `webapp/src/App.tsx`. Top-level routing. Note the
   **anonymous vs authed split** — `AnonymousShell` wraps unauthed
   routes, the full sidebar shell wraps authed ones. Both render the
   same calculator pages.
2. Open `webapp/src/components/InputWizard.tsx`. This is the
   **shared** step-wizard used by all three engines. `WizardStep`,
   `FieldKind`, `InputCollector`. Don't fork it; add a new
   `FieldKind` if you need a new input type.
3. Open `webapp/src/api/anonStash.ts`. The localStorage bridge
   between an anonymous user's intake answers + the lead row that
   gets seeded on signup. Read the comments — there's a real
   product reason for the timing.
4. Open `webapp/src/analytics/mixpanel.ts`. Typed wrapper around
   `mixpanel-browser`. Safe to add `analytics.track()` calls
   anywhere — costs nothing if `VITE_MIXPANEL_TOKEN` is unset.

**Key conventions:**
- **Anonymous users are first-class.** Every calculator page works
  end-to-end without auth. `AnonymousShell` shows the full nav with
  Lock icons on locked items — each click is a conversion event.
- **`useSession()` returns `Session | null | undefined`.** `undefined`
  means "still loading." Routing decisions made on `null` before the
  session resolves will mis-route.
- **Don't redirect-guard `/decision-map` or `/fthb-decision-map`.**
  Direct URLs are intentionally shareable; people send them to
  friends.
- **One API client per backend router.** They live in
  `webapp/src/api/`. No `fetch()` calls from components — go through
  the typed client.

**☑ Action:** be able to answer "where do I add a new wizard step?"
and "what determines whether the user sees the authed sidebar or
`AnonymousShell`?"

---

## Day 3.5 — ship a starter PR

A small change that exercises the whole loop. Pick one from the list
or invent your own with Katie's sign-off:

- **A doc fix.** Read any markdown file end-to-end. Anything that
  doesn't match current behavior, fix in a PR. (Honestly the highest-
  leverage starter PR — every fix prevents the next onboard's
  confusion.)
- **A tooltip copy improvement.** Pick a field on any calculator
  page; check its `help` slug in `webapp/src/copy/tooltips.ts`;
  improve the copy if you can.
- **A test you'd want to exist.** Pick any engine function that
  doesn't have a test you'd want; write it.

The full workflow: branch off `main`, push, open PR, get reviewed,
merge. See [`../CONTRIBUTING.md`](../CONTRIBUTING.md) for our
branch / commit / PR conventions. Use the PR template at
`.github/PULL_REQUEST_TEMPLATE.md`.

**☑ Action:** first PR merged.

---

## Day 4-5 — the infra story

Read in order:

1. **[`DEPLOYING.md`](./DEPLOYING.md)** — overall deployment.
2. **[`STAGING_SETUP.md`](./STAGING_SETUP.md)** — parallel staging
   environment. Not yet built; the runbook is ready. Standing this
   up may be your first owned project.
3. **[`BRANCH_PROTECTION.md`](./BRANCH_PROTECTION.md)** — GitHub
   branch rules.
4. **[`MIGRATIONS.md`](./MIGRATIONS.md)** — database schema
   workflow. Includes the `spatial_ref_sys` gotcha and the upcoming
   Supabase October 30 default change.

By the end you should have a picture of:
- How prod gets deployed (it's git-driven for both Vercel and Render).
- Where the staging gap is (no full-stack PR previews today; the
  `INFRA_ROADMAP.md` item 3 covers this).
- What the cold-start UX problem is on free-tier Render and Supabase
  (`INFRA_ROADMAP.md` items 1 + 2 — both fixable for $32/mo total).

**☑ Action:** be able to walk Katie through "what would happen if
prod went down right now and what would we do."

---

## Map of every doc

```
README.md                ← product + tech-stack overview
CONTRIBUTING.md          ← how to work in this codebase
CLAUDE.md                ← Claude-specific guidance (when AI helps)
docs/
  ONBOARDING.md          ← you are here
  ARCHITECTURE.md        ← system overview + diagram
  BACKEND.md             ← backend internals + conventions
  FRONTEND.md            ← frontend internals + conventions
  SCENARIOS.md           ← engine math + Excel mapping
  PORTFOLIO_ENGINE_ARCH.md  ← V1 spec for the third engine
  USER_FLOWS.md          ← product surface map
  DEPLOYING.md           ← production deployment
  STAGING_SETUP.md       ← parallel staging env runbook
  BRANCH_PROTECTION.md   ← GitHub branch rules
  INFRA_ROADMAP.md       ← what to spend on, in what order
  ENV_VARS.md            ← env var catalog
  MIGRATIONS.md          ← DB schema workflow + gotchas
  MIXPANEL_EVENTS.md     ← product analytics event catalog (when written)
  TESTING.md             ← test setup, conventions, debugging
```

---

## People + cadence

- **Katie** — engineering, full-stack day-to-day, product owner. The
  person you'll PR-review with and demo to.
- **Van** — strategic + product partner. Source of the Excel models
  the engines are pinned to; drives product spec for new engines
  (most recently the Portfolio one). You're unlikely to interact
  directly with him in the first month.

We're a 2-person team for the foreseeable future. PR review is
synchronous; expect a same-day or same-half-day turnaround on a
focused PR. We don't have standups; async messaging in the team
channel covers status.

---

## Things to NOT do (we've learned the hard way)

These are surfaced from the codebase memory + prior incidents. They
read as opinionated; they ARE.

- **Don't put math in the API layer.** Routers are pass-throughs.
  Math lives in the engine packages.
- **Don't fork `InputWizard`.** It's shared by all three engines and
  meant to stay that way. Add a new `FieldKind` if needed.
- **Don't redirect-guard the calculator URLs.** `/decision-map` and
  `/fthb-decision-map` are intentionally shareable.
- **Don't change a golden test to make a failing test pass.** Fix
  the engine instead, or re-pin only if the new value is correct
  AND understood.
- **Don't let LLM output produce dollar figures.** The engine is
  the source of truth for any number the user sees.
- **Don't bypass `core/config.py`.** All env-var reads go through
  `settings`. No `os.getenv()` scattered through modules.
- **Don't deploy a locally-built `dist/` to Vercel.** Always let
  Vercel run the build — that's how the dashboard env vars get
  baked in.

---

## Getting unstuck

- **Code question** — git blame the area in question; recent
  commits often have the rationale in the commit message.
- **Architecture question** — [`ARCHITECTURE.md`](./ARCHITECTURE.md)
  and [`BACKEND.md`](./BACKEND.md) / [`FRONTEND.md`](./FRONTEND.md).
- **Env / deploy question** — [`DEPLOYING.md`](./DEPLOYING.md) and
  [`ENV_VARS.md`](./ENV_VARS.md).
- **"This doc says X but the code does Y"** — fix the doc, ship the
  PR. Don't suffer through stale documentation in silence.
- **Anything else** — ping Katie.

Welcome aboard.
