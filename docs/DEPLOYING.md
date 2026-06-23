# Deploying Saveero

End-to-end deployment guide for production. For a parallel staging
environment, see [`STAGING_SETUP.md`](./STAGING_SETUP.md). For the
prioritized list of paid-tier upgrades and cost trade-offs, see
[`INFRA_ROADMAP.md`](./INFRA_ROADMAP.md).

---

## Production architecture

| Layer | Platform | Plan today | Plan target | URL pattern |
|---|---|---|---|---|
| Frontend | Vercel | Free / Hobby | Hobby | `<project>.vercel.app` (custom domain TBD) |
| Backend API | Render | Free | **Starter ($7/mo)** | `saveero-7nu9.onrender.com` |
| Database + Auth | Supabase | Free | **Pro ($25/mo)** | `oabxgprjdqyhnqoeffkv.supabase.co` |
| Product analytics | Mixpanel | Free | Free until ~100k MTUs | N/A — client-side SDK |
| Webhooks (engaged-lead notifications) | Zapier (Catch Hook) | Free | Free | N/A |

The "Plan target" column is the recommended upgrade per
[`INFRA_ROADMAP.md`](./INFRA_ROADMAP.md) — both Supabase and Render
have user-facing cold-start / auto-pause issues on free tier that cost
more in mid-demo recovery than the paid tiers cost in cash.

**Deploys are git-driven.** A push to `main` triggers:
- Render auto-deploys the backend from `main`
- Vercel auto-deploys the frontend from `main`

Both providers also expose deploy hooks + manual triggers for emergency use.

---

## Frontend (Vercel)

The `webapp/` directory is a Vite + React SPA. Vercel builds it from
the repo's `webapp/` subdirectory and serves a static bundle with
rewrites to the backend and the FRED API.

### First-time setup

1. Install the Vercel CLI and log in:
   ```bash
   npm i -g vercel
   vercel login
   ```

2. Link the project (run from `webapp/`):
   ```bash
   cd webapp
   vercel link
   ```
   - Scope: your Vercel account/team
   - Link to existing project? Choose existing or create new

3. **Set the Root Directory in Vercel's dashboard** →
   Project → Settings → General → Root Directory → `webapp`. Critical
   so Vercel picks up `webapp/vercel.json` and `webapp/package.json`.

