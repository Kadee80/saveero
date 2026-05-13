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
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Calculator,
  Clock,
  Compass,
  GitCompare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getUser } from '@/api/auth'
import { createLead, getMyLead, type Lead } from '@/api/leadsApi'
import { listAnalyses, type SavedAnalysisSummary } from '@/api/mortgageApi'
import { formatCurrency } from '@/lib/utils'
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
 */
type LeadGate =
  | { kind: 'loading' }
  | { kind: 'wizard'; lead: Lead }
  | { kind: 'ready' }

export default function Dashboard() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [gate, setGate] = useState<LeadGate>({ kind: 'loading' })

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
        setGate({ kind: 'ready' })
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
        if (!cancelled) setGate({ kind: 'ready' })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Refetch after the wizard PUTs role/intent — once we see real
  // values the gate flips to 'ready' and the hub renders.
  async function handleWizardComplete() {
    try {
      const lead = await getMyLead()
      if (lead.role === 'unknown' || lead.intent === 'unknown') {
        // Belt + suspenders: if for some reason the PUT didn't stick
        // (race with another tab clearing it, etc.) leave the wizard
        // up rather than dumping the user back into it with no
        // explanation.
        setGate({ kind: 'wizard', lead })
      } else {
        setGate({ kind: 'ready' })
      }
    } catch {
      // PUT succeeded but the refetch failed — assume the values are
      // good and let the user into the hub.
      setGate({ kind: 'ready' })
    }
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

  return (
    <div className="mx-auto max-w-6xl space-y-10 p-6 md:py-10">
      <Greeting email={userEmail} />
      <HeroTool />
      <SecondaryTools />
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

function SecondaryTools() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <SecondaryCard
        to="/mortgage-calculator"
        icon={Calculator}
        color={SCENARIO_PALETTE.violet}
        eyebrow="Quick math"
        title="Mortgage Calculator"
        blurb="Single-scenario monthly payment, total cost, and amortization. Live rates from the Fed."
      />
      <SecondaryCard
        to="/scenarios"
        icon={GitCompare}
        color={SCENARIO_PALETTE.emerald}
        eyebrow="Side-by-side"
        title="Compare Scenarios"
        blurb="Stack up to three financing scenarios — different down payments, terms, or rates — and pick the winner."
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recent calculations panel — proof-of-concept "your saved work" surface.
//
// Phase 1 (this commit): renders saved Mortgage Calculator analyses only,
// using the existing /api/mortgage/analyses list endpoint. No new backend.
// Phase 2 (deferred): extend to Compare Scenarios and Decision Map saves
// once those tools have persistence wired up.
//
// Each card click re-opens the calculator with that analysis's inputs
// prefilled via the ?analysis=<id> query param (handled in
// MortgageCalculator.tsx).
// ---------------------------------------------------------------------------

function RecentCalculations() {
  const [items, setItems] = useState<SavedAnalysisSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listAnalyses()
      .then((rows) =>
        // Server already returns most-recent-first, but be defensive in case
        // it doesn't. Cap to 5 — a quick-resume panel, not a history page.
        setItems(
          [...rows]
            .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
            .slice(0, 5),
        ),
      )
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Could not load saved work'
        // 401 = not signed in (shouldn't happen here, but be safe) — show
        // empty state instead of an error banner.
        if (msg.includes('401')) {
          setItems([])
          return
        }
        setError(msg)
      })
  }, [])

  return (
    <section>
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Recent calculations</h2>
          <p className="mt-1 text-sm text-stone-600">
            Pick up where you left off. Saved analyses from the Mortgage Calculator.
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
            {items.map((a) => (
              <SavedAnalysisCard key={a.id} a={a} />
            ))}
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
