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
  Compass,
  GitCompare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getUser } from '@/api/auth'
import { SCENARIO_PALETTE } from '@/lib/chartPalette'

export default function Dashboard() {
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    getUser().then((u) => setUserEmail(u?.email ?? null))
  }, [])

  return (
    <div className="mx-auto max-w-6xl space-y-10 p-6 md:py-10">
      <Greeting email={userEmail} />
      <HeroTool />
      <SecondaryTools />
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
            src="/illustrations/stay.png"
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