4. Vercel auto-detects Vite. If prompted manually:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`

5. Add environment variables (see table below) **before** the first
   build. Vite inlines `VITE_*` vars into the bundle at build time —
   adding a var after the fact requires a redeploy with cache cleared.

### Frontend environment variables (Vercel dashboard)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | Supabase → Settings → API → anon/public key (safe to expose) |
| `VITE_FRED_API_KEY` | optional | Federal Reserve mortgage rates. Without it the app falls back to hardcoded rates and shows a warning. Free key at https://fred.stlouisfed.org/docs/api/api_key.html |
| `VITE_MIXPANEL_TOKEN` | optional | Mixpanel project token. If unset, all `analytics.track()` calls are silent no-ops — app runs fine without it. |
| `VITE_LANDING_ENABLED` | optional (default `true`) | When `false`, hides the marketing landing page and sends every unauthenticated visitor straight to `/login`. Requires a redeploy. |
| `VITE_PORTFOLIO_ENABLED` | optional (default `false`) | When `true`, surfaces the Portfolio Builder route + sidebar nav + Dashboard tile. Flip on when the V1 build lands. |

> ⚠️ **`VITE_*` env vars end up in the shipped browser bundle.** Don't
> put true secrets in them — anyone can read them. The Supabase anon
> key, Mixpanel token, and FRED key are all publishable client-side
> tokens by design and safe to expose. The Supabase service-role key
> is **not** safe and must never get a `VITE_` prefix.

### Frontend deploy

**Auto-deploy.** `git push origin main` → Vercel rebuilds and promotes
to production. Same for branch pushes — each one gets a unique preview
URL like `saveero-abc123.vercel.app` that proxies `/api/*` to
**production** Render (so previews are real-data end-to-end). For
staging previews against a non-prod backend, see
[`STAGING_SETUP.md`](./STAGING_SETUP.md).

**Manual preview deploy:**
```bash
cd webapp
vercel
```

**Manual production deploy:**
```bash
cd webapp
vercel --prod
```

> Don't pass `./dist` as a positional arg — `vercel` doesn't accept a
> build directory that way. Let Vercel run the build, or use
> `vercel deploy --prebuilt --prod` after `vercel build`.

**Force rebuild without code change** (e.g. after rotating an env var):
```bash
vercel --prod --force
```

`--force` bypasses the build cache so newly-set env vars actually land
in the bundle. Alternative: Vercel dashboard → Deployments → latest →
⋯ → **Redeploy** → **uncheck "Use existing Build Cache"**.

### How the rewrites work

`webapp/vercel.json` defines two rewrites that the SPA depends on:

```json
{
  "rewrites": [
    { "source": "/fred-proxy/:path*", "destination": "https://api.stlouisfed.org/fred/:path*" },
    { "source": "/api/:path*", "destination": "https://saveero-7nu9.onrender.com/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

- **`/fred-proxy/*`** → FRED API (browser can't call `api.stlouisfed.org`
  directly because of CORS).
- **`/api/*`** → Render backend. This is hard-coded to prod's Render
  URL today; [`STAGING_SETUP.md`](./STAGING_SETUP.md) describes
  parameterizing it via `$RENDER_API_HOST` for the staging setup.
- **`/(.*)`** → `index.html` (SPA fallback for client-side routes).

**Verifying the rewrites are live:** hit the FRED proxy URL directly:

```
https://<your-domain>/fred-proxy/series/observations?series_id=MORTGAGE30US&api_key=YOUR_KEY&file_type=json&sort_order=desc&limit=1
```

- Returns JSON → rewrite works.
- Returns your SPA's HTML → the rewrite isn't active. Check that
  Vercel's Root Directory is set to `webapp`.

### Rollback

Vercel keeps every deployment.

- **Dashboard:** Deployments → pick a known-good one → ⋯ → **Promote
  to Production**.
- **CLI:**
  ```bash
  vercel rollback <deployment-url>
  ```

---

## Backend (Render)

FastAPI app served by `uvicorn`. The Render service is `saveero-7nu9`
(name visible in dashboard). Auto-deploys on push to `main`.

### First-time setup

1. Sign up at [render.com](https://render.com) with GitHub.
2. **New → Web Service** → connect the `saveero` repo.
3. Set:
   - **Root Directory:** `saveero` (the repo root, not a subdirectory)
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Region:** same as Vercel's (lower frontend↔backend latency)
   - **Plan:** Free for early dev; **Starter ($7/mo) recommended** for
     anything user-facing — see
     [`INFRA_ROADMAP.md`](./INFRA_ROADMAP.md) item 2 for the cold-start
     story.
   - **Auto-Deploy:** Yes
4. Add environment variables (see table below).
5. Click **Deploy**.

### Backend environment variables (Render dashboard)

| Variable | Required | Where to find |
|---|---|---|
| `SUPABASE_URL` | yes | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase → Settings → API → `service_role` key (the long `eyJ...` JWT — **not** the `sb_publishable_...` key) |
| `SUPABASE_JWT_AUDIENCE` | yes | Set literal value `authenticated` |
| `SUPABASE_JWT_JWK` | yes | Pre-fetch with `curl https://<project>.supabase.co/auth/v1/.well-known/jwks.json` and paste the single key object from the `keys` array. Render can't fetch this at runtime — must be set as a static env var. |
| `OPENROUTER_API_KEY` | yes (for AI listings) | openrouter.ai → Keys |
| `BRIDGE_SERVER_KEY` | optional | Bridge RESO MLS API. Falls back to Perplexity if unset. |
| `ENGAGED_LEAD_WEBHOOK_URL` | optional | Zapier Catch Hook URL fired when a lead enters `engaged` (clicks Contact-a-partner). Unset = notifications silently skipped. |
| `APP_BASE_URL` | optional | Public app URL (e.g. `https://app.saveero.com`) used in the webhook payload to build a CRM deep-link. |

### Backend deploy

**Auto-deploy.** Every push to `main` triggers a redeploy (~3-5 min
build + dyno restart).

**Manual deploy:** Render dashboard → `saveero-7nu9` → Manual Deploy →
**Deploy latest commit**.

### Health checks

```bash
curl https://saveero-7nu9.onrender.com/api/health
# {"status": "ok"}
```

Swagger UI for API browsing:
```
https://saveero-7nu9.onrender.com/docs
```

### Rollback

Render keeps the last several deploys.
- Dashboard → `saveero-7nu9` → **Events** → find a known-good deploy →
  **Rollback to this deploy**.

---

## Database (Supabase)

### First-time project setup

1. Create project at [supabase.com](https://supabase.com).
2. Disable email confirmations for easier dev/demo:
   - **Authentication → Settings → Email Auth** → uncheck **Enable
     email confirmations**.
3. Run all migrations in order — see next section.
4. Copy the keys into Render + Vercel dashboards (see env-var tables
   above).

### Running migrations

Migrations live in `db/migrations/` as numbered SQL files. Today the
workflow is manual: paste each file's contents into the Supabase SQL
Editor and execute.

For a new Supabase project, apply in order:
```
001_initial_schema.sql          # core users, properties, leads tables + RLS
002_mortgage_analyses.sql       # mortgage analyzer save/load
003_leads.sql                   # CRM lead table + status enum
004_lead_role_first_time_buyer.sql   # adds 'first_time_buyer' to lead_role enum
005_fthb_analyses.sql           # FTHB analysis save/load
006_pro_type_and_branched_intent.sql  # pro_type column + branched intent values
```

Migration `007_rls_on_postgis_spatial_ref_sys.sql` was created and
**reverted** — see [`MIGRATIONS.md`](./MIGRATIONS.md) for the
PostGIS-owned-table story and why it can't be applied via the SQL
editor.

For prod, the same workflow applies but is risk-managed by
[`STAGING_SETUP.md`](./STAGING_SETUP.md) (test against staging first)
and the planned automated migration runner in
[`INFRA_ROADMAP.md`](./INFRA_ROADMAP.md) item 5.

### Backups + restore

- **Free tier:** 7 days of daily backups via Supabase dashboard.
- **Pro tier (recommended):** 30 days of daily backups + 7-day
  point-in-time recovery — restore the database to any moment in the
  past week. Critical for migration accidents.

---

## Local development

### Backend

```bash
cd saveero
cp .env.example .env             # then fill in values
pip install -r requirements.txt
python3 -m uvicorn main:app --reload
# API at http://localhost:8000 — docs at http://localhost:8000/docs
```

> The `.env.example` is currently missing `SUPABASE_JWT_JWK` — add it
> manually using the same value you'd use in Render (curl the
> well-known endpoint, paste the single key object).

### Frontend

```bash
cd webapp
cp .env.example .env             # then fill in values
npm install
npm run dev
# App at http://localhost:5173
```

The Vite dev server proxies `/api/*` to `localhost:8000` (see
`webapp/vite.config.ts`), so backend + frontend run together against
your local backend + real Supabase.

### Mirroring production env locally

```bash
cd webapp
vercel env pull .env.local
# Pulls Vercel's production env vars to a local file (gitignored)
```

Useful when reproducing a prod-only bug.

---

## Deploy hygiene

### Pre-deploy checklist

Before pushing to `main` for a release:

- [ ] `pytest` passes locally
- [ ] `cd webapp && npm test` passes
- [ ] `cd webapp && npm run build` passes (catches TypeScript errors
      Vite ignores in dev)
- [ ] If touching scenarios/* — relevant golden tests still pin to Excel
- [ ] If migration added — runbook to apply it post-merge

### Post-deploy verification

After Render + Vercel finish deploying:

```bash
curl https://saveero-7nu9.onrender.com/api/health  # backend OK
curl -I https://<vercel-domain>                    # frontend reachable
```

Spot-check the affected feature in the browser. Mixpanel's Live View
will show events arriving if you're testing tracked actions.

### Demo prep

If a demo is imminent and you're on free-tier Render, hit
`/api/health` 2 minutes before to warm the dyno. The cold-start hit on
a sleeping dyno is 10–30 seconds, and the Dashboard's lead-fetch retry
loop spins during that window in a way that looks broken. See
[`INFRA_ROADMAP.md`](./INFRA_ROADMAP.md) item 2 for the Starter-tier
recommendation that eliminates this entirely.

---

## Gotchas learned the hard way

- **Render, not Railway.** Railway's DNS couldn't resolve Supabase
  hostnames when we tried. Render works.
- **Service role key shape.** Must be the long `eyJ...` JWT, not the
  shorter `sb_publishable_...` key. Easy to grab the wrong one from
  the dashboard.
- **`SUPABASE_JWT_JWK` is static.** Render can't fetch it at runtime
  reliably (intermittent DNS issues against the Supabase well-known
  endpoint). Pre-fetch and paste the key object as an env var.
- **`VITE_` prefix matters.** Without it, Vite refuses to expose the
  var to the browser bundle.
- **Vercel must do the build.** Never deploy a locally-built `dist/`
  to Vercel directly — the Vercel dashboard env vars only get baked
  in by Vercel's own build process.
- **Env var changes need a cache-busted rebuild.** Pushing a code
  commit works (fresh build picks them up). Re-deploying without
  unchecking "Use existing Build Cache" doesn't — the old bundle gets
  re-promoted with the old env vars.
- **Vite reads `.env.local` only at startup.** After editing it,
  fully restart the dev server (Ctrl+C, `npm run dev` again). HMR
  does not pick up env changes.
- **PostGIS-owned tables.** The `spatial_ref_sys` table comes from
  PostGIS, is owned by `supabase_admin`, and cannot be `ALTER`-ed
  from the SQL editor. The Supabase Security Advisor will flag it as
  RLS-disabled; correct response is to mark the finding as a known
  issue. Full story in [`MIGRATIONS.md`](./MIGRATIONS.md).

---

## See also

- [`STAGING_SETUP.md`](./STAGING_SETUP.md) — parallel staging env for
  full-stack PR previews
- [`INFRA_ROADMAP.md`](./INFRA_ROADMAP.md) — prioritized list of paid
  upgrades + cost trade-offs
- [`BRANCH_PROTECTION.md`](./BRANCH_PROTECTION.md) — GitHub branch
  rules
- [`MIGRATIONS.md`](./MIGRATIONS.md) — DB migration workflow + gotchas
- [`ENV_VARS.md`](./ENV_VARS.md) — single-source env-var catalog
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — commit/PR conventions
