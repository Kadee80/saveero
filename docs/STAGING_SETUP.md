# Staging environment setup

One-time setup for the `staging` branch + parallel Render + Vercel
services that give us full-stack preview URLs for backend-changing
PRs. Once this is in place, the workflow described in
`CONTRIBUTING.md` "Preview URLs" section just works.

Work through this top-to-bottom. Order matters in a couple of spots —
where it does, the step is marked **ORDER-SENSITIVE**.

Time: about 30 minutes if everything goes smoothly.

---

## 0. Pre-flight check

Confirm prod is green before touching anything:

```bash
# CI green on the latest main commit?
gh run list --branch main --limit 1

# Frontend healthy?
curl -I https://<your-vercel-domain>

# Backend healthy?
curl https://saveero-7nu9.onrender.com/api/health
```

If anything is red, fix prod first.

---

## 1. Create the `staging` branch on GitHub

```bash
git checkout main
git pull
git checkout -b staging
git push -u origin staging
```

This is a long-lived branch. It tracks an unmerged sample of features
being previewed at any given moment. Don't add branch protection — the
whole point is anyone can push to it.

---

## 2. Stand up the staging Render service

In the [Render dashboard](https://dashboard.render.com):

1. **New +** → **Web Service**
2. Pick the same GitHub repo as the prod service
3. **Name:** `saveero-staging`
4. **Branch:** `staging`
5. **Runtime:** Python 3 (or whatever the prod service uses — check Settings on `saveero-7nu9`)
6. **Build command + start command:** copy verbatim from prod's Settings → Build & Deploy
7. **Region:** same as prod (lower latency between Vercel + Render)
8. **Plan:** Free is fine for staging; it'll sleep when idle, which is acceptable
9. **Auto-Deploy:** Yes (this is the whole point)

**Environment variables** — copy these from prod, then override the ones marked:

| Var | Source | Action |
|---|---|---|
| `SUPABASE_URL` | prod | copy |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | copy |
| `SUPABASE_JWT_AUDIENCE` | prod | copy |
| `SUPABASE_JWT_JWK` | prod | copy |
| `OPENROUTER_API_KEY` | prod | copy |
| `BRIDGE_SERVER_KEY` | prod | copy if set |
| `VITE_FRED_API_KEY` | prod | copy if set |
| `APP_BASE_URL` | **OVERRIDE** | set to staging Vercel URL (see step 4 — `https://saveero-staging.vercel.app` or whatever you name it) |
| `ENGAGED_LEAD_WEBHOOK_URL` | **OVERRIDE** | either unset (no notifications) or point at a separate Zap so staging doesn't poison prod's lead Slack |

> **About Supabase:** v1 reuses the prod Supabase project. Staging tests will write to the prod `leads` / `users` tables. Prefix test emails with `staging+...@something.com` so they're easy to filter / clean up. When this gets noisy, spin up a separate Supabase project for staging and override `SUPABASE_URL` + the two related keys above.

Click **Create Web Service**. Wait for the first build to go green (~5 minutes — slower than usual because it's pulling everything fresh). Take note of the URL Render assigns — something like `saveero-staging-xxxx.onrender.com`. You'll need it in step 4.

Smoke-test:

```bash
curl https://saveero-staging-xxxx.onrender.com/api/health
```

Should return `{"status": "ok"}`. If it 503s, the dyno is cold-starting — retry in 30 seconds.

---

## 3. Add the staging Render webhook to GitHub

Same pattern as the prod webhook we set up before:

1. In the new `saveero-staging` service → **Settings** → scroll to **Deploy Hook**. Copy the URL.
2. In GitHub repo → **Settings** → **Webhooks** → **Add webhook**
3. **Payload URL:** the deploy hook URL
4. **Content type:** `application/x-www-form-urlencoded`
5. **Which events?** "Just the push event"
6. **Active:** checked
7. **Add webhook**

Push something tiny to the `staging` branch (a README typo fix) and verify the webhook fires — green ✅ in Recent Deliveries.

---

## 4. Stand up the staging Vercel project

In the [Vercel dashboard](https://vercel.com):

1. **Add New...** → **Project**
2. Import the same GitHub repo
3. **Project Name:** `saveero-staging` (or whatever)
4. **Framework Preset:** Other (we have our own `vercel.json`)
5. **Root directory:** repo root (same as prod)
6. **Build settings:** copy from prod's Settings

7. **Production branch:** override from `main` to `staging` (Settings → Git after first deploy if not exposed during setup)

8. **Environment variables:**

   | Var | Value | Why |
   |---|---|---|
   | `VITE_LANDING_ENABLED` | `true` | match prod default |
   | `RENDER_API_HOST` | `saveero-staging-xxxx.onrender.com` | overrides which Render the rewrites point at — see step 5 |

Deploy. Wait for first build green. Take note of the Vercel URL (`saveero-staging.vercel.app` or whatever).

**ORDER-SENSITIVE:** Before going to step 5, go back to step 2 and **update the staging Render's `APP_BASE_URL`** to this Vercel URL (you needed step 4 done to know what value to set).

---

## 5. Parameterize `vercel.json` (one-line code change)

**ORDER-SENSITIVE:** First set `RENDER_API_HOST=saveero-7nu9.onrender.com` on the **production** Vercel project (Settings → Environment Variables). This is a no-op for prod since the file still hardcodes the URL, but it primes prod for the upcoming change.

Then in a PR, change the rewrite in `vercel.json`:

```diff
   "rewrites": [
     { "source": "/fred-proxy/:path*", "destination": "https://api.stlouisfed.org/fred/:path*" },
-    { "source": "/api/:path*", "destination": "https://saveero-7nu9.onrender.com/api/:path*" },
+    { "source": "/api/:path*", "destination": "https://$RENDER_API_HOST/api/:path*" },
     { "source": "/(.*)", "destination": "/index.html" }
   ]
```

Vercel substitutes `$RENDER_API_HOST` at deploy time. Prod gets `saveero-7nu9.onrender.com`, staging gets `saveero-staging-xxxx.onrender.com`. No fork of the config file.

If the env var is missing on either project, the rewrite breaks and `/api/*` calls fail. Double-check both project env vars are set before merging this PR.

---

## 6. Test the full loop

From your laptop:

```bash
git checkout -b chore/staging-smoke-test
echo "// test" >> webapp/src/api/portfolioApi.ts
git commit -am "chore: staging smoke test"
git push origin chore/staging-smoke-test
```

Open a PR — Vercel prod-project preview spins up. Hits prod backend. Good.

Now push to staging:

```bash
git push origin chore/staging-smoke-test:staging --force-with-lease
```

- Render staging service redeploys (Events tab on `saveero-staging`)
- Vercel staging project redeploys
- Open the staging Vercel URL — hits staging Render
- Confirm staging Render shows your test change in its rebuild logs

Revert the test commit before merging the PR.

---

## 7. Tell the team

Once it's working, update the team channel + the new dev's onboarding:

> Staging environment is live. Push your feature branch to `staging` for a full-stack preview when your PR touches backend code. Details in `CONTRIBUTING.md` → Preview URLs.

---

## Troubleshooting

**Staging Render 503s and never recovers** — env vars probably wrong. Compare against prod, especially `SUPABASE_*` and `SUPABASE_JWT_JWK`.

**Staging Vercel build succeeds but `/api/*` calls 404** — `RENDER_API_HOST` not set on the staging Vercel project, or the value has the protocol (`https://`) attached (it shouldn't — the rewrite already supplies it).

**Pushing to `staging` doesn't trigger a Render redeploy** — webhook in step 3 isn't firing. Check the Recent Deliveries panel in GitHub for the staging webhook (separate from the prod one).

**Pushing to `staging` triggers prod redeploy** — prod webhook is incorrectly listening on `staging` pushes too. In GitHub webhook settings, restrict prod's webhook to specific branches.

**`force-with-lease` rejects your push** — someone else has pushed to staging since you last fetched. Run `git fetch origin staging`, force-push will succeed assuming you've reviewed what's there.
