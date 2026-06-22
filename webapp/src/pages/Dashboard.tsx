/**
 * Dashboard — the logged-in homepage.
 *
 * Used to be a listings table. Repositioned post-demo as a tool hub
 * that puts the mortgage analyzer features front and center: a
 * personalized greeting, a hero card for Decision Map (the marquee
 * surface), and two secondary tiles for the Mortgage Calculator and
 * Scenario Comparison utilities. The listings creator is still
 * reachable via the sidebar, just demoted.
 *
 * Visual language matches the public Landing page — same warm
 * cream/sage/dusty-blue/terracotta palette, same illustration set,
 * same shadow + border treatment — so the user feels like they've
 * crossed into "the app" without the brand changing on them.
 *
 * @component
 * @returns {JSX.Element} The dashboard hub
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  Calculator,
  Clock,
  Compass,
  GitCompare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getUser } from '@/api/auth'
import { createLead, getMyLead, type Lead } from '@/api/leadsApi'
import { listAnalyses, type SavedAnalysisSummary } from '@/api/mortgageApi'
import { listFthbAnalyses, type SavedFthbAnalysisSummary } from '@/api/fthbApi'
import { cn, formatCurrency } from '@/lib/utils'
import { SCENARIO_PALETTE } from '@/lib/chartPalette'
import OnboardingWizard from '@/pages/OnboardingWizard'

/**
 * Possible states of the initial lead fetch.
 *
 *   loading  — first request (or one-shot retry) in flight; show a
 *              minimal placeholder so the hub doesn't flash before the
 *              wizard.
 *   wizard   — lead loaded and role/intent are still 'unknown'; render
 *              the OnboardingWizard inline instead of the hub.
 *   ready    — lead loaded with real role/intent OR we gave up after
 *              the retry and decided to render the hub anyway.
 *
 * The 'ready' branch carries `role` so the hub can pick the right
 * marquee tool (FTHB engine for first-time buyers, homeowner Decision
 * Map for everyone else). It can be null if we gave up on the lead
 * fetch entirely; in that case we fall back to the homeowner hub.
 */
type LeadGate =
  | { kind: 'loading' }
  | { kind: 'wizard'; lead: Lead }
  | { kind: 'ready'; role: Lead['role'] | null }

