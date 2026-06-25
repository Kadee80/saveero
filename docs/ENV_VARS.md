# Environment variables — single source of truth

Every environment variable the app reads, where it lives, and what
happens if it's missing. If a doc anywhere else lists env vars and
disagrees with this file, **this file wins** — open a PR to fix the
other doc.

For procedural setup (where to paste what), see
[`DEPLOYING.md`](./DEPLOYING.md). For environment-specific overrides
(e.g. staging Vercel using `$RENDER_API_HOST` to point at staging
Render), see [`STAGING_SETUP.md`](./STAGING_SETUP.md).

---

## Where each environment reads from

| Environment | Backend reads from | Frontend reads from | Built by |
|---|---|---|---|
| Local dev | `.env` (gitignored) at repo root | `webapp/.env` (gitignored) | `python3 -m uvicorn` / `vite dev` |
| Vercel preview | N/A (no backend on Vercel) | Vercel project's **Preview** scope | Vercel |
| Vercel production | N/A | Vercel project's **Production** scope | Vercel |
| Render production | Render dashboard env vars | N/A (Vercel serves frontend) | Render |
| Staging Render | Render dashboard env vars on `saveero-staging` | Vercel staging project's vars | Render + Vercel |
| CI (GitHub Actions) | Secrets configured in repo settings | Repo secrets | GitHub Actions runners |

For both `.env` files the **example template** is committed:
- `.env.example` (backend)
- `webapp/.env.example` (frontend)

Copy each to `.env` and fill in. The example files are kept in sync
with this doc; if you add a new var, update the example AND this file.

---

## Backend env vars (FastAPI / Render)

All values pulled via `core/config.py` (Pydantic settings). Modules
must import `from core.config import settings` rather than calling
`os.getenv()` directly.

### Required

| Variable | Where to find / what to set | Notes |
|---|---|---|
| `SUPABASE_URL` | Supabase dashboard → Settings → API → Project URL | Same as frontend `VITE_SUPABASE_URL` — no protocol stripping. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API → **service_role** key | The long `eyJ...` JWT. **NOT** the `sb_publishable_...` key. Server-side only — never expose to the browser. |
| `SUPABASE_JWT_AUDIENCE` | Literal value `authenticated` | Default in code already, but set explicitly for clarity. |
| `SUPABASE_JWT_JWK` | Pre-fetch with `curl https://<project>.supabase.co/auth/v1/.well-known/jwks.json` and paste the single key object from `keys[0]` | Default is empty string. **Auth will fail in prod if unset** — Render/Render-likes can't reliably fetch this at runtime. |
| `OPENROUTER_API_KEY` | https://openrouter.ai → API Keys | Drives AI listing generation and (eventually) the Home Decision Coach. |

### Optional

| Variable | Default | Effect when unset |
|---|---|---|
| `BRIDGE_SERVER_KEY` | none | Bridge RESO MLS API unused. Listing generator falls back to Perplexity for property lookup. |
| `ENGAGED_LEAD_WEBHOOK_URL` | none | Engaged-lead notifications silently skipped. Set to a Zapier "Catch Hook" URL to route notifications to Slack/email/SMS/etc. — the destination is configured in Zapier so the channel can change without a code deploy. |
| `APP_BASE_URL` | none | The CRM deep-link in the notification payload is empty. Set to the public app URL (e.g. `https://app.saveero.com`). |
| `FRONTEND_DIST` | `webapp/dist` | Where FastAPI looks for the built frontend if you're serving it from the same backend. Render currently only serves the API — Vercel handles the frontend — so this is unused in prod. |

---

## Frontend env vars (Vite / Vercel)

All values must start with `VITE_` or Vite refuses to expose them to
the browser bundle. **All `VITE_*` values end up in the shipped
browser bundle** — never put true secrets in them.

### Required

| Variable | Where to find / what to set | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase dashboard → Settings → API → Project URL | Same value as backend `SUPABASE_URL`. |
| `VITE_SUPABASE_ANON_KEY` | Supabase dashboard → Settings → API → **anon/public** key | Publishable by design — safe to ship in the bundle. **NOT** the service_role key. |

