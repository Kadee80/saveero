# Frontend

React 18 + Vite + TypeScript SPA, Tailwind + shadcn for styling.
Read this for the package map + conventions; for system-level
context, see [`ARCHITECTURE.md`](./ARCHITECTURE.md). For the product
surface (what the user actually sees), see
[`USER_FLOWS.md`](./USER_FLOWS.md).

---

## Package map

```
webapp/
├── public/
│   └── illustrations/           PNGs used in Landing + wizard steps
├── src/
│   ├── App.tsx                  Top-level routing + auth-conditional shells
│   ├── main.tsx                 React entry; initialises Mixpanel
│   │
│   ├── pages/                   One component per route
│   │   ├── Landing.tsx          /              public marketing surface
│   │   ├── StartIntake.tsx      /start         anonymous intake wizard
│   │   ├── Login.tsx            /login         auth (signin + signup tabs)
│   │   ├── Dashboard.tsx        / (authed)     persona-aware hub
│   │   ├── DecisionMap.tsx      /decision-map           homeowner engine
│   │   ├── FTHBDecisionMap.tsx  /fthb-decision-map      FTHB engine
│   │   ├── PortfolioBuilder.tsx /portfolio-builder      portfolio (flagged off)
│   │   ├── MortgageCalculator.tsx /mortgage-calculator  single-scenario calc
│   │   ├── ScenarioComparison.tsx /scenarios            stack up to 3 scenarios
│   │   ├── ListProperty.tsx     /list-property          AI listing wizard
│   │   ├── OnboardingWizard.tsx (mounted inline by Dashboard when lead is incomplete)
│   │   └── AdminCRM.tsx         /admin/crm     Kanban + table CRM
│   │
│   ├── api/                     HTTP clients — one per backend router
│   │   ├── auth.ts              Supabase auth + useSession() hook
│   │   ├── scenarioApi.ts       homeowner engine + save/load
│   │   ├── fthbApi.ts           FTHB engine + save/load
│   │   ├── portfolioApi.ts      portfolio engine
│   │   ├── mortgageApi.ts       mortgage calc + analyses save/load
│   │   ├── leadsApi.ts          lead CRUD + activity tracking
│   │   ├── listingApi.ts        AI listing generation + save/load
│   │   ├── ratesApi.ts          live FRED mortgage rates (with fallback)
│   │   └── anonStash.ts         localStorage bridge for anon → signup replay
│   │
│   ├── components/
│   │   ├── InputWizard.tsx      Shared step wizard + dense-form view toggle
│   │   ├── HelpTip.tsx          Tooltip-button for field help
│   │   ├── SignupPrompt.tsx     Anonymous-mode conversion CTA
│   │   ├── ContactPipelineButton.tsx  Lead-gen CTA (CRM + Mixpanel wired)
│   │   ├── ScenarioIllustration.tsx, ScenarioWatermark.tsx
│   │   └── ui/                  shadcn primitives (button, card, input, …)
│   │
│   ├── copy/
│   │   └── tooltips.ts          Centralised help-tip copy, addressed by slug
│   │
│   ├── analytics/
│   │   └── mixpanel.ts          Typed wrapper around mixpanel-browser
│   │
│   ├── hooks/
│   │   └── useGsapFadeIn.ts     GSAP fade + SplitText helpers
│   │
│   └── lib/
│       ├── utils.ts             cn() helper, formatCurrency, etc.
│       ├── chartPalette.ts      SCENARIO_PALETTE — accent colors per scenario
│       └── mortgage.ts          Client-side amortization helpers
│
├── vite.config.ts               Vite config + dev proxy (/api/* → :8000)
├── vercel.json                  Production rewrites (/api/*, /fred-proxy/*)
└── tailwind.config.ts
```

---

## Routing — anonymous vs authed shells

`App.tsx` is the source of truth for routing. The first thing it does
is check `useSession()`:

```tsx
const session = useSession()       // Session | null | undefined

if (session === undefined) return <LoadingShell />     // still hydrating
if (session === null)     return <AnonymousRoutes />   // not signed in
return <AuthedRoutes />                                 // signed in
```

