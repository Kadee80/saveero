/**
 * auth.ts
 *
 * Supabase authentication client for the frontend.
 * Provides login, logout, session access, and a helper for
 * adding the Authorization header to API requests.
 *
 * Requires in webapp/.env:
 *   VITE_SUPABASE_URL=https://your-project.supabase.co
 *   VITE_SUPABASE_ANON_KEY=your-anon-key
 */
import { createClient, type Session, type User } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnon) {
  console.warn(
    '[auth] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. ' +
    'Auth will not work. Check webapp/.env.',
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnon ?? '');

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

/**
 * Returns the Authorization header value for API calls.
 * Returns null if the user isn't logged in.
 *
 * Usage:
 *   const auth = await authHeader();
 *   fetch('/api/listings', { headers: { Authorization: auth ?? '' } });
 */
export async function authHeader(): Promise<string | null> {
  const session = await getSession();
  return session ? `Bearer ${session.access_token}` : null;
}
