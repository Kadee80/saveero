# Saveero — User Flows

A product surface map of the Saveero web app as built. Written for whoever is
authoring the end-user guide — captures the as-built behavior of every page and
flow so the guide can be assembled without rediscovering the app screen-by-screen.

This is *user-facing* documentation. For developer reference (architecture, API,
math), see `README.md`, `SCENARIOS.md`, `FRONTEND.md`, `BACKEND.md`.

---

## 1. Who uses Saveero

Four audiences, each gets a different surface inside the same app:

| User type | Identified by | What they see |
|---|---|---|
| **Current homeowner** (consumer) | `lead.role === 'homeowner'` | Dashboard hero = Decision Map; full homeowner scenario engine |
| **First-time buyer** (consumer) | `lead.role === 'first_time_buyer'` | Dashboard hero = FTHB Decision Map; FTHB scenario engine |
| **Industry pro** | `lead.role === 'pro'` | Same tools, but the input pages default to the **dense all-fields** view rather than the step wizard (toggleable) |
| **Admin** | `public.users.role === 'admin'` | All of the above plus the **CRM** nav link → `/admin/crm` |

A new signup lands as `role='unknown'`; the **Onboarding Wizard** captures their
role + intent + pipeline preference and routes them to the right hero from the
first session onward.

---

## 2. Getting in: the anonymous-first entry path

Every calculator works without signing up. Anonymous users get a slim
sidebar shell (`AnonymousShell`) that mirrors the authed app's
dimensions but with the nav filtered to public routes — locked items
render with a Lock icon and route to signup. Each locked click is a
high-quality conversion event, not a dead-end.

### Landing → /start → calculator

