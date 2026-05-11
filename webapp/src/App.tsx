import React, { Suspense, lazy, useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Home as HomeIcon, House, Calculator, GitCompare, Compass, ChevronLeft, ChevronRight, LogOut } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { cn } from '@/lib/utils'
import { supabase, signOut } from '@/api/auth'
import { createLead } from '@/api/leadsApi'
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

// Sidebar nav, grouped: mortgage tools first (the product focus), then a
// divider, then the property-listing creator (kept reachable but clearly
// secondary). The empty `divider: true` entry renders a thin border-t row
// instead of a link.
const navItems: Array<
  | { divider: true }
  | { to: string; label: string; icon: typeof HomeIcon }
> = [
  { to: '/',                    label: 'Home',         icon: HomeIcon },
  { to: '/decision-map',        label: 'Decision Map', icon: Compass },
  { to: '/mortgage-calculator', label: 'Mortgage',     icon: Calculator },
  { to: '/scenarios',           label: 'Compare',      icon: GitCompare },
  { divider: true },
  { to: '/list-property',       label: 'List Property', icon: House },
]

export default function App() {
  const [session, setSession]   = useState<Session | null | undefined>(undefined) // undefined = loading
  const [collapsed, setCollapsed] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    // Hydrate from existing session
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    // Keep in sync with Supabase auth events (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
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

  // Still checking session — show nothing to avoid flash
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-950">
        <span className="text-stone-400 text-sm">Loading…</span>
      </div>
    )
  }

  // Not logged in — public surface: marketing landing at /, auth at /login.
  // Any other path (including bookmarked deep links to authed pages) sends
  // the visitor to /login so they land somewhere actionable instead of a
  // 404, then the deep link can be re-followed once they sign in.
  //
  // Feature flag: VITE_LANDING_ENABLED. Defaults to enabled. Set to "false"
  // (e.g. in Vercel env vars) to fall back to the old behavior of dropping
  // every unauthenticated visitor straight onto the Login form. Useful if
  // we need to temporarily pull the public marketing page without reverting
  // code (e.g. a copy issue, or running a closed-beta period).
  if (session === null) {
    const landingEnabled = import.meta.env.VITE_LANDING_ENABLED !== 'false'
    // Suspense fallback is just the cream background — Landing's chunk is
    // small enough to typically resolve in well under a second, and a
    // blank cream pane reads as "loading" without flashing heavy chrome.
    return (
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <Routes>
          {landingEnabled && <Route path="/" element={<Landing />} />}
          <Route path="/login" element={<Login />} />
          <Route
            path="*"
            element={landingEnabled ? <Navigate to="/login" replace /> : <Login />}
          />
        </Routes>
      </Suspense>
    )
  }

  // Logged in — show the full app
  return (
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
          {navItems.map((item, idx) => {
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
          <Routes>
            <Route path="/"                    element={<Dashboard />} />
            <Route path="/list-property"       element={<ListProperty />} />
            <Route path="/mortgage-calculator" element={<MortgageCalculator />} />
            <Route path="/scenarios"           element={<ScenarioComparison />} />
            <Route path="/decision-map"        element={<DecisionMap />} />
          </Routes>
        </div>
        <footer className="text-center text-xs text-muted-foreground py-4">
          Saveero © {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  )
}
