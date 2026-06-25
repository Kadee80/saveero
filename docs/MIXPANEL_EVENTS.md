# Mixpanel event catalog

Every product-analytics event the frontend fires, with payload shape
and trigger condition. Mixpanel is the only product-analytics tool
in the codebase today.

**Source of truth:** `webapp/src/analytics/mixpanel.ts` defines the
`EVENTS` constant. If this doc and that file disagree, the file
wins — open a PR to fix the doc.

**No-op behavior:** all calls are silent no-ops when
`VITE_MIXPANEL_TOKEN` is unset (default in local dev + by-design for
keeping non-prod environments out of the MTU count). Safe to add
`analytics.track()` calls anywhere — they cost nothing when the
token's absent.

---

## Naming convention

**Object-Action, Title Case.** Examples: `Account Created`,
`Analysis Run`, `Partner Contacted`. Past-tense verb. Matches the
Mixpanel-recommended pattern (https://mixpanel.com/help/articles/data-design-considerations).

Don't introduce events that depart from this — Mixpanel's funnel/
retention reports get harder to read when names are inconsistent.

---

## Event catalog

### `Account Created`

The value moment. A new account is created (signup form submitted
successfully, before email confirmation).

**Fired from:** `pages/Login.tsx` after `signUp()` resolves with no
error.

**Payload:**
| Property | Type | Notes |
|---|---|---|
| `method` | string | Always `"email"` today; reserved for future SSO. |

**Identity:** caller also calls `analytics.identify(user.id, ...)`
immediately before tracking, so this event is the first one attached
to the new authenticated identity (not anonymous).

---

### `Signed In`

A returning or new user establishes an authenticated session. Fires
on Supabase auth state changing to `SIGNED_IN` — both after the
signup flow finishes and on a returning user signing in.

**Fired from:** `App.tsx` `onAuthStateChange` handler when `event ===
'SIGNED_IN'`.

**Payload:**
| Property | Type | Notes |
|---|---|---|
| `method` | string | Always `"email"` today. |

**Note:** does NOT fire on session hydration from a cached token
(returning visitor with a live session) — only on an explicit
sign-in or signup. Treat as "fresh authentication" rather than
"page load with valid session."

---

### `Onboarding Completed`

The intake wizard finished and the user's lead row was enriched.
Fires for both authed (`OnboardingWizard` mounted from Dashboard)
and anonymous (`/start` mounted in `StartIntake`) completions.

**Fired from:** `pages/OnboardingWizard.tsx` after the
caller-supplied `onSubmit` resolves.

**Payload:**
| Property | Type | Notes |
|---|---|---|
| `role` | enum string | `"homeowner"` / `"first_time_buyer"` / `"pro"` / `undefined` if skipped. |
| `intent` | enum string | The intent step's selection; varies by persona. `undefined` if skipped. |
| `pipeline` | enum string | `"financial-planner"` / `"real-estate-agent"` / `"mortgage-broker"` / `undefined`. |
| `pro_type` | enum string | Only set when `role === "pro"`. |

**Anonymous distinction:** the user's Mixpanel identity at this
moment carries an `anonymous` super-property if they completed via
`/start` before signing up — useful for segmenting funnel paths.

---

### `Analysis Run`

A decision engine ran successfully and rendered a recommendation.
Fires on every successful Recalculate, not just the first one.

**Fired from:** `pages/DecisionMap.tsx` and
`pages/FTHBDecisionMap.tsx` immediately after `runAll()` returns
without error.

**Payload:**
| Property | Type | Notes |
|---|---|---|
| `engine` | enum string | `"homeowner_decision_map"` or `"fthb_decision_map"`. |
| `recommended` | string | The slug of the best-scoring scenario (e.g. `"refinance"`, `"buy_starter"`). |
| `anonymous` | boolean | `true` if the user wasn't signed in when they ran it. |

**Not yet wired:** `pages/PortfolioBuilder.tsx` — to be added when
the engine ships.

---

### `Scenario Saved`

A computed analysis was saved to the user's account (POST to
`/api/fthb/analyses` or `/api/mortgage/analyses` succeeded).

**Fired from:** `pages/FTHBDecisionMap.tsx` after
`saveFthbAnalysis()` resolves. (Homeowner Decision Map doesn't
currently have a server-side save target; this event will fire from
that page too if/when `/api/scenarios/analyses` is added.)

**Payload:**
| Property | Type | Notes |
|---|---|---|
| `engine` | enum string | `"fthb_decision_map"` today. |
| `label` | string | The user-supplied name for the saved scenario. |

---

### `Partner Contacted`

The engaged-lead conversion moment. A user clicked one of the
"Contact a [Mortgage Broker / Real Estate Agent / Financial Planner]"
CTAs.

**Fired from:** `components/ContactPipelineButton.tsx` on click.

**Payload:**
| Property | Type | Notes |
|---|---|---|
| `pipeline` | enum string | `"financial-planner"` / `"real-estate-agent"` / `"mortgage-broker"`. |

**Side effects beyond Mixpanel:** the click also POSTs an activity
to `/api/me/lead`, which triggers the backend's status-ladder bump
(`enriched` → `engaged`), which (if `ENGAGED_LEAD_WEBHOOK_URL` is
configured) fires the outbound Zapier webhook for downstream
notifications. So this event sits at the same moment as our
highest-priority funnel transition.

---

## Identity model

`analytics.identify(supabaseUserId, traits)` is called:

- **On signup** — immediately before `Account Created` (so the value
  moment lands on the authenticated identity, not anonymous).
- **On sign-in** — immediately before `Signed In`.
- **On profile probe** — `App.tsx` registers `role` as a super
  property when the user's lead loads, so every subsequent event
  carries it for segmentation.
- **On sign-out** — `analytics.reset()` is called to clear the
  identity and start fresh anonymous tracking again.

Super properties attached at identify time:
| Property | Source |
|---|---|
| `email` | Supabase user record |
| `name` | Supabase user_metadata (from signup form) |
| `role` | Lead row, set on profile probe |

---

## Adding a new event

1. Add the constant to `EVENTS` in
   `webapp/src/analytics/mixpanel.ts`. Use the `Object-Action`
   Title Case pattern.
2. Add a JSDoc comment above it describing exactly when it fires —
   the doc here gets generated from your discipline.
3. Call `analytics.track(analytics.EVENTS.YOUR_EVENT, { ...props })`
   from the call site.
4. Add a section to this doc with: where it's fired from, payload
   shape, any side effects beyond Mixpanel.
5. If the event represents a new funnel stage, mention it in the
   relevant page doc (`USER_FLOWS.md`).

---

## What we deliberately don't track

Listed so the next dev doesn't try to add these and get pushback:

- **Pageview events.** We use `analytics.trackPageView(pathname)`
  in `App.tsx`'s route effect — that's one event per route change,
  consistent across the SPA. Don't fire pageviews from individual
  pages.
- **Field-level interaction events** (typing, focus, blur). Too
  noisy; Mixpanel MTU pricing scales with event volume.
- **Auto-capture.** Mixpanel's auto-capture is **disabled** in the
  wrapper init (`autocapture: false`). Every event in our funnel is
  intentional. Don't enable auto-capture without a deliberate
  conversation about what it changes for our data shape.

---

## See also

- [`USER_FLOWS.md`](./USER_FLOWS.md) — where in the product these
  events fire
- [`FRONTEND.md`](./FRONTEND.md) — the `analytics/mixpanel.ts` module
- [`ENV_VARS.md`](./ENV_VARS.md) — `VITE_MIXPANEL_TOKEN` setup