`undefined` matters — it means "session hasn't resolved yet."
Routing decisions made on `null` before the session resolves will
mis-route a returning user. Always handle the three-state.

**Anonymous routes (`AnonymousShell` wrapper)** — slim sidebar that
mirrors the authed app's dimensions but with the nav filtered to the
routes that work without a session. Auth-only items render with a
Lock icon and route to `/login?mode=signup`. Available routes:

| Path | Notes |
|---|---|
| `/` | Landing (marketing) |
| `/login` | Auth |
| `/start` | Anonymous intake wizard |
| `/decision-map` | Homeowner engine — anonymous-friendly |
| `/fthb-decision-map` | FTHB engine — anonymous-friendly |

**Authed routes (full sidebar shell)** — every page above plus
`/mortgage-calculator`, `/scenarios`, `/list-property`, `/admin/crm`,
and Dashboard at `/`. The Dashboard mounts `OnboardingWizard` inline
if the lead is incomplete; otherwise the persona-aware hub.

---

## The shared wizard

`InputWizard` + `InputCollector` in `components/InputWizard.tsx` is
used by all three engines (DecisionMap, FTHBDecisionMap,
PortfolioBuilder) and by OnboardingWizard for the post-signup intake.

**Key shape:**

```ts
interface WizardStep {
  title: string
  icon: LucideIcon
  description?: string         // shown under the title; instructive copy
  illustrationName?: string    // file basename in /public/illustrations/
  fields: FieldDef[]
}

interface FieldDef {
  key: string
  label: string
  kind: FieldKind              // 'money' | 'percent' | 'months' | 'years' |
                               // 'months_as_years' | 'number' | 'bool'
  hint?: string                // small caption below the input
  help?: string                // slug into copy/tooltips.ts
}
```

**Conventions:**

- **Don't fork it.** Adding a new wizard step elsewhere should reuse
  `InputWizard`. Add a new `FieldKind` if you need a new input type
  (see how `'months_as_years'` was added — display in years, store
  in months).
- **Per-step illustration** lives at `/public/illustrations/`. Path
  is the basename without extension (`'dm_step_home'` →
  `/illustrations/dm_step_home.png`). Generate via
  `scripts/gen_illustrations.py` — see [`USER_FLOWS.md`](./USER_FLOWS.md)
  for the existing prompts.
- **Field help copy** lives in one file, `copy/tooltips.ts`,
  addressed by slug. New field needing a tooltip → add the slug to
  the tooltips map and reference it from the `FieldDef.help`. Don't
  inline help text.
- **InputCollector** wraps the wizard view with a toggle between
  "Step-by-step" (default for consumers) and "All fields" (default
  for industry pros, detected via `lead.role === 'pro'`). Choice is
  persisted to localStorage.
- The wizard uses **`position: sticky top-0`** so it stays visible
  as the user scrolls down to results. The `InputCollector` returns
  a Fragment (not a wrapper div) so the sticky containing block is
  the page wrapper, not a tightly-fitting parent.

---

## API client conventions

One file per backend router; one function per endpoint. Typed.

```ts
// webapp/src/api/scenarioApi.ts
import type { MasterInputsRequest, RunAllResponse } from './scenarioTypes'

export async function runAll(inputs: MasterInputsRequest): Promise<RunAllResponse> {
  const r = await fetch('/api/scenarios/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs),
  })
  if (!r.ok) throw new Error(`Engine failed: ${r.status}`)
  return r.json()
}
```

**Conventions:**

- **No `fetch()` in components.** Always go through the typed client.
- **Auth-required endpoints** automatically include the Supabase JWT
  via the shared `fetchAuthed` helper (in `api/auth.ts`).
- **Anonymous-friendly endpoints** use plain `fetch`. The shared
  helper `trackActivity` (in `leadsApi.ts`) silently swallows the
  "Not signed in" error so anonymous callers don't need to wrap
  every call in try/catch.
- **Error handling at the call site.** Don't catch-and-silently-
  return-defaults inside the API client; throw and let the caller
  decide.

---

## Anonymous-first conventions

