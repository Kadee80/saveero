import React, { useState } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { LayoutDashboard, Home, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import Dashboard from './pages/Dashboard'
import ListProperty from './pages/ListProperty'

const navItems = [
  { to: '/',              label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/list-property', label: 'List Property', icon: Home },
  // Add new routes here as modules ship
]

export default function App() {
  const [collapsed, setCollapsed] = useState(false)
  const { pathname } = useLocation()

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
            <Route path="/"               element={<Dashboard />} />
            <Route path="/list-property"  element={<ListProperty />} />
          </Routes>
        </div>
        <footer className="text-center text-xs text-muted-foreground py-4">
          Saveero © {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  )
}
