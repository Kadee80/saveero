# Contributing to Saveero

This document defines how we work in this codebase. Everyone on the team follows these standards — no exceptions, no "I'll clean it up later."

The previous iteration of this product had 299 commits, 45 of which were named `fix`, 13 named `fix2`, and 9 named `x`. That is not version control. It's a panic log. We are not doing that.

---

## Commit Messages

A commit message answers one question: **what changed, and why?**

### Format

```
<type>: <short summary in plain English>

[optional body — explain WHY, not what the diff shows]
```

The first line must be **50 characters or fewer**. Use the present tense. No period at the end.

### Types

| Type | When to use |
|---|---|
| `feat` | A new feature or capability |
| `fix` | A bug fix |
| `refactor` | Code restructure with no behavior change |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Tooling, deps, config — nothing a user sees |
| `db` | Schema migrations or database changes |
| `api` | New or modified API endpoint |
| `ui` | Frontend-only changes |

### Good examples

```
feat: add amortization schedule to mortgage module
fix: correct DTI calculation when income is null
api: wire /properties endpoint to real database
db: add offers table with RLS policies
refactor: extract scenario scoring into separate service
docs: add setup instructions for local dev
chore: upgrade FastAPI to 0.116
```

### Bad examples — never do these

```
fix                   ← fix what?
fix2                  ← fix what, second attempt?
x                     ← not a commit message
fixes                 ← vague, plural, useless
wip                   ← don't commit WIP to main
asdf                  ← no
```

If you can't describe what you did in one line, you either changed too many things at once or you don't understand what you changed. Both are problems worth pausing on.

---

## Branching

Branch off `main`. Name branches using this pattern:

```
<type>/<short-description>
```

Examples:
```
feat/mortgage-calculator
fix/null-income-dti
api/property-lookup-endpoint
db/add-scenarios-table
ui/decision-map-screen
```

Delete branches after they are merged. Do not leave stale branches sitting around.

---

## Pull Requests

Every change to `main` goes through a PR. No direct commits to main.

**PR title** = the same format as a commit message.

**PR description** must include:
- What this PR does (one paragraph)
- How to test it manually
- Any database migrations needed
- Screenshots for UI changes

Keep PRs small and focused. A PR that touches the database schema, the API layer, and three frontend components is three PRs.

---

## One Thing Per Commit

Each commit should be a single logical change that could be reverted independently without breaking everything else. If you find yourself writing "and" in a commit message, split it into two commits.

```
# ❌ Wrong — two unrelated changes
feat: add mortgage calculator and fix auth redirect

# ✅ Right — two commits
feat: add mortgage calculator
fix: redirect to dashboard after auth instead of /
```

---

## Database Changes

- All schema changes go in a numbered migration file: `db/migrations/001_add_scenarios.sql`
- Never edit `db/schema.sql` directly after the initial setup — migrations only
- Never disable database integration to ship a feature — fix the schema conflict
- Every migration must be reversible (include a rollback comment)

Migration file format:
```sql
-- Migration: 001_add_scenarios
-- Author: <your name>
-- Date: YYYY-MM-DD
-- Description: Adds scenarios table for housing decision engine

CREATE TABLE IF NOT EXISTS public.scenarios ( ... );

-- Rollback:
-- DROP TABLE IF EXISTS public.scenarios;
```

---

## No Mock Data in Production Code

If an endpoint is not ready, return a proper `501 Not Implemented` or `503 Service Unavailable` — not a hardcoded fake response. Mock data belongs in tests only.

```python
# ❌ Never do this in production code
return {"id": "mock-id-123", "message": "database disabled"}

# ✅ Do this instead
raise HTTPException(status_code=503, detail="Pricing engine not yet available")
```

---

## Authentication Is Not Optional

Never comment out auth dependencies to make something work faster. If an endpoint is authenticated, it stays authenticated. If you're building something new and auth isn't wired yet, build auth first or gate the endpoint behind a feature flag.