The product treats anonymous users as first-class. The wizard runs,
the engine computes, results render — all without auth. Signup is
the moment the user opts in to persistence, not the gate to use the
product.

A few concrete implications:

- **Calculator URLs are shareable.** `/decision-map` and
  `/fthb-decision-map` are designed for people to send them to
  friends. **Never add a redirect guard on these pages.**
- **Locked nav items aren't hidden.** The anonymous sidebar surfaces
  every nav item — auth-only ones get a Lock icon and route to
  signup. Each locked click is a high-quality conversion event.
- **The anon-stash bridge** (`api/anonStash.ts`) persists the user's
  intake answers + their last engine run in localStorage. On signup,
  `App.tsx`'s session-mount effect reads the stash and PUTs the
  intake answers into the lead row + saves the analysis. The user's
  first authed Dashboard view shows their already-enriched lead and
  their first saved scenario — no double-wizard, no lost work.
- **Save / Contact buttons degrade gracefully.** Anonymous users see
  a `SignupPrompt` where the auth-only affordance would normally
  render.

---

## Analytics

`analytics/mixpanel.ts` is a typed wrapper around `mixpanel-browser`.
Initialised in `main.tsx`. **Safe to call from anywhere** — every
`analytics.track()` and `analytics.identify()` is a silent no-op if
`VITE_MIXPANEL_TOKEN` is unset (which is the default in local dev).

Event catalog: [`MIXPANEL_EVENTS.md`](./MIXPANEL_EVENTS.md).

---

## Adding a new page

1. New file under `src/pages/`. Export a default component.
2. Register the route in `App.tsx` — in the appropriate Routes block
   (anonymous, authed, or both).
3. If the page calls a new backend endpoint, add a typed function to
   the matching `src/api/<concern>Api.ts` (or create a new one).
4. If the page collects form data, reuse `InputWizard` /
   `InputCollector` — don't roll a new form layer.
5. If the page needs an illustration, add the prompt to
   `scripts/gen_illustrations.py` PROMPTS dict, run the script.
6. If the page should be reachable to anonymous users, make sure
   `AnonymousShell`'s nav includes it (in App.tsx); otherwise it'll
   render but won't be discoverable from the sidebar.

---

## Things to avoid

- **Don't fetch from components.** Go through the typed `api/`
  client.
- **Don't fork `InputWizard`.** Add a new `FieldKind` if needed.
- **Don't redirect-guard calculator URLs.** `/decision-map` and
  `/fthb-decision-map` are intentionally shareable.
- **Don't filter auth-only items from the anonymous sidebar.**
  Render them with a Lock; each click is a conversion event.
- **Don't make routing decisions on `null` session before checking
  for `undefined` first.** That mis-routes returning users during
  the hydration window.
- **Don't put help copy inline in field labels.** Use the
  `copy/tooltips.ts` slug pattern so help text is centralised and
  shared across surfaces.
- **Don't add new routes without thinking about anonymous access.**
  Default is "auth required"; opt in to anonymous by adding to
  `AnonymousRoutes` in `App.tsx` and ensuring the backend endpoints
  accept anonymous requests.

---

## Build + test

```bash
cd webapp
npm install
npm run dev                    # http://localhost:5173, proxies /api/* → :8000
npm run build                  # production bundle (tsc + vite)
npm run preview                # serve the production bundle locally
npm test                       # vitest
npm run test:coverage          # coverage
```

The Vite dev server proxies `/api/*` to `localhost:8000` (see
`vite.config.ts`), so the frontend + backend run together against
your local backend + real Supabase.

For test conventions, see [`TESTING.md`](./TESTING.md).

---

## See also

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system overview with diagram
- [`USER_FLOWS.md`](./USER_FLOWS.md) — page-by-page product surface map
- [`BACKEND.md`](./BACKEND.md) — the consuming side
- [`MIXPANEL_EVENTS.md`](./MIXPANEL_EVENTS.md) — analytics event catalog
- [`ENV_VARS.md`](./ENV_VARS.md) — every frontend env var
- [`DEPLOYING.md`](./DEPLOYING.md) — Vercel + deploy workflow
