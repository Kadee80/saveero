# Infrastructure roadmap

The list of "we should pay for / migrate / upgrade this" items, in
rough priority order. Each entry: what it is, what it costs, what it
unblocks, when to do it.

Update this when you make a decision (move items into the "Done" section
at the bottom) or when a new item shows up. The new dev reads this on
day one alongside `CONTRIBUTING.md`.

---

## TL;DR — what to spend on first

| # | Item | Monthly cost | Urgency | Status |
|---|---|---|---|---|
| 1 | Supabase Free → Pro | $25 | High | Open |
| 2 | Render Free → Starter | $7 | High | Open |
| 3 | Staging environment | $0 (or +$7) | Medium | Runbook ready, not built |
| 4 | Error reporting (Sentry / similar) | $0 free tier | Medium | Open |
| 5 | Automated DB migration runner | $0 | Low | Open |
| 6 | Render-only consolidation | $0 net | Low (decision) | Open question |

Total monthly to fix the two highest-priority items: **$32**. Worth it before any investor / partner demo where a 30-second cold start or a paused-Supabase sign-in failure is hard to recover from.

---

## 1. Supabase Free → Pro ($25/mo) — High urgency

**The pain.** Free tier auto-pauses the project after about a week of inactivity. When paused, every sign-in fails with a network-level "Failed to fetch" error and there's no way to recover except logging into the Supabase dashboard and hitting "Resume." Caught us 2026-06-22 right before a planned next-day demo.

**What Pro buys us.**
- No auto-pause. The project stays live indefinitely.
- 7-day point-in-time recovery (PITR). Restore the database to any moment in the past week — critical if a migration corrupts data or someone accidentally deletes a table.
- Larger daily backup retention (30 days vs 7).
- Compute upgrade — better baseline performance under load.
- Direct phone support (limited).

**What it unblocks.**
- Reliable demo / first-impression experience for the people we're pitching.
- Ability to run experiments on prod data with confidence we can roll back.
- Path to a separate dev Supabase project (Pro gives bigger limits, harder to outgrow).

**When to upgrade.** Before the next investor / partner / influencer demo cycle. There's no good reason to wait — at this point free tier is costing us more in mid-demo recovery than $25/mo would cost in cash.

**How to upgrade.** Supabase dashboard → Project Settings → Plan → "Upgrade to Pro." Card on file. Effect is instant.

---

## 2. Render Free → Starter ($7/mo) — High urgency

**The pain.** Free tier dynos sleep after 15 minutes of inactivity. First request to a cold dyno takes 10–30 seconds while it spins up — during which time the Dashboard's lead-fetch retry loop spins, and on the worst cold starts the user thinks the app is broken. Already hit this multiple times. Workaround in CONTRIBUTING.md ("hit /api/health before demos") is fine for the demo path but useless for any new user who shows up cold.

**What Starter buys us.**
- No sleep. Dyno is always warm.
- Faster CPU + more RAM than free tier (1 GB vs 512 MB).
- Reasonable allowance for build minutes.

**What it unblocks.**
- First-impression UX for any user who lands at saveero.com cold — no more 30-second blank screen.
- Real cost-of-ownership baseline for production hosting (can move from "is this free tier sufficient?" to "what's the next plan tier we need?").
- Makes single-platform consolidation (item 6) feasible without sacrificing UX.

**When to upgrade.** Same window as Supabase Pro — these are paired in pain reduction.

**How to upgrade.** Render dashboard → `saveero-7nu9` service → Settings → Plan → "Starter." Card on file. Effect is on next deploy (the dyno migrates).

---

## 3. Staging environment — Medium urgency

**Currently:** runbook ready at `docs/STAGING_SETUP.md` but the environment hasn't been built yet. Needs ~30 minutes in the Render + Vercel dashboards.

**The pain.** Without staging, anything that can't be fully tested via Vercel's PR-preview URL (which only previews the frontend) has to be:
- merged to main and tested in prod (risky), or
- hidden behind a feature flag (extra code complexity), or
- tested manually by the author with no second pair of eyes (loss of review value).

