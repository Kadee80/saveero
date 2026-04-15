/**
 * Authentication client module - Supabase integration
 *
 * Provides authentication functions for sign-in, sign-up, logout, and session management.
 * All frontend API calls should use the authHeader() function to include JWT token.
 *
 * Environment setup required in webapp/.env:
 * ```
 * VITE_SUPABASE_URL=https://your-project.supabase.co
 * VITE_SUPABASE_ANON_KEY=your-anon-key
 * ```
 *
 * The Supabase client automatically manages JWT tokens and refresh them as needed.
 * Session state changes can be monitored via supabase.auth.onAuthStateChange().
 *
 * @module api/auth
 * @example
 * import { signIn, getUser, authHeader } from '@/api/auth'
 *
 * // Sign in
 * const { data, error } = await signIn('user@example.com', 'password')
 *
 * // Get current user
 * const user = await getUser()
 *
 * // Use auth header in API calls
 * const auth = await authHeader()
 * fetch('/api/listings', { headers: { Authorization: auth ?? '' } })
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

/**
 * Supabase client instance - shared across the app
 * Handles JWT token storage, refresh, and session management automatically
 */
export const supabase = createClient(supabaseUrl ?? '', supabaseAnon ?? '');

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/**
 * Sign in with email and password
 *
 * On success, the session is automatically stored by Supabase.
 * Parent component can listen to auth state changes via supabase.auth.onAuthStateChange()
 *
 * @param {string} email - User's email address
 * @param {string} password - User's password (minimum 6 characters)
 * @returns {Promise} Returns { data, error } - data contains user and session if successful
 *
 * @example
 * const { data, error } = await signIn('user@example.com', 'password')
 * if (error) console.error(error.message)
 * else console.log('Signed in:', data.user.email)
 */
export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

/**
 * Sign up with email and password
 *
 * On success, user receives confirmation email (requires SMTP config in Supabase).
 * User must confirm email before they can sign in.
 *
 * @param {string} email - New user's email address
 * @param {string} password - New password (minimum 6 characters)
 * @returns {Promise} Returns { data, error } - data contains user (unconfirmed) if successful
 *
 * @example
 * const { data, error } = await signUp('newuser@example.com', 'password123')
 * if (error) console.error(error.message)
 * else console.log('Signup successful - check email for confirmation')
 */
export async function signUp(email: string, password: string) {
  return supabase.auth.signUp({ email, password });
}

/**
 * Sign out the current user
 *
 * Clears the session and JWT token from local storage.
 * Parent component can listen via onAuthStateChange() to detect logout.
 *
 * @returns {Promise<{ error: null }>} Returns error object (usually null on success)
 *
 * @example
 * await signOut()
 * // Session is cleared, user will be redirected to login on next page load
 */
export async function signOut() {
  return supabase.auth.signOut();
}

/**
 * Get the current session (JWT tokens, user info, expiry)
 *
 * Does not refresh expired tokens - for a fresh session check, call getUser() instead.
 * Use this to access the raw JWT access token for custom API calls.
 *
 * @returns {Promise<Session | null>} Current session or null if not logged in
 *
 * @example
 * const session = await getSession()
 * if (session) console.log('Access token:', session.access_token)
 */
export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Get the current authenticated user
 *
 * This method refreshes expired tokens automatically.
 * Use this instead of getSession() if you need to ensure you have valid tokens.
 *
 * @returns {Promise<User | null>} Current user object or null if not logged in
 *
 * @example
 * const user = await getUser()
 * if (user) console.log('Logged in as:', user.email)
 */
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
