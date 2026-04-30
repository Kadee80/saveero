/**
 * Landing — public marketing surface for Saveero.
 *
 * Shown at `/` when no Supabase session is active. Pitches the product
 * to two audiences:
 *   1. Homeowners (primary) — the people who'll actually use the
 *      decision tools. Hero + the five-paths section + how-it-works
 *      are aimed at them.
 *   2. Partners — financial planners, real-estate agents, mortgage
 *      brokers who'd buy warm leads. Their section sits below the
 *      main pitch as a "if you work with homeowners on big moves..."
 *      sidebar story.
 *
 * Visual language matches the in-app illustrations:
 *   - warm cream backgrounds (matches --background)
 *   - dusty sky blue primary (SCENARIO_PALETTE.blue)
 *   - sage / terracotta / mustard accents for section variety
 *   - generous whitespace, conversational copy, no jargon
 *
 * Reuses the existing PNG illustrations from /public/illustrations/
 * so the landing page feels visually continuous with the app behind
 * the auth wall.
 *
 * @module pages/Landing
 */
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Compass,
  ArrowRight,
  Home,
  Banknote,
  Building2,
  PiggyBank,
  KeyRound,
  Sparkles,
  Users,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SCENARIO_PALETTE } from '@/lib/chartPalette'
import {
  useFadeInOnMount,
  useFadeInOnScroll,
  useStaggerInOnScroll,
} from '@/hooks/useGsapFadeIn'

// ---------------------------------------------------------------------------
// Scenario card metadata — same five scenarios the product compares,
// each paired with the illustration we generated for the in-app card.
// ---------------------------------------------------------------------------

interface ScenarioCard {
  /** Filename in /illustrations/<scene>.png */
  scene: 'stay' | 'refinance' | 'sell_buy' | 'rent' | 'rent_out_buy'
  label: string
  blurb: string
  color: string
  icon: LucideIcon
}

const SCENARIOS: ScenarioCard[] = [
  {
    scene: 'stay',
    label: 'Stay put',
    blurb: 'Keep the home you have. See what your wealth looks like five years from now if nothing changes.',
    color: SCENARIO_PALETTE.blue,
    icon: Home,
  },
  {
    scene: 'refinance',
    label: 'Refinance',
    blurb: 'Same house, lower rate. We model whether the closing costs pay back inside your hold period.',
    color: SCENARIO_PALETTE.violet,
    icon: Banknote,
  },
  {
    scene: 'sell_buy',
    label: 'Sell & buy',
    blurb: 'Move into the next chapter. Compare the new mortgage to staying — including what you net at sale.',
    color: SCENARIO_PALETTE.emerald,
    icon: Building2,
  },
  {
    scene: 'rent',
    label: 'Rent it out',
    blurb: 'Turn your home into income property. We project cash flow, vacancy, and after-tax return.',
    color: SCENARIO_PALETTE.amber,
    icon: PiggyBank,
  },
  {
    scene: 'rent_out_buy',
    label: 'Rent out & buy',
    blurb: 'Two homes, two mortgages. The most upside, the most risk — see if the math actually works.',
    color: SCENARIO_PALETTE.rose,
    icon: KeyRound,
  },
]

// ---------------------------------------------------------------------------
// Top nav — minimal: brand + sign-in. Sign-up is the hero CTA, not the
// nav, so the page reads as "marketing surface" not "auth wall."
// ---------------------------------------------------------------------------

function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
          <Compass
            className="h-5 w-5"
            style={{ color: SCENARIO_PALETTE.blue }}
          />
          <span className="text-lg">Saveero</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="text-sm font-medium text-stone-600 hover:text-foreground"
          >
            Sign in
          </Link>
          <Button asChild size="sm" style={{ backgroundColor: SCENARIO_PALETTE.blue }}>
            <Link to="/login?mode=signup">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Hero — main pitch + primary CTA + a hero illustration on desktop.
// Illustration is the "stay" cottage, which carries the warmest
// settled-home feeling in the set.
// ---------------------------------------------------------------------------