---

## What Goes in a PR vs. What Doesn't

| ✅ Commit this | ❌ Don't commit this |
|---|---|
| Source code | `.env` files |
| Migration files | IDE config folders (`.idea/`, `.vscode/`) |
| Tests | `node_modules/`, `__pycache__/` |
| Updated docs | Mock data hardcoded in API responses |
| `requirements.txt` / `package.json` changes | Commented-out dead code |

---

## Local Setup

Follow these steps exactly. If something fails, check the troubleshooting section at the bottom before asking anyone.

### Prerequisites

You need these installed before starting. Check by running the version commands — if a command is not found, install it first.

| Tool | Min version | Check | Install |
|---|---|---|---|
| Python | 3.11+ | `python3 --version` | [python.org](https://python.org/downloads) |
| Node.js | 18+ | `node --version` | [nodejs.org](https://nodejs.org) |
| npm | 9+ | `npm --version` | Comes with Node |
| Git | any | `git --version` | [git-scm.com](https://git-scm.com) |

---

### Step 1 — Clone the repo

```bash
git clone <repo-url> saveero
cd saveero
```

---

### Step 2 — Set up your environment variables

```bash
cp .env.example .env
```

Now open `.env` in any text editor and fill in your keys:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_AUDIENCE=authenticated
OPENROUTER_API_KEY=sk-or-...
BRIDGE_SERVER_KEY=               ← leave blank for now, Perplexity is used as fallback
FRONTEND_DIST=webapp/dist
VITE_FRED_API_KEY=               ← optional, for live mortgage rates (free key at fred.stlouisfed.org)
```

**Where to get each key:**
- **SUPABASE_URL** — go to your Supabase project → Settings → API → Project URL
- **SUPABASE_JWT_AUDIENCE** — almost always `authenticated`, leave as-is
- **OPENROUTER_API_KEY** — sign up at [openrouter.ai](https://openrouter.ai), go to Keys
- **VITE_FRED_API_KEY** — free, instant at [fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html)

The mortgage calculator and scenario comparison work without any keys — they use estimated rates as a fallback.

---

### Step 3 — Install backend dependencies

```bash
# From the repo root (saveero/)
pip install -r requirements.txt
```

If you get a permissions error, try:
```bash
pip install --user -r requirements.txt
```

If you have multiple Python versions installed, use `pip3` instead of `pip`.

---

### Step 4 — Install frontend dependencies

```bash
cd webapp
npm install
cd ..
```

This will take 30–60 seconds the first time. It downloads into `webapp/node_modules/` — do not commit that folder.

---

### Step 5 — Run the backend

Open a terminal and run from the repo root:

```bash
uvicorn main:app --reload
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

Leave this terminal running. `--reload` means the server restarts automatically when you edit a Python file.

Test that it's alive:
```bash
curl http://localhost:8000/health
# should return: {"status":"ok"}
```

---

### Step 6 — Run the frontend

Open a **second terminal** and run:

```bash
cd webapp
npm run dev
```

You should see:
```
  VITE v5.x  ready in Xms

  ➜  Local:   http://localhost:5173/
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

### You're running. Here's what each URL does:

| URL | What it is |
|---|---|
| `http://localhost:5173` | The frontend (React app) |
| `http://localhost:8000` | The backend API |
| `http://localhost:8000/docs` | FastAPI auto-generated API docs — very useful |
| `http://localhost:8000/health` | Quick health check endpoint |

API calls from the frontend go to `/api/*`. Vite proxies them automatically to `localhost:8000` — you do not need to change any URLs yourself.

---

### Troubleshooting

**`uvicorn: command not found`**
Your Python scripts directory is not in your PATH. Try:
```bash
python3 -m uvicorn main:app --reload
```

**`ModuleNotFoundError` on startup**
You have multiple Python environments and installed to the wrong one. Run:
```bash
which python3
which pip3
```
Both should point to the same Python installation. If not, use the full path or activate a virtualenv.

**`npm install` fails with EACCES permission errors**
```bash
sudo npm install
```
Or better: [fix npm permissions](https://docs.npmjs.com/resolving-eacces-permissions-errors-with-npm-globally) so you don't need sudo.

**Frontend shows a blank white screen**
Open the browser dev tools (F12) → Console tab. The error there tells you what's wrong.

**`CORS error` in the browser console**
The backend is not running, or it's running on a different port. Make sure Step 5 is running and the URL in the error matches `localhost:8000`.

**`401 Unauthorized` on API calls**
Auth is not configured yet. The listing wizard endpoints require a valid Supabase JWT. The mortgage calculator and scenario comparison are frontend-only and do not need auth.

**Port already in use**
```bash
# Kill whatever is on port 8000
lsof -ti:8000 | xargs kill

# Or run uvicorn on a different port
uvicorn main:app --reload --port 8001
# (then update vite.config.ts proxy target to match)
```

**Changes to Python files not reloading**
Make sure you used `--reload` when starting uvicorn.

**Changes to frontend files not reloading**
Vite has hot module replacement (HMR) built in — it should update automatically. If it's stuck, kill the `npm run dev` process and restart it.

---

Required environment variables:
- `SUPABASE_URL` — your Supabase project URL
- `OPENROUTER_API_KEY` — for AI listing generation
- `BRIDGE_SERVER_KEY` — for MLS / RESO data (optional for local dev)
- `VITE_FRED_API_KEY` — for live mortgage rates (optional, falls back to estimates)

---

## Codebase Structure

```
saveero/
├── main.py                        # FastAPI app, auth middleware, router registration
├── requirements.txt
├── api/
│   ├── listing_wizard_routes.py   # POST /api/listings/generate (✅ live)
│   ├── mortgage_routes.py         # 🔲 planned
│   ├── scenario_routes.py         # 🔲 planned
│   └── property_routes.py         # 🔲 planned
├── listing_wizard/
│   ├── __init__.py
│   ├── image_describer.py         # Vision AI client (OpenRouter / Gemini)
│   ├── listing_generator.py       # Full pipeline orchestrator
│   └── models.py                  # GeneratedListing, SimilarProperty Pydantic models
├── core/
│   ├── database.py                # 🔲 SQLAlchemy session + engine
│   ├── auth.py                    # 🔲 Supabase JWT dependency (skeleton in main.py)
│   └── config.py                  # 🔲 Settings / env var management
└── mortgage/                      # 🔲 all planned
```

## Modules Being Built

| Module | Status | Location | Notes |
|---|---|---|---|
| AI listing wizard | ✅ Extracted & clean | `listing_wizard/` | Photo → structured listing. Auth wired. |
| Property lookup | 🔲 Planned | `api/property_routes.py` | Address → parcel data, home value |
| Mortgage inputs | 🔲 Planned | `mortgage/` | User confirms balance, rate, terms |
| Scenario engine | 🔲 Planned | `api/scenario_routes.py` | 6 homeowner + 3 renter scenarios |
| Decision map | 🔲 Planned | `api/scenario_routes.py` | Scoring, ranking, recommendation |
| Advisor network | 🔲 Planned | TBD | Connect user with planner/agent/advisor |
| Database layer | 🔲 Planned | `core/database.py` | SQLAlchemy + Supabase Postgres |

## Known Issues Fixed During Extraction

These bugs were in the original codebase and corrected before any code was carried over:

**`listing_generator.py` — hardcoded comp search location**
The RESO/MLS comparable property search had `city="Coupland"` and `state="TX"` hardcoded,
meaning it searched a small Texas town regardless of the actual property address. This is
now fixed to use `listing.city` and `listing.region` from the generated listing.

Commit this was corrected in: `fix: use actual property city/state for RESO comp search`

---

*Last updated: April 2026. Update this file as the codebase grows.*