### Optional

| Variable | Default | Effect when unset |
|---|---|---|
| `VITE_FRED_API_KEY` | none | Mortgage Calculator + Decision Map fall back to hardcoded rates and show a warning banner. Free key at https://fred.stlouisfed.org/docs/api/api_key.html. |
| `VITE_MIXPANEL_TOKEN` | none | All `analytics.track()` and `analytics.identify()` calls become silent no-ops. App runs fine without it — useful for keeping non-prod environments out of the Mixpanel project's MTU count. |
| `VITE_LANDING_ENABLED` | `true` | Set `false` to hide the marketing landing page and send every unauthenticated visitor straight to `/login`. Requires a redeploy to take effect (Vite env vars are baked at build time). |
| `VITE_PORTFOLIO_ENABLED` | `false` | Set `true` to surface the Portfolio Builder route, sidebar nav item, and Dashboard tile. Defaults to off until V1 of the engine + the weighting matrix from Van both land. |

### Staging-only

These are only used by the staging Vercel project (see
[`STAGING_SETUP.md`](./STAGING_SETUP.md)):

| Variable | Required | Notes |
|---|---|---|
| `RENDER_API_HOST` | yes on staging Vercel | Hostname (no protocol) of the Render service this Vercel deploy should proxy `/api/*` to. Prod uses `saveero-7nu9.onrender.com`; staging uses `saveero-staging-xxxx.onrender.com`. Read by `webapp/vercel.json`'s rewrite rule. |

---

## CI secrets

Configured in GitHub repo → Settings → Secrets and variables → Actions.

| Secret | Used by | Purpose |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `.github/workflows/ci.yml` | Backend test suite spins up an integration database; needs the service role. |
| `SUPABASE_URL` | same | Same. |
| `OPENROUTER_API_KEY` | same | Listing wizard tests require it. |

(Verify exact set against `.github/workflows/` — these change occasionally.)

---

## Adding a new env var

1. **Backend var.** Add the field to `core/config.py` `Settings` class, with a type and a default if it's optional. Don't read it directly from `os.getenv()` anywhere else — always go through `settings`.
2. **Frontend var.** Prefix with `VITE_`. Reference as `import.meta.env.VITE_FOO` in TS. If TypeScript complains about an unknown env-var key, add to `webapp/src/vite-env.d.ts` (or wherever your `ImportMetaEnv` augmentation lives).
3. **Update both `.env.example` files** at the repo root (`.env.example`) and `webapp/.env.example` — include a comment line explaining what the var does and where to get the value.
4. **Update this doc** with a new row in the relevant table.
5. **Set the var** in:
   - Local dev: your own `.env` / `webapp/.env`
   - Render dashboard (backend vars)
   - Vercel dashboard, both **Preview** and **Production** scopes (frontend vars)
   - GitHub Actions secrets (if CI needs it)
6. **For frontend vars in particular**, remember Vite bakes them at build time. After setting on Vercel, push a code commit OR force-rebuild without cache (`vercel --prod --force`) — re-promoting an existing build will not pick up the new var.

---

## Secrets we DON'T have but should plan for

Listed for the new dev's awareness — these are gaps surfaced by the
docs audit, not active vulnerabilities:

- **No rotation policy.** `OPENROUTER_API_KEY` and
  `SUPABASE_SERVICE_ROLE_KEY` haven't been rotated since project
  start. Both are platform-issued and can be rotated at any time from
  their respective dashboards.
- **No secret-leak monitoring.** Push protection is on for GitHub
  (rejects pushes containing known secret patterns), but we don't
  scan dependencies for credential exfiltration. Worth a paid tool
  once we're past two devs.
- **No `.env` template for the staging environment.** Staging reuses
  prod's keys today (per [`STAGING_SETUP.md`](./STAGING_SETUP.md))
  with a few overrides. When staging moves to its own Supabase
  project, a `staging.env.example` may help.