We currently use the feature-flag approach (`VITE_LANDING_ENABLED`, `VITE_PORTFOLIO_ENABLED`) for in-flight features. That works but it's a workaround for not having a real staging environment.

**What staging buys us.**
- Full-stack PR previews for any change that touches both layers.
- Genuine pre-merge review (reviewer can click around, not just read diff).
- Fewer feature flags = less branching in the codebase.

**Cost.** $0 if both staging services run on free tier (cold-start is acceptable for staging — you only hit it actively when reviewing a PR). +$7/mo if you want staging Render warm too (probably not necessary).

**When.** When the team becomes 2+ devs and PR review becomes meaningful. Ideally before then, so the new dev's first PR can use it.

---

## 4. Error reporting (Sentry / similar) — Medium urgency

**Currently:** zero production observability. We learn about errors when Katie or a user manually reports them. The wizard race condition, the listing API hang, and the Supabase pause were all discovered by user pain, not by monitoring.

**What it buys us.**
- Email/Slack alert on any uncaught exception in prod (frontend or backend).
- Stack traces with sourcemaps so we can see exactly which line errored.
- User session replay (Sentry / LogRocket) — see what the user did before the error.
- Performance monitoring — slow API calls bubble up.

**Cost.** Sentry free tier covers 5,000 errors / month — plenty for our current volume. Paid plans start ~$26/mo when we outgrow it.

**When.** Before the new dev's first significant prod release. Two devs shipping to prod without observability is the speed at which silent bugs accumulate fastest.

**Setup.** ~1 hour. Sentry SDK on both frontend (`@sentry/react`) and backend (`sentry-sdk`). DSN as env var. Wire to React's error boundary.

---

## 5. Automated DB migration runner — Low urgency

**Currently:** when a PR adds a migration in `db/migrations/`, the author runs it manually against prod Supabase after merge. Documented in `CONTRIBUTING.md`. Works fine while it's just Katie remembering — gets brittle with multiple people.

**What automation buys us.**
- A CI step that runs new migrations against the dev/staging DB on PR merge.
- A deploy hook on prod that runs new migrations before the new code goes live.
- No risk of "forgot to run the migration" producing 500s in prod.

**Cost.** $0 — just CI time. A Supabase CLI workflow runs the SQL.

**When.** Once we have 2+ devs AND staging is up. The runner needs a separate dev/staging DB to be useful (otherwise it'd run migrations against prod from CI, which is scary). So this trails item 3.

**Approach.** Supabase CLI `supabase db push` in a CI job, gated on the migrations folder having changes.

---

## 6. Render-only consolidation — Open question

**Context.** The new dev (joining soon) suggested moving everything off Vercel + Render to just Render. See detailed pro/con analysis in the chat history.

**Decision: defer until items 1-2 are done.** The biggest argument against consolidating right now is that consolidation makes the Render cold-start affect the frontend too. Once Render is paid (item 2), that concern evaporates.

**Other tradeoffs to revisit when the new dev is in the seat:**
- Loss of Vercel's CDN — fine if our user base is geographically narrow (US-only)
- Loss of per-PR Vercel preview URLs — important to replace before consolidating (staging environment partially fills this gap)
- Loss of fast frontend redeploys — small price for one-platform simplicity

**My current read.** Worth doing eventually for the operational simplicity. Not worth doing this week. Revisit once the new dev is up and running and we've done items 1-3.

---

## Deferred — open but no momentum

- **Custom domain.** Are we using saveero.com / saveero.app / a vercel.app subdomain? Branding-relevant when we share links externally.
- **Logging aggregation.** Render shows logs in its dashboard but they don't persist long. Worth a real logging service (Logtail, Better Stack, etc.) once we have 2+ devs and actually need to search logs from a week ago.
- **Backup-restore drill.** Quarterly. Even with Supabase Pro's PITR, we should run a drill once to confirm we know the procedure.
- **Secrets rotation policy.** No formal one today. When the team grows past 2 we should rotate Supabase service role key + OpenRouter key annually.
- **Custom CI runner / self-hosted GitHub Actions.** Not currently needed; revisit only if CI minutes become a cost.

---

## Done

*(Move items here as decisions land, with date + outcome.)*

- *Nothing yet — list is established 2026-06-22.*