export default function Dashboard() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [gate, setGate] = useState<LeadGate>({ kind: 'loading' })
  const navigate = useNavigate()

  useEffect(() => {
    getUser().then((u) => setUserEmail(u?.email ?? null))
  }, [])

  // Initial lead fetch — decides whether to render the onboarding
  // wizard or the hub.
  //
  // Two concurrent things race on first sign-in: App.tsx's effect
  // fires createLead() the moment session goes non-null, and Dashboard
  // mounts and fires getMyLead() at roughly the same time. On a slow
  // network — especially a cold Render dyno warming up from sleep —
  // the read can lose for several seconds before the seed lands.
  //
  // Previous fix tried once, then once more after a single fallback
  // create, then gave up. That dropped the wizard in the live demo
  // when both calls lost to a cold-start. Now we retry the read with
  // backoff (~10s of total patience) before falling back to creating
  // the lead ourselves, and the loading state stays up the whole
  // time. Refreshing the page (which used to be the only workaround)
  // is no longer required.
  useEffect(() => {
    let cancelled = false

    function applyLead(lead: Lead) {
      if (cancelled) return
      if (lead.role === 'unknown' || lead.intent === 'unknown') {
        setGate({ kind: 'wizard', lead })
      } else {
        setGate({ kind: 'ready', role: lead.role })
      }
    }

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms))

    async function load() {
      // Generous retry window. Most signups resolve on attempt 1 or 2;
      // the longer tail covers Render cold-starts (free tier sleeps
      // after 15 min idle, takes a few seconds to wake).
      const RETRIES_MS = [0, 700, 1500, 3000, 5000]
      for (const delay of RETRIES_MS) {
        if (delay > 0) await sleep(delay)
        if (cancelled) return
        try {
          const lead = await getMyLead()
          applyLead(lead)
          return
        } catch {
          // 404 (lead not seeded yet) or network — keep trying.
        }
      }

      // Read never succeeded. Seed the row ourselves and try one
      // more read. POST /api/leads is idempotent so this is safe
      // even if App.tsx's createLead landed at the same time.
      try {
        const user = await getUser()
        const name = (user?.user_metadata as { name?: string } | null)?.name
        await createLead(name ? { name } : {})
        const lead = await getMyLead()
        applyLead(lead)
      } catch {
        // Lead fetch never resolved — fall back to homeowner hub
        // rather than blocking the user behind a permanent loading state.
        if (!cancelled) setGate({ kind: 'ready', role: null })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Refetch after the wizard PUTs role/intent, then route the user
  // straight to the engine that matches who they told us they are —
  // rather than dropping them on the hub and making them hunt for the
  // right tile. The wizard IS the intake; its whole job is to figure
  // out where the user should go, so we honor that here.
  //
  //   first_time_buyer → /fthb-decision-map
  //   homeowner / pro  → /decision-map  (the flagship; mirrors the
  //                       hub's existing non-FTHB hero default)
  //
  // We navigate with replace:true so the back button doesn't bounce
  // the user back into the wizard they just finished. Their first
  // saved scenario (from the anonymous-run replay, if any) is waiting
  // on the destination page.
  async function handleWizardComplete() {
    let lead: Lead
    try {
      lead = await getMyLead()
    } catch {
      // PUT succeeded but the refetch failed — assume the values are
      // good and send them to the flagship engine rather than stranding
      // them on the wizard.
      navigate('/decision-map', { replace: true })
      return
    }

    if (lead.role === 'unknown' || lead.intent === 'unknown') {
      // Belt + suspenders: if for some reason the PUT didn't stick
      // (race with another tab clearing it, etc.) leave the wizard up
      // rather than dumping the user somewhere with no explanation.
      setGate({ kind: 'wizard', lead })
      return
    }

    navigate(
      lead.role === 'first_time_buyer' ? '/fthb-decision-map' : '/decision-map',
      { replace: true },
    )
  }

  if (gate.kind === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-background">
        <p className="text-sm text-stone-500">Loading…</p>
      </div>
    )
  }

  if (gate.kind === 'wizard') {
    // Pass the in-flight lead so the wizard can pre-fill its name input
    // from the signup-form value (and skip the round-trip of re-typing
    // for users who provided one). Role / intent / pipeline are still
    // unknown at this point — that's why we're showing the wizard.
    return (
      <OnboardingWizard
        lead={gate.lead}
        onComplete={handleWizardComplete}
      />
    )
  }

  // First-time buyers get the FTHB engine as their marquee tool; everyone
  // else (current homeowners, pros, fallback) lands on the homeowner
  // Decision Map. Secondary tools + Recent calculations stay common —
  // both audiences want the calculator + saved work.
  const isFTHB = gate.kind === 'ready' && gate.role === 'first_time_buyer'

  return (
    <div className="mx-auto max-w-6xl space-y-10 p-6 md:py-10">
      <Greeting email={userEmail} />
      {isFTHB ? <FTHBHeroTool /> : <HeroTool />}
      <SecondaryTools isFTHB={isFTHB} />
      <RecentCalculations />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Greeting — friendly header. Email shown subtly underneath so the user
// can confirm which account they're in without it dominating the surface.
// ---------------------------------------------------------------------------

function Greeting({ email }: { email: string | null }) {
  return (
    <header>
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
        Welcome back.
      </h1>
      <p className="mt-2 text-lg text-stone-600">
        What would you like to model today?
      </p>
      {email && (
        <p className="mt-1 text-xs text-stone-500">{email}</p>
      )}
    </header>
  )
}

// ---------------------------------------------------------------------------
// Hero tool card — Decision Map gets the marquee position. Full-bleed
// illustration on the left (lg) or top (sm), copy + CTA on the right.
// Mirrors the scenario-card layout from DecisionMap itself for visual
// continuity once you click through.
// ---------------------------------------------------------------------------

function HeroTool() {
  return (
    <Link
      to="/decision-map"
      className="group block overflow-hidden rounded-xl bg-card shadow-md ring-1 ring-border transition-shadow hover:shadow-xl"
      style={{ borderTopColor: SCENARIO_PALETTE.blue, borderTopWidth: 4 }}
    >
      <div className="flex flex-col md:flex-row">
        {/* Illustration */}
        <div
          className="aspect-[16/10] w-full overflow-hidden md:aspect-auto md:w-2/5"
          style={{ backgroundColor: `${SCENARIO_PALETTE.blue}10` }}
        >
          <img
            src="/illustrations/decision.png"
            alt=""
            aria-hidden="true"
            loading="eager"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </div>
        {/* Copy */}
        <div className="flex-1 p-6 md:p-10">
          <div className="flex items-center gap-2">
            <Compass
              className="h-5 w-5"
              style={{ color: SCENARIO_PALETTE.blue }}
            />
            <span
              className="text-sm font-semibold uppercase tracking-wide"
              style={{ color: SCENARIO_PALETTE.blue }}
            >
              Marquee tool
            </span>
          </div>
          <h2 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">
            Decision Map
          </h2>
          <p className="mt-3 max-w-xl text-stone-600">
            Model all five paths — stay, refinance, sell &amp; buy, rent, rent
            out &amp; buy — side by side. The fastest way to see whether the
            move you're considering actually pays off.
          </p>
          <div className="mt-6">
            <Button
              size="lg"
              className="shadow-lg transition-shadow group-hover:shadow-xl"
              style={{ backgroundColor: SCENARIO_PALETTE.blue }}
              tabIndex={-1}
            >
              Open Decision Map <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// FTHB hero — shown to leads with role='first_time_buyer'. Routes to the
// /fthb-decision-map page (separate engine from the homeowner Decision Map).
// Same card chrome + dusty-blue accent so the hub feels consistent across
// audiences; the copy + CTA make it clear this is the buy-your-first-home
// view, not the what-do-I-do-with-my-current-home view.
// ---------------------------------------------------------------------------

function FTHBHeroTool() {
  return (
    <Link
      to="/fthb-decision-map"
      className="group block overflow-hidden rounded-xl bg-card shadow-md ring-1 ring-border transition-shadow hover:shadow-xl"
      style={{ borderTopColor: SCENARIO_PALETTE.blue, borderTopWidth: 4 }}
    >
      <div className="flex flex-col md:flex-row">
        <div
          className="aspect-[16/10] w-full overflow-hidden md:aspect-auto md:w-2/5"
          style={{ backgroundColor: `${SCENARIO_PALETTE.blue}10` }}
        >
          <img
            src="/illustrations/decision.png"
            alt=""
            aria-hidden="true"
            loading="eager"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </div>
        <div className="flex-1 p-6 md:p-10">
          <div className="flex items-center gap-2">
            <Compass
              className="h-5 w-5"
              style={{ color: SCENARIO_PALETTE.blue }}
            />
            <span
              className="text-sm font-semibold uppercase tracking-wide"
              style={{ color: SCENARIO_PALETTE.blue }}
            >
              First-time homebuyer · Decision Map
            </span>
          </div>
          <h2 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">
            Five paths to your first home
          </h2>
          <p className="mt-3 max-w-xl text-stone-600">
            Continue renting, buy a starter, buy your "reach" home, buy with
            downpayment assistance, or wait. Same horizon, same cash, with
            monthly housing cost and future savings capacity baked in.
          </p>
          <div className="mt-6">
            <Button
              size="lg"
              className="shadow-lg transition-shadow group-hover:shadow-xl"
              style={{ backgroundColor: SCENARIO_PALETTE.blue }}
              tabIndex={-1}
            >
              Open FTHB Decision Map <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Secondary tool cards — Mortgage Calculator and Scenario Comparison.
// Icon-led rather than illustrated, so they read as utilities sitting
// alongside the marquee tool rather than competing with it.
// ---------------------------------------------------------------------------

interface SecondaryCardProps {
  to: string
  icon: typeof Calculator
  color: string
  eyebrow: string
  title: string
  blurb: string
}

function SecondaryCard({
  to,
  icon: Icon,
  color,
  eyebrow,
  title,
  blurb,
}: SecondaryCardProps) {
  return (
    <Link
      to={to}
      className="group block rounded-xl bg-card p-6 shadow-md ring-1 ring-border transition-shadow hover:shadow-lg"
      style={{ borderTopColor: color, borderTopWidth: 4 }}
    >
      <div
        className="inline-flex rounded-lg p-2.5"
        style={{ backgroundColor: `${color}1a` }}
      >
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <p
        className="mt-4 text-xs font-semibold uppercase tracking-wide"
        style={{ color }}
      >
        {eyebrow}
      </p>
      <h3 className="mt-1 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm text-stone-600">{blurb}</p>
      <p
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium transition-transform group-hover:translate-x-0.5"
        style={{ color }}
      >
        Open <ArrowRight className="h-4 w-4" />
      </p>
    </Link>
  )
}

// Secondary tools are the same two surfaces for both audiences — the
// Mortgage Calculator and Compare Scenarios are both pure financing
// tools, useful whether you already own or are buying your first home.
// Only the copy is forked: buyers get a "home you're considering"
// framing, owners get the neutral framing.
//
// The Portfolio Builder tile is gated by VITE_PORTFOLIO_ENABLED — when
// off (the default) the grid drops to 2 columns and behaves as before.
// Same flag drives the sidebar nav item + the route registration in
// App.tsx, so the entire surface is either fully visible or fully
// invisible.
const PORTFOLIO_ENABLED = import.meta.env.VITE_PORTFOLIO_ENABLED === 'true'

function SecondaryTools({ isFTHB }: { isFTHB: boolean }) {
  return (
    <div className={cn(
      'grid gap-6',
      PORTFOLIO_ENABLED ? 'md:grid-cols-3' : 'md:grid-cols-2',
    )}>
      <SecondaryCard
        to="/mortgage-calculator"
        icon={Calculator}
        color={SCENARIO_PALETTE.violet}
        eyebrow="Quick math"
        title="Mortgage Calculator"
        blurb={
          isFTHB
            ? 'Estimate the monthly payment, total cost, and amortization on a home you’re considering. Live rates from the Fed.'
            : 'Single-scenario monthly payment, total cost, and amortization. Live rates from the Fed.'
        }
      />
      <SecondaryCard
        to="/scenarios"
        icon={GitCompare}
        color={SCENARIO_PALETTE.emerald}
        eyebrow="Side-by-side"
        title="Compare Scenarios"
        blurb={
          isFTHB
            ? 'Stack up to three financing options — different down payments, terms, or rates — side by side before you commit.'
            : 'Stack up to three financing scenarios — different down payments, terms, or rates — and pick the winner.'
        }
      />
      {PORTFOLIO_ENABLED && (
        <SecondaryCard
          to="/portfolio-builder"
          icon={Building2}
          color={SCENARIO_PALETTE.teal}
          eyebrow="New — first stab"
          title="Portfolio Builder"
          blurb="Compare strategies for acquiring your next property — Cash, HELOC, DSCR, No-Ratio, Combination, and more — given your existing portfolio."
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recent calculations panel — "your saved work" surface.
//
// Renders saved Mortgage Calculator analyses AND saved FTHB Decision Map
// analyses, merged into one most-recent-first list. Each card deep-links
// back to its tool with ?analysis=<id> so the user resumes exactly where
// they left off (handled in MortgageCalculator.tsx / FTHBDecisionMap.tsx).
//
// The two list endpoints are fetched in parallel with allSettled — if one
// fails (or the user has saves in only one tool) the other still renders.
// Compare Scenarios saves are still deferred (no persistence yet).
// ---------------------------------------------------------------------------

/** Discriminated union so one list can hold both kinds of saved work. */
type RecentItem =
  | { kind: 'mortgage'; a: SavedAnalysisSummary }
  | { kind: 'fthb'; a: SavedFthbAnalysisSummary }

function RecentCalculations() {
  const [items, setItems] = useState<RecentItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // 401 = not signed in → treat as "no saves" rather than an error.
    const isAuthError = (e: unknown) =>
      e instanceof Error && e.message.includes('401')

    Promise.allSettled([listAnalyses(), listFthbAnalyses()]).then(
      ([mortgageRes, fthbRes]) => {
        const merged: RecentItem[] = []

        if (mortgageRes.status === 'fulfilled') {
          for (const a of mortgageRes.value) merged.push({ kind: 'mortgage', a })
        }
        if (fthbRes.status === 'fulfilled') {
          for (const a of fthbRes.value) merged.push({ kind: 'fthb', a })
        }

        // Surface an error only if BOTH failed for a non-auth reason —
        // a partial failure still has something useful to show.
        const bothFailed =
          mortgageRes.status === 'rejected' && fthbRes.status === 'rejected'
        if (bothFailed) {
          const reason = mortgageRes.reason
          if (!isAuthError(reason)) {
            setError(
              reason instanceof Error ? reason.message : 'Could not load saved work',
            )
            return
          }
        }

        // Newest-first, capped at 6 — a quick-resume panel, not history.
        merged.sort(
          (x, y) => +new Date(y.a.created_at) - +new Date(x.a.created_at),
        )
        setItems(merged.slice(0, 6))
      },
    )
  }, [])

  return (
    <section>
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Recent calculations</h2>
          <p className="mt-1 text-sm text-stone-600">
            Pick up where you left off. Saved analyses from the Mortgage
            Calculator and the FTHB Decision Map.
          </p>
        </div>
      </div>

      <div className="mt-5">
        {items === null && !error && (
          <p className="py-8 text-center text-sm text-stone-500">Loading…</p>
        )}

        {error && (
          <p className="py-8 text-center text-sm" style={{ color: '#b85844' }}>
            {error}
          </p>
        )}

        {items !== null && items.length === 0 && !error && (
          <RecentEmptyState />
        )}

        {items !== null && items.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) =>
              item.kind === 'mortgage' ? (
                <SavedAnalysisCard key={`m-${item.a.id}`} a={item.a} />
              ) : (
                <SavedFthbCard key={`f-${item.a.id}`} a={item.a} />
              ),
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function RecentEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
      <p className="text-sm font-medium">Nothing saved yet.</p>
      <p className="mt-1 text-sm text-stone-600">
        Run a calculation in the Mortgage Calculator and hit{' '}
        <span className="font-medium">Save</span> to see it here.
      </p>
      <Button
        asChild
        variant="outline"
        size="sm"
        className="mt-4"
      >
        <Link to="/mortgage-calculator">
          Open Mortgage Calculator <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  )
}

function SavedAnalysisCard({ a }: { a: SavedAnalysisSummary }) {
  // Compact "saved N ago" — same pattern as the old listings dashboard.
  const ago = (() => {
    const days = Math.floor((Date.now() - +new Date(a.created_at)) / 86_400_000)
    if (days === 0) return 'today'
    if (days === 1) return 'yesterday'
    if (days < 7) return `${days}d ago`
    return new Date(a.created_at).toLocaleDateString()
  })()

  // Plain-English inputs summary. Fall back to label if we don't have
  // enough structured fields (older saves predating this column set).
  const inputsLine =
    a.purchase_price != null && a.term_years != null && a.annual_rate_percent != null
      ? `${formatCurrency(a.purchase_price)} · ${a.term_years}yr @ ${a.annual_rate_percent}%`
      : a.label ?? 'Mortgage analysis'

  return (
    <Link
      to={`/mortgage-calculator?analysis=${encodeURIComponent(a.id)}`}
      className="group block rounded-lg bg-card p-4 shadow-sm ring-1 ring-border transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-2">
        <Calculator
          className="h-4 w-4"
          style={{ color: SCENARIO_PALETTE.violet }}
        />
        <span
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: SCENARIO_PALETTE.violet }}
        >
          Mortgage
        </span>
      </div>
      {a.monthly_total != null && (
        <p className="mt-2 text-xl font-bold tabular-nums">
          {formatCurrency(a.monthly_total)}
          <span className="ml-1 text-sm font-normal text-stone-500">/mo</span>
        </p>
      )}
      <p className="mt-1 text-sm text-stone-600">{inputsLine}</p>
      <p className="mt-3 flex items-center gap-1 text-xs text-stone-500">
        <Clock className="h-3 w-3" /> Saved {ago}
      </p>
    </Link>
  )
}

/** Compact "saved N ago" — shared by both saved-work card types. */
function savedAgo(createdAt: string): string {
  const days = Math.floor((Date.now() - +new Date(createdAt)) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(createdAt).toLocaleDateString()
}

function SavedFthbCard({ a }: { a: SavedFthbAnalysisSummary }) {
  // Headline = the engine's recommendation. Falls back to the label,
  // then a generic title for older saves missing the denormalized field.
  const headline =
    a.best_executable_path ?? a.label ?? 'FTHB analysis'

  // Inputs summary — starter/preferred prices + horizon. Mirrors the
  // mortgage card's plain-English second line.
  const inputsLine =
    a.starter_home_price != null && a.preferred_home_price != null
      ? `${formatCurrency(a.starter_home_price)} / ${formatCurrency(a.preferred_home_price)}${a.horizon_years != null ? ` · ${a.horizon_years}yr` : ''}`
      : a.label ?? 'First-time homebuyer'

  return (
    <Link
      to={`/fthb-decision-map?analysis=${encodeURIComponent(a.id)}`}
      className="group block rounded-lg bg-card p-4 shadow-sm ring-1 ring-border transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-2">
        <Compass
          className="h-4 w-4"
          style={{ color: SCENARIO_PALETTE.blue }}
        />
        <span
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: SCENARIO_PALETTE.blue }}
        >
          FTHB
        </span>
      </div>
      {a.best_net_position != null && (
        <p className="mt-2 text-xl font-bold tabular-nums">
          {formatCurrency(a.best_net_position)}
          <span className="ml-1 text-sm font-normal text-stone-500">
            net position
          </span>
        </p>
      )}
      <p className="mt-1 text-sm font-medium text-stone-700">{headline}</p>
      <p className="mt-0.5 text-sm text-stone-600">{inputsLine}</p>
      <p className="mt-3 flex items-center gap-1 text-xs text-stone-500">
        <Clock className="h-3 w-3" /> Saved {savedAgo(a.created_at)}
      </p>
    </Link>
  )
}
