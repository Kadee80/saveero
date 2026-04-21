import React, { useEffect, useState } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { LayoutDashboard, Home, Calculator, GitCompare, Compass, ChevronLeft, ChevronRight, LogOut } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { cn } from '@/lib/utils'
import { supabase, signOut } from '@/api/auth'
import Dashboard from './pages/Dashboard'
import ListProperty from './pages/ListProperty'
import MortgageCalculator from './pages/MortgageCalculator'
import ScenarioComparison from './pages/ScenarioComparison'
import DecisionMap from './pages/DecisionMap'
import Login from './pages/Login'

const navItems = [
  { to: '/',                    label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/list-property',       label: 'List Property', icon: Home },
  { to: '/mortgage-calculator', label: 'Mortgage',       icon: Calculator },
  { to: '/scenarios',           label: 'Compare',        icon: GitCompare },
  { to: '/decision-map',        label: 'Decision Map',   icon: Compass },
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

  // Still checking session — show nothing to avoid flash
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <span className="text-slate-400 text-sm">Loading…</span>
      </div>
    )
  }

  // Not logged in — show auth page
  if (session === null) {
    return <Login />
  }

  // Logged in — show the full app
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col bg-slate-900 text-slate-100 transition-all duration-200',
          collapsed ? 'w-16' : 'w-52'
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center px-4 border-b border-slate-700">
          {collapsed
            ? <span className="text-lg font-bold mx-auto">S</span>
            : <span className="text-lg font-bold tracking-tight">Saveero</span>
          }
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = pathname === to
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                )}
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* User email + logout */}
        <div className="border-t border-slate-700 px-2 py-3 space-y-1">
          {!collapsed && (
            <p className="px-3 text-xs text-slate-500 truncate">
              {session.user.email}
            </p>
          )}
          <button
            onClick={() => signOut()}
            className={cn(
              'flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors',
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
          className="flex items-center justify-center h-10 border-t border-slate-700 text-slate-400 hover:text-white transition-colors"
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
