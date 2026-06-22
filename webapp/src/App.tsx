import React, { Suspense, lazy, useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Home as HomeIcon, House, Calculator, GitCompare, Compass, Inbox, ChevronLeft, ChevronRight, LogOut, Lock } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { cn } from '@/lib/utils'
import { supabase, signOut } from '@/api/auth'
import { createLead, getMyProfile, updateMyLead, type LeadIntent, type LeadRole } from '@/api/leadsApi'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import {
  readAnonStash,
  clearAnonStash,
  readAnonOnboarding,
  clearAnonOnboarding,
} from '@/api/anonStash'
import { saveFthbAnalysis } from '@/api/fthbApi'
import { analytics } from '@/analytics/mixpanel'
import Dashboard from './pages/Dashboard'
import ListProperty from './pages/ListProperty'
import MortgageCalculator from './pages/MortgageCalculator'
import ScenarioComparison from './pages/ScenarioComparison'
import DecisionMap from './pages/DecisionMap'
import Login from './pages/Login'

// Lazy-load Landing so gsap + ScrollTrigger + SplitText (~50kb gzipped)
// stay out of the authed app bundle. Landing is only ever rendered when
// session === null, so signed-in users never need this code.
const Landing = lazy(() => import('./pages/Landing'))

// Lazy-load AdminCRM the same way — admin-only surface, no point bloating
// the main bundle for the 99% of users who never see it.
const AdminCRM = lazy(() => import('./pages/AdminCRM'))

// Lazy-load the FTHB decision map — only first-time-buyer leads land here
// by default (the Dashboard's HeroTool routes them in based on lead.role).
// Other audiences can still hit the URL directly via the sidebar nav.
const FTHBDecisionMap = lazy(() => import('./pages/FTHBDecisionMap'))

// Lazy-load StartIntake — the anonymous-friendly /start page that wraps
// OnboardingWizard. Pre-auth surface only; signed-in users get bounced
// to the Dashboard's inline wizard instead.
const StartIntake = lazy(() => import('./pages/StartIntake'))

// Lazy-load PortfolioBuilder — the third Home Planner branch (investor
// path). First-stab v1 ships with the engine wired through and a
// seeded sample render; full intake wizard follows.
const PortfolioBuilder = lazy(() => import('./pages/PortfolioBuilder'))

type NavItem =
  | { divider: true }
  | { to: string; label: string; icon: typeof HomeIcon }

// Sidebar nav, grouped: mortgage tools first (the product focus), then a
// divider, then the property-listing creator (kept reachable but clearly
// secondary). The empty `divider: true` entry renders a thin border-t row
// instead of a link.
//
// CRM ("/admin/crm") is injected dynamically at the end of the first
// group only for admin users — see buildNavItems below.
function buildNavItems(isAdmin: boolean): NavItem[] {
  const primary: NavItem[] = [
    { to: '/',                    label: 'Home',         icon: HomeIcon    },
    { to: '/decision-map',        label: 'Decision Map', icon: Compass     },
    // FTHB engine — visible to everyone; first-time buyers also get it
    // as their default Dashboard hero, but the link is unconditional so
    // anyone curious can drill in. Same pattern as Decision Map.
    { to: '/fthb-decision-map',   label: 'FTHB',         icon: Compass     },
    { to: '/mortgage-calculator', label: 'Mortgage',     icon: Calculator  },
    { to: '/scenarios',           label: 'Compare',      icon: GitCompare  },
  ]
  if (isAdmin) {
    primary.push({ to: '/admin/crm', label: 'CRM', icon: Inbox })
  }
  return [
    ...primary,
    { divider: true },
    { to: '/list-property', label: 'List Property', icon: House },
  ]
}