1. **Landing** (`/`) — public marketing page. Every CTA ("Get
   started" / "Try it now") routes to `/start`, **not** to the
   signup form.
2. **`/start`** mounts the OnboardingWizard anonymously
   (`StartIntake.tsx` wrapper). Same 5-step wizard as the
   post-signup version, but answers are stashed in localStorage
   instead of PUT-ing to a lead row.
3. On finish, the user is routed to the matching engine page
   (`/decision-map` or `/fthb-decision-map`) based on the derived
   role from their intake answers.
4. They can run the calculator end-to-end — engine endpoints accept
   anonymous requests. The "Save scenario" and "Contact a partner"
   buttons render as `SignupPrompt` instead of doing their normal
   action.
5. When they eventually sign up, `App.tsx`'s session-mount effect
   reads the stash and PUTs the intake answers into the
   freshly-seeded lead row (no double-wizard) AND saves their last
   anonymous analysis as their first saved scenario (no lost work).

### Signup

Standard Supabase email + password signup. The signup form also captures a
`name`. On first authenticated session the backend seeds a `leads` row with
`role='unknown'`, `intent='unknown'`, `status='new'` and any name they provided.

### Onboarding wizard

Renders inline on the Dashboard the first time a freshly-signed-up user lands
there (any time `role` or `intent` is still `'unknown'`). Five steps, one
decision per screen, with a progress strip and Back / Next / Finish:

1. **Name** — pre-filled from signup. **Required to advance**; the only step
   that gates Next.
2. **Do you currently own a home?** — Yes / No tile cards.
   - **Yes** → flagged as a current homeowner
   - **No** → flagged as a first-time buyer
3. **Who's using Saveero?** — *Just me* (consumer) / *Industry pro*.
   - Combined with step 2 to produce the final `lead.role`:
     - pro overrides → `'pro'`
     - consumer + currently owns → `'homeowner'`
     - consumer + does NOT currently own → `'first_time_buyer'`
4. **What brought you in?** — *Considering a move* / *Refinance* / *Exploring
   renting it out* / *Just curious*. Skippable.
5. **Who do you want to work with?** — *Financial planner* / *Real estate
   agent* / *Mortgage broker*. Skippable; can be picked later from the
   Dashboard.

On Finish, one PUT lands on `/api/leads/me` with whatever was selected. The
backend bumps the lead's status from `'new'` to `'enriched'` as soon as role or
intent moves off `'unknown'`, and the wizard never shows again (the Dashboard
gate checks role + intent).

---

## 3. The Dashboard

Hub at `/`. Three blocks, top to bottom:

### Greeting
"Welcome back" + the user's email subtly underneath.

### Marquee tool (hero card)

The hero **forks by role**:

- `role === 'first_time_buyer'` → **FTHB Decision Map** hero (linked to
  `/fthb-decision-map`). Copy: "Five paths to your first home."
- Everyone else (homeowner, pro, unknown) → **Decision Map** hero (linked to
  `/decision-map`). Copy: "Model all five paths — stay, refinance, sell & buy,
  rent, rent out & buy."

### Secondary tools

Two utility tiles, shown to everyone but with copy **forked by audience**:

- **Mortgage Calculator** → `/mortgage-calculator`
- **Compare Scenarios** → `/scenarios`

Buyers see "estimate the payment on a home you're considering" framing;
existing-homeowner/pro see the neutral framing.

### Recent calculations

A panel of up to **6 most-recent saved analyses** — merged from both engines
(Mortgage Calculator saves *and* FTHB Decision Map saves). Each card deep-links
back to its source tool with `?analysis=<id>`, which pre-fills the inputs so
the user resumes exactly where they left off. Empty state prompts them to run
the Mortgage Calculator and Save.

---

## 4. The tools (in nav order)

The left sidebar lists, in order:

`Home · Decision Map · FTHB · Mortgage · Compare · [CRM if admin] · List Property`

### 4.1 Decision Map (`/decision-map`) — Homeowner engine

The marquee tool for current homeowners. Models five housing decisions side by
side from your inputs.

**Five scenarios:**
- **Stay** — keep current home + mortgage (baseline)
- **Refinance** — keep home, replace loan at a new rate
- **Sell & Buy** — sell current, buy a replacement
- **Rent** — convert current home to a rental (investment view)
- **Rent Out & Buy** — keep current as rental + buy a new primary

**Page layout:**
- Header: title + "Reset to defaults" button
- **Inputs collector** — see "Wizard vs. all-fields view" below
- Comparison tables, charts, scenario detail cards, audit strip — all derived
  from a single engine run

**Wizard vs. all-fields view (key concept — applies to both Decision Map
pages):** The inputs are collected through a shared component that has two
views:

- **Step-by-step wizard** (default for consumers) — one group of fields per
  screen, progress strip with **named step labels** under each numbered dot,
  Back / Next / Finish. Each step has a **per-step illustration** beside the
  heading (~180px square, generated via `scripts/gen_illustrations.py`) and
  an instructive description ("Just a few details to help us build your
  decision map. Approximate numbers are perfectly fine."). The wizard card
  is **`position: sticky top-0`** so it stays in view while the user scrolls
  down to results. The Finish button runs the engine. 7 steps: Tell us about
  your home / Market & tax assumptions / Refinance terms / Purchase of new
  home / New-home ongoing costs / Rental income & expenses / Liquidity check.
- **All-fields form** (default for pros) — every field on one scrollable card
  stack, single Recalculate button at the bottom.

The toggle is in the top-right of the inputs section ("Step-by-step / All
fields"). The user's choice **persists in localStorage** for that page — once
they pick, their preference wins forever.

**Tooltips on every field.** A small `?` button next to each label opens a
plain-English explanation pulled from the centralised tooltip copy file
(`webapp/src/copy/tooltips.ts`). Keyboard accessible, portal-rendered so it
escapes overflow-hidden parents.

After clicking Recalculate (in either view), results render below: a
decision summary, a comparison table across all 5 scenarios, scenario detail
cards, monthly-cost / equity charts, and an audit strip. The recommendation
card has Contact-a-partner CTAs that fire a `clicked_contact_*` activity → a
status transition to `engaged` → an outbound webhook (see §6).

### 4.2 FTHB Decision Map (`/fthb-decision-map`) — First-time-buyer engine

Counterpart to Decision Map for users who don't currently own. Same
input-wizard / all-fields toggle pattern.

**Five FTHB scenarios:**
- **Continue Renting** — keep renting, invest the cash, accumulate savings
- **Buy Starter Home** — entry-priced purchase at the universal down payment
- **Buy Preferred Home** — higher-priced "reach" purchase
- **Buy with Downpayment Assistance** — starter home + DPA (carries a 50bps
  higher rate and the DPA principal gets subtracted from equity at horizon as
  a forced repayment)
- **Delay Purchase** — wait one year, save more, reassess

**6-step wizard:** Your financial profile / Your home goals / Rates & term /
Costs & taxes / Growth assumptions / Feasibility & assistance.

**Results below the inputs:**
- **Recommendation card** with best executable path + net position + best
  monthly affordability / best savings capacity / lowest cash required + an
  actionable insight paragraph.
- **Save bar** — name the scenario (optional) + Save button. Saved analyses
  show up in the Dashboard's Recent Calculations panel and can be re-opened via
  `?analysis=<id>` deep links.
- **Scenario comparison table** with feasibility + risk chips.
- **Per-scenario detail card grid** — one card per scenario with key numbers.

Net position formula is load-bearing for the user's understanding:
`equity at horizon + future value of remaining cash + projected savings
accumulation`. The third term is what makes higher monthly housing costs hurt
long-term wealth.

### 4.3 Mortgage Calculator (`/mortgage-calculator`)

Single-scenario monthly-payment calculator. **Live auto-recalc** — results
update as you type (150ms debounce). Seven inputs (purchase price, down
payment, rate, term, property tax %, insurance, monthly HOA). A "Load current
Fed rates" button pre-fills the rate based on the selected term (15/20/30).

Save button persists a named analysis to the user's saved-analyses list;
appears in Recent Calculations on the Dashboard with a `?analysis=<id>` deep
link back.

Output includes: monthly principal & interest, all-in monthly with breakdown,
LTV, total interest paid, total cost of loan, PMI required (yes/no with
drop-off month), full amortization table (toggleable).

### 4.4 Compare Scenarios (`/scenarios`)

Stack up to three *financing* scenarios — different down payments, terms, or
rates on the same home — side by side. Different shape from the other tools:
it's parallel scenarios rather than one form. Useful when picking between
"20% down vs 10% down" or "15-year vs 30-year."

### 4.5 List Property (`/list-property`)

AI photo-to-listing wizard. Three steps:

1. **Upload photos** + property address + optional notes
2. **Review** the AI-generated listing — title, description, features, beds /
   baths / sqft, suggested price range, comparable properties. Description is
   editable inline.
3. **Confirm and save** to the user's listings.

During Step 1 → Step 2 the backend runs a vision + LLM pipeline that takes
roughly **one to two minutes**. The UI shows a **staged progress checklist**
that walks through *Analysing your photos → Detecting rooms & features →
Writing the listing → Finding comparable properties → Pricing against the comps
→ Polishing the description*, plus a live elapsed-time counter. The checklist
isn't real backend progress events (it's a timer-based estimate) but the stages
are accurate and it sets honest expectations that this takes a minute.

A 180-second fetch timeout sits behind it — a truly stuck request surfaces a
clear "timed out, server may be waking up — try again" message.

---

## 5. Admin CRM (`/admin/crm`)

Visible only to users with `public.users.role = 'admin'`. The nav link is
hidden for everyone else; direct URL access shows a 403 card.

### Header
Title "Leads" + a `count` subtitle ("12 total · 3 new · 5 enriched · ..."), and
on the right: a **Kanban / Table** view toggle and an **Export CSV** button.

### Filter bar
Two facets above the lead listing:
- **Pipeline** — Financial planner / Real estate agent / Mortgage broker
- **Intent** — Considering a move / Refinance / Exploring renting / Curious /
  Unknown intent

Chips toggle on click. Within a facet they OR (selecting "planner" + "broker"
shows leads matching either); across facets they AND. An empty facet doesn't
constrain. When any chip is active a "Showing X of Y · Clear filters" control
appears.

### Kanban view (default)
Four primary columns for the active funnel: **New → Enriched → Active →
Engaged**. Below them, separated by a horizontal rule, two **Resolved**
columns: **Converted** and **Lost** (only reachable via admin action).

Each lead card shows name, role + intent chips, pipeline chip (if set), last
activity, and "time in stage." Click a card to open the **Lead drawer**
(below). Hover any card to reveal a selection checkbox.

### Table view
Toggleable from the header (choice persisted in localStorage). Same data, same
filter behavior — rendered as a flat scannable table with columns: select,
Name, Email (mailto link), Status chip, Role, Intent, Pipeline chip, Last
activity, In stage. Row click opens the drawer; row checkbox feeds the same
bulk-select.

### Export CSV
Header button. Downloads the **current view** (filtered) as a CSV named
`saveero-leads-YYYY-MM-DD.csv`. When a filter is active the button shows the
count, e.g. "Export CSV (12)." RFC-4180 escaping, human-readable values (uses
the same labels as the UI).

### Bulk delete
Selecting cards/rows reveals a floating bottom-of-screen action bar with
"N selected · Delete · Clear." Delete opens an in-app confirm modal (no native
`window.confirm`); confirming removes the leads. Only the `leads` rows are
deleted — the `public.users` record stays, and if the user comes back they
re-seed as a fresh `new` lead.

### Lead drawer
Clicking a card or table row slides in a right-side drawer:
- **Details card** — Name, Email (mailto link), Role, Intent, Pipeline,
  Created, In stage. "Edit details" toggles inline editing of Name / Role /
  Intent / Pipeline.
- **Change status** panel — admin can move a lead to any status (including
  walking a Converted lead back to Engaged if a deal falls through). Optional
  note attached to the activity log.
- **Activity timeline** — newest first, every event the lead has triggered.
- **Delete lead** — at the bottom, red, separated.

### Engaged-lead webhook (operational)

When a lead transitions *into* `engaged` (because they clicked a Contact-a-
partner button), the backend fires an outbound webhook so the partner team can
react fast. The webhook is **dormant by default** — it does nothing unless
`ENGAGED_LEAD_WEBHOOK_URL` is set in the prod env (see §6). When configured, it
posts to a Zapier "Catch Hook"; routing the payload to Slack / email / SMS /
etc. is configured on the Zapier side, so the channel can change without a code
deploy. Admin manually marking a lead `engaged` does NOT fire the webhook —
only the user-driven transition does.

---

## 6. Operational settings (env vars)

Most users don't see these; included here so the user guide / setup section can
mention them if relevant.

| Env var | What it does | Default |
|---|---|---|
| `ENGAGED_LEAD_WEBHOOK_URL` | Zapier Catch Hook URL for engaged-lead notifications. **Unset → notifications silently skipped.** | unset |
| `APP_BASE_URL` | Public URL of the deployed app, used to build a deep-link to the CRM in the notification payload. | unset (uses relative path) |
| `VITE_LANDING_ENABLED` | Whether the public landing page is shown to signed-out users. | `true` |
| `OPENROUTER_API_KEY` | Required for the AI listing wizard. | (required) |
| `BRIDGE_SERVER_KEY` | Optional MLS API key. Perplexity is used as fallback if unset. | unset |

**Promoting an admin (one-off SQL):**
```sql
update public.users set role = 'admin' where email = 'them@example.com';
```
The user has to have completed signup first (their `public.users` row is
seeded on first auth). The CRM nav link appears on their next session.

---

## 7. What persists vs. what's session-only

Worth knowing for the user-guide "what happens when I close the tab" section:

| Surface | Persisted | Where |
|---|---|---|
| Saved Mortgage Calculator analyses | Yes | `mortgage_analyses` table; visible in Dashboard Recent panel; re-open via `?analysis=<id>` |
| Saved FTHB Decision Map analyses | Yes | `fthb_analyses` table; same Recent panel + deep-link pattern |
| Lead profile (name, role, intent, pipeline) | Yes | `leads` table |
| Activity log (every run / contact click / status change) | Yes | `leads.activity_log` JSONB |
| Decision Map inputs / scenarios for a *current* session | **No** — fields reset on Reset to defaults, and the inputs themselves aren't saved separately from a Save bar (FTHB has Save; homeowner Decision Map currently does not) |  |
| Wizard vs all-fields view choice | Yes | `localStorage`, per page |
| CRM Kanban vs Table view choice | Yes | `localStorage` |
| Filter chips (CRM) | No — session-only | — |
| Bulk-select state (CRM) | No — session-only | — |

---

## Appendix — page-to-route map

| Route | Component | Audience |
|---|---|---|
| `/` | `Dashboard` | All signed-in users |
| `/decision-map` | `DecisionMap` | All (marquee for homeowners) |
| `/fthb-decision-map` | `FTHBDecisionMap` | All (marquee for first-time buyers) |
| `/mortgage-calculator` | `MortgageCalculator` | All |
| `/scenarios` | `ScenarioComparison` | All |
| `/list-property` | `ListProperty` | All |
| `/admin/crm` | `AdminCRM` | Admins only (403 otherwise) |
| `/login` | `Login` | Signed-out users |
| `/` (signed-out) | `Landing` | Signed-out users |