function Hero() {
  // Fade the hero copy/illustration in on mount — it's already in view,
  // so a scroll trigger would never fire.
  const ref = useRef<HTMLDivElement>(null)
  useFadeInOnMount(ref)

  return (
    <section className="relative overflow-hidden">
      <div
        ref={ref}
        className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-2 md:items-center md:py-28"
      >
        <div>
          <div
            className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
            style={{
              backgroundColor: `${SCENARIO_PALETTE.amber}1f`,
              color: '#8a6a1f',
            }}
          >
            <Sparkles className="h-3 w-3" />
            For your biggest financial decision
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
            Make your next home move with{' '}
            <span style={{ color: SCENARIO_PALETTE.blue }}>confidence.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-stone-600 md:text-xl">
            Stay, refinance, sell, rent, or rent it out — Saveero models all five
            paths side by side so you can see the real numbers before you
            decide.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              asChild
              size="lg"
              className="text-base"
              style={{ backgroundColor: SCENARIO_PALETTE.blue }}
            >
              <Link to="/login?mode=signup">
                Try it free <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="text-base">
              <Link to="/login">I already have an account</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-stone-500">
            No credit card. Free to try while we're in beta.
          </p>
        </div>

        {/* Hero illustration — full PNG, no crop. */}
        <div className="relative">
          <div
            className="aspect-square w-full overflow-hidden rounded-2xl shadow-sm ring-1 ring-border"
            style={{ backgroundColor: `${SCENARIO_PALETTE.blue}10` }}
          >
            <img
              src="/illustrations/stay.png"
              alt="A cottage home illustration"
              className="h-full w-full object-cover"
              loading="eager"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Five scenarios section — the heart of the product. Shows each path
// with its illustration so the visitor immediately sees the *kind* of
// decision Saveero helps with.
// ---------------------------------------------------------------------------

function FiveScenarios() {
  // Header fades up as the section enters viewport. Cards stagger in
  // separately so the eye lands on the heading first, then the grid.
  const headerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  useFadeInOnScroll(headerRef)
  useStaggerInOnScroll(gridRef, '[data-fade]')

  return (
    <section className="border-y border-border/60 bg-secondary/40 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div ref={headerRef} className="mx-auto max-w-2xl text-center">
          <p
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: SCENARIO_PALETTE.emerald }}
          >
            The five paths
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
            Every door in front of you, modeled the same way.
          </h2>
          <p className="mt-4 text-lg text-stone-600">
            Most calculators answer one question. Saveero answers all five at
            once — so you can compare them on the same axis instead of guessing
            which scenario you should even be running.
          </p>
        </div>

        <div
          ref={gridRef}
          className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {SCENARIOS.map((s) => {
            const Icon = s.icon
            return (
              <div
                key={s.scene}
                data-fade
                className="group overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border transition-shadow hover:shadow-md"
              >
                <div
                  className="aspect-[16/10] overflow-hidden"
                  style={{ backgroundColor: `${s.color}10` }}
                >
                  <img
                    src={`/illustrations/${s.scene}.png`}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2">
                    <Icon
                      className="h-4 w-4"
                      style={{ color: s.color }}
                    />
                    <h3 className="font-semibold tracking-tight">{s.label}</h3>
                  </div>
                  <p className="mt-2 text-sm text-stone-600">{s.blurb}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// How it works — 3 steps. Keeps the explanation honest: input, model,
// decide. No "AI magic" hand-waving.
// ---------------------------------------------------------------------------

function HowItWorks() {
  const steps = [
    {
      n: '01',
      label: 'Tell us your situation',
      body:
        'Your home value, your current mortgage, the rates you can get today, and where you think you might be heading.',
      color: SCENARIO_PALETTE.blue,
    },
    {
      n: '02',
      label: 'See all five paths at once',
      body:
        'We build the same five-year wealth picture for staying, refinancing, selling & buying, renting, and renting & buying.',
      color: SCENARIO_PALETTE.emerald,
    },
    {
      n: '03',
      label: 'Decide with the numbers',
      body:
        'Side-by-side equity, cash flow, and total cost — so the call is yours, but it isn\'t a guess.',
      color: SCENARIO_PALETTE.rose,
    },
  ]
  const headerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  useFadeInOnScroll(headerRef)
  useStaggerInOnScroll(gridRef, '[data-fade]')

  return (
    <section className="py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div ref={headerRef} className="mx-auto max-w-2xl text-center">
          <p
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: SCENARIO_PALETTE.violet }}
          >
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
            Three steps from "should I move?" to "here's why."
          </h2>
        </div>
        <div ref={gridRef} className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              data-fade
              className="rounded-xl border border-border bg-card p-6"
            >
              <div
                className="text-sm font-bold tabular-nums"
                style={{ color: s.color }}
              >
                {s.n}
              </div>
              <h3 className="mt-2 text-lg font-semibold tracking-tight">
                {s.label}
              </h3>
              <p className="mt-2 text-sm text-stone-600">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// For partners section — B2B pitch for planners/agents/brokers.
// Sage-tinted background to mark the audience switch without shouting.
// ---------------------------------------------------------------------------

function ForPartners() {
  const ref = useRef<HTMLDivElement>(null)
  useFadeInOnScroll(ref)

  return (
    <section
      className="border-y border-border/60 py-20 md:py-24"
      style={{ backgroundColor: `${SCENARIO_PALETTE.emerald}0d` }}
    >
      <div className="mx-auto max-w-6xl px-6">
        <div ref={ref} className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <p
              className="text-sm font-semibold uppercase tracking-wide"
              style={{ color: SCENARIO_PALETTE.emerald }}
            >
              For partners
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
              Working with homeowners on big moves?
            </h2>
            <p className="mt-4 text-lg text-stone-600">
              Financial planners, real-estate agents, and mortgage brokers — when
              someone runs the numbers on Saveero, they're already past the
              "should I do something?" stage. They know what they're considering.
              They just need the right person to help them act on it.
            </p>
            <ul className="mt-6 space-y-3 text-stone-700">
              <li className="flex gap-3">
                <Users
                  className="mt-0.5 h-5 w-5 shrink-0"
                  style={{ color: SCENARIO_PALETTE.emerald }}
                />
                <span>
                  <b>Warm, qualified homeowners</b> — they came in to model a
                  decision, not to fill out a lead form.
                </span>
              </li>
              <li className="flex gap-3">
                <TrendingUp
                  className="mt-0.5 h-5 w-5 shrink-0"
                  style={{ color: SCENARIO_PALETTE.emerald }}
                />
                <span>
                  <b>Routed to your specialty</b> — the model already knows
                  whether they're refinancing, buying, or going dual-property.
                </span>
              </li>
              <li className="flex gap-3">
                <Sparkles
                  className="mt-0.5 h-5 w-5 shrink-0"
                  style={{ color: SCENARIO_PALETTE.emerald }}
                />
                <span>
                  <b>Context, not just contact</b> — you see the full scenario
                  they ran before you reach out.
                </span>
              </li>
            </ul>
            <div className="mt-8">
              <Button
                asChild
                size="lg"
                style={{ backgroundColor: SCENARIO_PALETTE.emerald }}
              >
                <Link to="/login?mode=signup">
                  Become a partner <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
          <div className="relative">
            <div
              className="aspect-square w-full overflow-hidden rounded-2xl shadow-sm ring-1 ring-border"
              style={{ backgroundColor: `${SCENARIO_PALETTE.emerald}14` }}
            >
              <img
                src="/illustrations/sell_buy.png"
                alt="A couple moving into a new home illustration"
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Closing CTA — last big swing, terracotta accent so it stands apart
// from the dusty-blue primary used throughout the page.
// ---------------------------------------------------------------------------

function ClosingCta() {
  const ref = useRef<HTMLDivElement>(null)
  useFadeInOnScroll(ref)

  return (
    <section className="py-20 md:py-28">
      <div ref={ref} className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          Ready to map your next move?
        </h2>
        <p className="mt-4 text-lg text-stone-600">
          It takes about three minutes to enter your situation. The clarity
          lasts a lot longer.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            asChild
            size="lg"
            className="text-base"
            style={{ backgroundColor: SCENARIO_PALETTE.rose }}
          >
            <Link to="/login?mode=signup">
              Start free <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg" className="text-base">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Footer — minimal. Saves the more-formal copyright/legal links for
// when there's actually something to link to.
// ---------------------------------------------------------------------------

function FooterBar() {
  return (
    <footer className="border-t border-border/60 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-sm text-stone-500 sm:flex-row">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4" style={{ color: SCENARIO_PALETTE.blue }} />
          <span className="font-semibold">Saveero</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/login" className="hover:text-foreground">Sign in</Link>
          <Link to="/login?mode=signup" className="hover:text-foreground">
            Sign up
          </Link>
        </div>
      </div>
    </footer>
  )
}

// ---------------------------------------------------------------------------
// Page entry
// ---------------------------------------------------------------------------

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <Hero />
      <FiveScenarios />
      <HowItWorks />
      <ForPartners />
      <ClosingCta />
      <FooterBar />
    </div>
  )
}