export default function App() {
  const [session, setSession]   = useState<Session | null | undefined>(undefined) // undefined = loading
  const [collapsed, setCollapsed] = useState(false)
  // Admin detection — non-blocking. Probe GET /api/leads (admin-only) once
  // per signed-in session; if it succeeds the user is admin and we expose
  // the CRM nav link. Failure (403, network) leaves isAdmin false. The
  // app never waits on this probe — the link just appears late.
  const [isAdmin, setIsAdmin] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    // Hydrate from existing session. If one's already present (returning
    // visitor with a live session), tie analytics to them so events on
    // this load aren't anonymous. No 'Signed In' event here — this is a
    // page load, not a fresh authentication.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      const u = data.session?.user
      if (u) {
        const meta = u.user_metadata as { name?: string } | null
        analytics.identify(u.id, { email: u.email, name: meta?.name })
      }
    })

    // Keep in sync with Supabase auth events (login, logout, token refresh).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (event === 'SIGNED_IN' && session?.user) {
        const meta = session.user.user_metadata as { name?: string } | null
        analytics.identify(session.user.id, {
          email: session.user.email,
          name: meta?.name,
        })
        analytics.track(analytics.EVENTS.SIGNED_IN, { method: 'email' })
      } else if (event === 'SIGNED_OUT') {
        // New identity for whoever's next on this device.
        analytics.reset()
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // CRM lead seeding — fires once per session whenever we cross from
  // signed-out to signed-in. The signup form stashes `name` on the auth
  // user's metadata; we read it back here on the first authenticated
  // session and create the corresponding `leads` row. POST /api/leads is
  // idempotent, so re-firing on subsequent sessions is safe (it just
  // returns the existing row). Failure is logged but doesn't block the
  // app — the CRM seed is a nice-to-have, not a gate.
  useEffect(() => {
    if (!session) return
    const name =
      (session.user.user_metadata as { name?: string } | null)?.name
    createLead(name ? { name } : {}).catch((err) => {
      console.warn('[lead] seed failed:', err)
    })
  }, [session?.user.id])

  // Anonymous-stash replay — if the user just signed up after running the
  // calculator anonymously, persist that calculation as their first
  // saved scenario. Mirrors the lead-seed effect: fires once per session
  // crossover, swallows errors, runs only after the lead row has been
  // upserted so the FK on fthb_analyses.user_id always resolves.
  //
  // Only FTHB has a save endpoint today; homeowner DecisionMap doesn't
  // persist analyses server-side. If we later add /api/scenarios/analyses
  // this is where the 'homeowner_decision' branch slots in.
  useEffect(() => {
    if (!session) return
    const stash = readAnonStash()
    if (!stash) return
    if (stash.kind !== 'fthb_decision') {
      // Nothing to replay server-side; just drop it so it doesn't linger.
      clearAnonStash()
      return
    }
    // Slight delay so createLead's POST (above) has time to land — the
    // backend's _ensure_user_row in /api/fthb/analyses handles the race
    // either way, but ordering reduces a noisy duplicate-row warning.
    const t = window.setTimeout(() => {
      saveFthbAnalysis({
        label: 'My first scenario',
        // Cast: stash payload is opaque Record<string, unknown> by design.
        // The save endpoint treats inputs/result as JSON blobs.
        inputs: stash.inputs as unknown as Parameters<typeof saveFthbAnalysis>[0]['inputs'],
        result: stash.result as unknown as Parameters<typeof saveFthbAnalysis>[0]['result'],
      })
        .then(() => clearAnonStash())
        .catch((err) => {
          console.warn('[anon-replay] failed:', err)
          // Leave the stash in place — user can retry from the Recent
          // panel if they want, and a transient 401 on the first call
          // (token not yet attached) shouldn't lose their work.
        })
    }, 250)
    return () => window.clearTimeout(t)
  }, [session?.user.id])

  // Anonymous onboarding replay — if the user went through /start before
  // signing up, the wizard stashed their persona/intent answers to
  // localStorage instead of PUT-ing them. Now that we have a session,
  // PUT them into the lead row so the Dashboard sees an enriched lead
  // and skips its own onboarding gate (no double-wizard).
  //
  // Same pattern as the run-stash above:
  //   - small delay so createLead's seed POST lands first
  //   - clear on success, leave in place on failure so a transient
  //     auth blip doesn't lose what they typed
  useEffect(() => {
    if (!session) return
    const intake = readAnonOnboarding()
    if (!intake) return
    const t = window.setTimeout(() => {
      const body: {
        name?: string
        role?: LeadRole
        intent?: LeadIntent
        pipeline?: string
        pro_type?: string
      } = {}
      if (intake.name) body.name = intake.name
      if (intake.role) body.role = intake.role as LeadRole
      if (intake.intent) body.intent = intake.intent as LeadIntent
      if (intake.pipeline) body.pipeline = intake.pipeline
      if (intake.pro_type) body.pro_type = intake.pro_type
      updateMyLead(body)
        .then(() => clearAnonOnboarding())
        .catch((err) => {
          console.warn('[anon-onboarding-replay] failed:', err)
        })
    }, 300)
    return () => window.clearTimeout(t)
  }, [session?.user.id])

  // Admin probe — runs once per signed-in session. Cheap GET against
  // the user's own row (was listAllLeads, which on a cold Render dyno
  // could be a 100KB+ payload that blocked the user's parallel /leads/me
  // read and left admin dashboards stuck on Loading…). Errors are
  // swallowed so a flaky network never hides the CRM link in a way that
  // requires a hard reload to recover from.
  useEffect(() => {
    if (!session) {
      setIsAdmin(false)
      return
    }
    let cancelled = false
    getMyProfile()
      .then((p) => {
        if (cancelled) return
        setIsAdmin(p.is_admin)
        // Stamp the user's role onto their Mixpanel profile + as a super
        // property so every event is segmentable by persona. Cheap to
        // re-send; identify() merges. (role/email/name only — no PII
        // beyond what's already on the profile.)
        analytics.identify(p.id, { email: p.email, role: p.role })
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false)
      })
    return () => {
      cancelled = true
    }
  }, [session?.user.id])

  // Pageview tracking — fires on every route change (SPA), including the
  // anonymous calculator routes. No-ops without a Mixpanel token.
  useEffect(() => {
    analytics.trackPageView(pathname)
  }, [pathname])

  // Still checking session — show nothing to avoid flash
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-950">
        <span className="text-stone-400 text-sm">Loading…</span>
      </div>
    )
  }

  // Not logged in — public surface: marketing landing at /, auth at
  // /login, plus the two decision-map calculators which were carved out
  // of the auth wall (Van's #5 — let users see the value before being
  // asked to commit). The calculator routes render the same components
  // as the authed app, but inside an `AnonymousShell` chrome (top bar
  // with Sign in / Get started CTAs) instead of the full sidebar.
  //
  // Anonymous behavior inside the calculators:
  //   - Engine calls succeed (the backend /api/scenarios/* and
  //     /api/fthb/scenarios/* endpoints are public)
  //   - trackActivity / save endpoints swallow the auth failure
  //   - The pages render a SignupPrompt where the auth-only affordances
  //     would normally live (Save bar, etc.)
  //
  // The TooltipProvider wraps this branch too so tooltips on the
  // calculator pages keep working pre-auth.
  //
  // Feature flag: VITE_LANDING_ENABLED. Defaults to enabled. Set to "false"
  // to fall back to the old behavior of dropping every unauthenticated
  // visitor straight onto the Login form. Useful if we need to temporarily
  // pull the public marketing page without reverting code.
  if (session === null) {
    const landingEnabled = import.meta.env.VITE_LANDING_ENABLED !== 'false'
    return (
      <TooltipProvider delayDuration={150}>
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <Routes>
            {landingEnabled && <Route path="/" element={<Landing />} />}
            <Route path="/login" element={<Login />} />
            {/* Anonymous intake — every Landing CTA points here. The
                wizard stashes answers + routes to the right calculator
                on completion. Replayed into the lead row on signup. */}
            <Route
              path="/start"
              element={
                <AnonymousShell>
                  <StartIntake />
                </AnonymousShell>
              }
            />
            <Route
              path="/decision-map"
              element={
                <AnonymousShell>
                  <DecisionMap />
                </AnonymousShell>
              }
            />
            <Route
              path="/fthb-decision-map"
              element={
                <AnonymousShell>
                  <FTHBDecisionMap />
                </AnonymousShell>
              }
            />
            <Route
              path="/portfolio-builder"
              element={
                <AnonymousShell>
                  <PortfolioBuilder />
                </AnonymousShell>
              }
            />
            <Route
              path="*"
              element={landingEnabled ? <Navigate to="/login" replace /> : <Login />}
            />
          </Routes>
        </Suspense>
      </TooltipProvider>
    )
  }

  // Logged in — show the full app. TooltipProvider wraps the whole authed
  // surface so any descendant can render Radix tooltips without re-mounting
  // a provider locally. delayDuration tuned for "intentional hover" — the
  // help affordances are deliberate (?) icons, not hidden meaning under
  // labels, so we want them snappy.
  return (
    <TooltipProvider delayDuration={150}>
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col bg-stone-900 text-stone-100 transition-all duration-200',
          collapsed ? 'w-16' : 'w-52'
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center px-4 border-b border-stone-700">
          {collapsed
            ? <span className="text-lg font-bold mx-auto">S</span>
            : <span className="text-lg font-bold tracking-tight">Saveero</span>
          }
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {buildNavItems(isAdmin).map((item, idx) => {
            if ('divider' in item) {
              return (
                <div
                  key={`divider-${idx}`}
                  className="my-2 mx-3 border-t border-stone-700"
                  aria-hidden="true"
                />
              )
            }
            const { to, label, icon: Icon } = item
            const active = pathname === to
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-stone-700 text-white'
                    : 'text-stone-400 hover:bg-stone-800 hover:text-white'
                )}
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* User email + logout */}
        <div className="border-t border-stone-700 px-2 py-3 space-y-1">
          {!collapsed && (
            <p className="px-3 text-xs text-stone-500 truncate">
              {session.user.email}
            </p>
          )}
          <button
            onClick={() => signOut()}
            className={cn(
              'flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm font-medium text-stone-400 hover:bg-stone-800 hover:text-white transition-colors',
              collapsed && 'justify-center'
            )}
          >
            <LogOut size={18} className="shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center justify-center h-10 border-t border-stone-700 text-stone-400 hover:text-white transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </aside>

      {/* Main */}
      <main
        className={cn(
          'flex-1 transition-all duration-200',
          collapsed ? 'ml-16' : 'ml-52'
        )}
      >
        <div className="p-6">
          <Suspense fallback={<div className="min-h-[40vh]" />}>
            <Routes>
              <Route path="/admin/crm"           element={<AdminCRM />} />
              <Route path="/"                    element={<Dashboard />} />
              <Route path="/list-property"       element={<ListProperty />} />
              <Route path="/mortgage-calculator" element={<MortgageCalculator />} />
              <Route path="/scenarios"           element={<ScenarioComparison />} />
              <Route path="/decision-map"        element={<DecisionMap />} />
              <Route path="/fthb-decision-map"   element={<FTHBDecisionMap />} />
              <Route path="/portfolio-builder"   element={<PortfolioBuilder />} />
              {/* /start is the anonymous intake; authed users have the
                  wizard available inline from the Dashboard already, so
                  bounce them home instead of running two parallel
                  intakes. */}
              <Route path="/start"               element={<Navigate to="/" replace />} />
              {/* Catch-all — sends the user to the dashboard if they
                  land on an unauthed-only path (most commonly /login
                  after the session is established) or a stale
                  bookmark. Without this, signing in while at /login
                  renders an empty main pane and Dashboard never
                  mounts, which silently skips the onboarding wizard. */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
        <footer className="text-center text-xs text-muted-foreground py-4">
          Saveero © {new Date().getFullYear()}
        </footer>
      </main>
    </div>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// AnonymousShell — chrome for anonymous users running the calculator pages.
//
// Mirrors the authed sidebar's dimensions, look, and collapse behaviour so
// the layout is consistent across the auth boundary (a signing-up user
// shouldn't see the page jump). The nav is filtered to the routes that
// work without a session — currently Decision Map + FTHB Decision Map.
// Auth-only surfaces (Recent Calculations, Compare, List Property, Admin)
// are intentionally not surfaced here; the user wouldn't get useful pages
// if they followed those links.
//
// Bottom of the sidebar swaps the authed Sign-out for a Sign-in button +
// quiet "Already have an account?" hint. We deliberately do NOT show a
// "Get started / Sign up" CTA in this chrome — the user is already in
// the product. SignupPrompt at the bottom of results carries that
// conversion at the right moment (when there's actually a scenario
// worth saving).
//
// Originally a slim top bar; reworked into a sidebar 2026-05-26 after
// Van pointed out that users who came through the intake wizard landed
// on the Decision Map with no way to discover the other engine.
// ---------------------------------------------------------------------------

/**
 * Anonymous-side nav. Mirrors the authed sidebar's structure but each
 * item is tagged with whether it works without a session:
 *
 *   - requiresAuth: false → links normally; the page renders fine for
 *     a logged-out visitor (engine APIs are public, save/contact
 *     affordances degrade to SignupPrompt).
 *   - requiresAuth: true  → renders with a Lock icon and routes to
 *     /login?mode=signup. Every locked click is a conversion moment —
 *     the user has signalled intent for a tool they need an account
 *     to use, and we drop them straight into signup.
 *
 * 'Home' lands on Landing for anonymous users (no session → the public
 * Routes block above mounts Landing at '/'), which is the right outcome
 * — they can re-orient from the marketing pitch.
 *
 * 'List Property' and 'Compare' are the auth-only items today. List
 * Property writes property records to the user's lead; Compare needs
 * saved scenarios to compare. Both inherently require a session.
 *
 * 'Mortgage' could be opened up anonymously with a small route change,
 * but it isn't today — until that lands, lock-icon treatment is the
 * honest answer (and still drives a conversion event).
 */
type AnonymousNavItem =
  | { divider: true }
  | { to: string; label: string; icon: typeof HomeIcon; requiresAuth: boolean }

function buildAnonymousNavItems(): AnonymousNavItem[] {
  return [
    { to: '/',                    label: 'Home',         icon: HomeIcon,   requiresAuth: false },
    { to: '/decision-map',        label: 'Decision Map', icon: Compass,    requiresAuth: false },
    { to: '/fthb-decision-map',   label: 'FTHB',         icon: Compass,    requiresAuth: false },
    { to: '/mortgage-calculator', label: 'Mortgage',     icon: Calculator, requiresAuth: true  },
    { to: '/scenarios',           label: 'Compare',      icon: GitCompare, requiresAuth: true  },
    { divider: true },
    { to: '/list-property',       label: 'List Property', icon: House,     requiresAuth: true  },
  ]
}

function AnonymousShell({ children }: { children: React.ReactNode }) {
  // Persist the collapsed state across navigations within the anonymous
  // session. Same key shape as the authed sidebar would use if it
  // persisted (it doesn't today), so the two states stay independent
  // by design — an anonymous user collapsing the sidebar shouldn't
  // affect their authed experience after they sign up.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('saveero.anon.sidebar.collapsed') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(
        'saveero.anon.sidebar.collapsed',
        collapsed ? '1' : '0',
      )
    } catch {
      // ignore — private mode / full storage
    }
  }, [collapsed])

  const { pathname } = useLocation()
  const navItems = buildAnonymousNavItems()

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — same dimensions + visual language as the authed app
          so the layout doesn't jump after signup. */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col bg-stone-900 text-stone-100 transition-all duration-200',
          collapsed ? 'w-16' : 'w-52',
        )}
      >
        {/* Logo links back to Landing so the user can always get out. */}
        <Link
          to="/"
          className="flex h-14 items-center px-4 border-b border-stone-700"
        >
          {collapsed ? (
            <span className="text-lg font-bold mx-auto">S</span>
          ) : (
            <span className="text-lg font-bold tracking-tight">Saveero</span>
          )}
        </Link>

        {/* Nav — full tool set, with auth-only items rendered with a
            Lock icon and routed to /login?mode=signup. Surfacing
            everything (rather than hiding) turns each locked click
            into a conversion event: the user has signalled intent
            for a tool they want, and we drop them straight into the
            signup form. */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map((item, idx) => {
            if ('divider' in item) {
              return (
                <div
                  key={`anon-divider-${idx}`}
                  className="my-2 mx-3 border-t border-stone-700"
                  aria-hidden="true"
                />
              )
            }
            const { to, label, icon: Icon, requiresAuth } = item
            // Auth-only items don't navigate to the route they label;
            // they navigate to signup. Active highlight is suppressed
            // because the user is never actually on that route while
            // anonymous.
            const linkTarget = requiresAuth ? '/login?mode=signup' : to
            const active = !requiresAuth && pathname === to
            const link = (
              <Link
                to={linkTarget}
                aria-label={
                  requiresAuth ? `${label} (sign up required)` : label
                }
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-stone-700 text-white'
                    : 'text-stone-400 hover:bg-stone-800 hover:text-white',
                )}
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && (
                  <span className="flex-1 flex items-center justify-between gap-2">
                    <span>{label}</span>
                    {requiresAuth && (
                      <Lock
                        size={12}
                        className="shrink-0 opacity-60"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                )}
              </Link>
            )
            // For locked items, hover/focus pops a real Radix tooltip
            // explaining the gate instead of the browser's slow,
            // unstyled title attribute. Placed to the right so it
            // escapes the dark sidebar regardless of collapsed state.
            return requiresAuth ? (
              <Tooltip key={to}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={12}>
                  Create an account to access premium features
                </TooltipContent>
              </Tooltip>
            ) : (
              <React.Fragment key={to}>{link}</React.Fragment>
            )
          })}
        </nav>

        {/* Sign-in footer — quieter than the authed "Sign out" zone,
            but visible enough that a returning user can get in. No
            'Get started / Sign up' CTA on purpose (would defeat the
            anonymous flow). */}
        <div className="border-t border-stone-700 px-2 py-3 space-y-1">
          {!collapsed && (
            <p className="px-3 text-xs text-stone-500">
              Already have an account?
            </p>
          )}
          <Link
            to="/login?mode=signin"
            className={cn(
              'flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm font-medium text-stone-400 hover:bg-stone-800 hover:text-white transition-colors',
              collapsed && 'justify-center',
            )}
            aria-label="Sign in"
          >
            <LogOut size={18} className="shrink-0 rotate-180" />
            {!collapsed && <span>Sign in</span>}
          </Link>
        </div>

        {/* Collapse toggle — same affordance the authed sidebar has. */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center justify-center h-10 border-t border-stone-700 text-stone-400 hover:text-white transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </aside>

      {/* Main column matches the authed app's margin so calculator pages
          render identically across the auth boundary. */}
      <main
        className={cn(
          'flex-1 transition-all duration-200',
          collapsed ? 'ml-16' : 'ml-52',
        )}
      >
        {children}
      </main>
    </div>
  )
}
