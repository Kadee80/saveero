<!--
Keep this short. The point is to give the reviewer enough context to
review without having to read the whole diff blind.
-->

## What

<!-- One sentence. e.g. "Adds the Portfolio Strategy Engine + UI." -->

## Why

<!-- The user-visible problem or product motivation. -->

## Testing notes

<!--
What you tested locally + what the reviewer should pay extra attention to.
e.g.
- Ran portfolio golden tests; all 10 pass
- Verified /portfolio-builder loads with sample inputs against local backend
- Did NOT test the wizard flow yet (intentional — pending Van's matrix)
-->

## Flags

<!-- Tick anything that applies. Untick lines you don't need. -->

- [ ] **Backend changes** — touches `api/`, `portfolio/`, `scenarios/`, `mortgage/`, `core/`, or anything Python. **If checked, also push the branch to `staging` for a full-stack preview URL.**
- [ ] **Database migration** — adds a file in `db/migrations/`. After merge, run the migration against prod Supabase manually (or document why we're deferring).
- [ ] **Env var changes** — adds or renames anything in `.env.example`. Confirm Render + Vercel prod env vars are updated before this lands on `main`.
- [ ] **Breaking UI change** — moves or removes a route, changes a URL shape, or removes a feature visible to demo users. Confirm Van/Katie are aware before merge.

## Preview

<!--
Auto-generated Vercel preview URL goes below as a comment from the
Vercel bot. If you also pushed to staging, paste that URL here too:
e.g. Staging full-stack: https://saveero-staging.vercel.app
-->
