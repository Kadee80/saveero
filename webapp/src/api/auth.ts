/**
 * Auth helpers.
 *
 * In production this will integrate with Supabase Auth — the token will be
 * stored after a real sign-in flow. The stub below keeps local development
 * working without requiring a live Supabase project.
 *
 * TODO: replace with Supabase JS client once auth module is built.
 */

export const getAuthToken = (): string | null => {
  return localStorage.getItem('sb-access-token') ?? sessionStorage.getItem('sb-access-token')
}

export const setAuthToken = (token: string, persist = true): void => {
  const storage = persist ? localStorage : sessionStorage
  storage.setItem('sb-access-token', token)
}

export const clearAuthToken = (): void => {
  localStorage.removeItem('sb-access-token')
  sessionStorage.removeItem('sb-access-token')
}

export const isAuthenticated = (): boolean => {
  const token = getAuthToken()
  if (!token) return false
  try {
    const [, payload] = token.split('.')
    const { exp } = JSON.parse(atob(payload))
    return exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}
