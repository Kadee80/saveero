/**
 * Login.tsx
 *
 * Sign-in / sign-up page. Shown when no Supabase session is active.
 * On successful auth the parent (App.tsx) detects the session change
 * via onAuthStateChange and renders the main app.
 */
import React, { useState } from 'react'
import { signIn, signUp } from '@/api/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

type Mode = 'signin' | 'signup'

export default function Login() {
  const [mode, setMode]       = useState<Mode>('signin')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState<string | null>(null)
  const [info, setInfo]       = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)

    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password)
        if (error) setError(error.message)
        // On success, App.tsx's onAuthStateChange fires and shows the app
      } else {
        const { error } = await signUp(email, password)
        if (error) {
          setError(error.message)
        } else {
          setInfo('Account created! Check your email for a confirmation link, then sign in.')
          setMode('signin')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white tracking-tight">Saveero</h1>
          <p className="text-slate-400 text-sm mt-1">Your home decision platform</p>
        </div>

        <Card className="border-slate-800 bg-slate-900 text-slate-100">
          <CardHeader className="pb-4">
            <CardTitle className="text-white">
              {mode === 'signin' ? 'Welcome back' : 'Create an account'}
            </CardTitle>
            <CardDescription className="text-slate-400">
              {mode === 'signin'
                ? 'Sign in to access your listings and analysis.'
                : 'Sign up to get started with Saveero.'}
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {/* Error / info banners */}
              {error && (
                <div className="rounded-md bg-red-900/40 border border-red-700 px-3 py-2 text-sm text-red-300">
                  {error}
                </div>
              )}
              {info && (
                <div className="rounded-md bg-emerald-900/40 border border-emerald-700 px-3 py-2 text-sm text-emerald-300">
                  {info}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-slate-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-slate-500"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-slate-300">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-slate-500"
                />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-2">
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                {loading
                  ? 'Please wait…'
                  : mode === 'signin' ? 'Sign in' : 'Create account'}
              </Button>

              <p className="text-sm text-slate-400 text-center">
                {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  type="button"
                  onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(null); setInfo(null) }}
                  className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                >
                  {mode === 'signin' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
