# Deploying the webapp to Vercel

The `webapp/` directory is a Vite + React SPA. It deploys to Vercel as a static build with a rewrite rule that proxies `/fred-proxy/*` to the Federal Reserve (FRED) API.

## First-time setup

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
   - Directory: `./` (just press Enter — you're already in `webapp/`)

3. **Set the Root Directory in Vercel's dashboard** → Project → Settings → General → Root Directory → `webapp`. This is critical so Vercel picks up `webapp/vercel.json` and `webapp/package.json`.

4. Vercel auto-detects the Vite framework. If prompted manually:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`

## Environment variables

Vite inlines any var prefixed with `VITE_` into the JavaScript bundle **at build time**. That means:

- Env vars must be set in Vercel's dashboard **before** the build runs.
- Changing an env var after deploy has **no effect** until you redeploy with cache disabled.
- These values end up in the shipped bundle — do not put true secrets in `VITE_*` vars.

### Required / optional vars

| Variable | Required | Purpose |
|---|---|---|
| `VITE_FRED_API_KEY` | optional | Live US mortgage rates from FRED. Without it, the app falls back to hardcoded rates and shows a warning. Get a free key at https://fred.stlouisfed.org/docs/api/api_key.html |

### Setting env vars

**Via dashboard:** Project → Settings → Environment Variables → add the var with **Production** (and Preview if you want) scopes checked.

**Via CLI** (from `webapp/`):
```bash
vercel env add VITE_FRED_API_KEY production
# paste value when prompted
```

List current vars:
```bash
vercel env ls
```

## Deploying

### Preview deploy

```bash
cd webapp
vercel
```

Creates a unique preview URL like `saveero-abc123.vercel.app`. Use this to share work-in-progress.

### Production deploy

```bash
cd webapp
vercel --prod
```

Promotes to the production domain.

> ⚠️ **Do not pass `./dist` as an argument.** `vercel` does not take a build output directory as a positional arg. Let Vercel run the build itself, or use `--prebuilt` (below).

### Deploying a pre-built output

If you want to build locally and ship the exact artifact:
```bash
cd webapp
vercel build --prod       # writes .vercel/output/
vercel deploy --prebuilt --prod
```
Note: `vercel build` reads env vars from Vercel — run `vercel env pull .env.local` first if you want to mirror production locally.

## After changing env vars

Env var changes **do not** automatically rebuild existing deployments. Trigger a fresh build:

**Option A — push a commit** (simplest): any new commit to the production branch triggers a rebuild that picks up the new env vars.

**Option B — redeploy from dashboard:** Deployments → latest → ⋯ → **Redeploy** → **uncheck "Use existing Build Cache"**. Leaving the cache checked will reuse the old build and the new env var will not be applied.

**Option C — CLI:**
```bash
vercel --prod --force
```
`--force` bypasses the build cache.

## How the FRED proxy works

The browser can't call `api.stlouisfed.org` directly (CORS). Both environments proxy it:

- **Local dev** — `webapp/vite.config.ts` has a Vite dev proxy that forwards `/fred-proxy/*` → `https://api.stlouisfed.org/fred/*`.
- **Production** — `webapp/vercel.json` defines an equivalent rewrite:
  ```json
  {
    "rewrites": [
      {
        "source": "/fred-proxy/:path*",
        "destination": "https://api.stlouisfed.org/fred/:path*"
      }
    ]
  }
  ```

Verify the production rewrite is live by hitting it directly in a browser:
```
https://<your-domain>/fred-proxy/series/observations?series_id=MORTGAGE30US&api_key=YOUR_KEY&file_type=json&sort_order=desc&limit=1
```
- Returns JSON → rewrite works.
- Returns your SPA's HTML → the rewrite isn't active. Check that the Root Directory is set to `webapp`.

## Rollback

Vercel keeps every deployment. To roll back:

- **Dashboard:** Deployments → pick a known-good one → ⋯ → **Promote to Production**.
- **CLI:**
  ```bash
  vercel rollback <deployment-url>
  ```

## Troubleshooting

### "Add VITE_FRED_API_KEY to .env for live rates..." warning still shows in production

The app is falling back to hardcoded rates. Work through these in order:

1. **Env var missing from the build.** Open DevTools → Network → reload → pick a JS chunk → search response for your key value.
   - Not found → the build didn't see the var. Causes: var only set in Preview (not Production); redeployed with build cache enabled; wrong Root Directory.
   - Found → continue.

2. **Rewrite not active.** Hit the `/fred-proxy/...` URL above directly. If you get HTML, fix the Root Directory or confirm `vercel.json` is inside `webapp/`.

3. **FRED request failing at runtime.** DevTools → Network → filter `fred` → reload Mortgage Calculator. Look for the request's status code:
   - `400` with "api_key is not valid" → bad/expired key value.
   - No request at all → a JS error is being swallowed by the try/catch in `webapp/src/api/ratesApi.ts`. Temporarily remove the `try/catch` in `fetchCurrentRates` to surface the real error.

### Deploy shows "Use existing Build Cache" and env vars don't apply

Redeploy with **Build Cache unchecked**, or run `vercel --prod --force`.

### `vercel ./dist` errors with "not a valid target directory"

Don't pass paths. Use `vercel --prod` from `webapp/`, or `vercel deploy --prebuilt --prod` after `vercel build`.

### Dev server reads stale env vars

Vite only loads `.env*` files at startup. After editing `webapp/.env.local`, **fully restart** the dev server (Ctrl+C and `npm run dev` again) — HMR does not pick up env changes.

## Files that affect deployment

| File | Purpose |
|---|---|
| `webapp/vercel.json` | Rewrites (FRED proxy). Must live in the Root Directory Vercel builds from. |
| `webapp/vite.config.ts` | Dev-only proxy, build output, aliases. |
| `webapp/.env.local` | Local-only env vars. **Never committed.** |
| `webapp/package.json` | `build` script (`vite build`) that Vercel runs. |
