/**
 * Mixpanel product analytics — thin, typed wrapper around mixpanel-browser.
 *
 * Design goals:
 *   - **Never throw.** Analytics is best-effort. Every public function is
 *     wrapped so a Mixpanel hiccup (blocked by an ad-blocker, network
 *     down, token missing) can never break a user workflow.
 *   - **No-op without a token.** If VITE_MIXPANEL_TOKEN is unset (local
 *     dev, preview builds, CI) the whole module quietly does nothing.
 *     Mirrors how auth.ts degrades when Supabase env vars are missing.
 *   - **Single source of event names.** Callers use the EVENTS constants
 *     and the typed helpers below — no free-form event strings sprinkled
 *     across the app. Naming follows Mixpanel's Object-Action convention
 *     ("Account Created", "Analysis Run", "Partner Contacted").
 *   - **CCPA opt-out model.** Saveero is a US consumer product with likely
 *     California traffic and no EU users (confirmed with the team
 *     2026-05-20). California is an opt-OUT regime: we may collect by
 *     default and must honor a "do not sell/share" opt-out. So we
 *     initialize with tracking ON and expose optOut()/optIn() the product
 *     can wire to a privacy control. US ingestion — no EU data residency.
 *
 * Identity model:
 *   - Anonymous visitors get Mixpanel's auto-generated distinct_id.
 *   - On sign-in we call identify(userId) so the anonymous pre-signup
 *     events (e.g. an anonymous Decision Map run) stitch to the real user.
 *   - On sign-out we call reset() so the next user on a shared device
 *     starts a fresh identity.
 *
 * @module analytics/mixpanel
 */
import mixpanel, { type Dict } from 'mixpanel-browser'

const TOKEN = import.meta.env.VITE_MIXPANEL_TOKEN as string | undefined

/** Flipped true only after a successful init() with a real token. */
let ready = false

// ---------------------------------------------------------------------------
// Event taxonomy — the canonical list. Add new events here, never inline.
// Object-Action naming; Title Case with spaces (Mixpanel convention).
// ---------------------------------------------------------------------------

export const EVENTS = {
  /** THE value moment — a new account is created (signup form submitted). */
  ACCOUNT_CREATED: 'Account Created',
  /** A returning or new user establishes an authenticated session. */
  SIGNED_IN: 'Signed In',
  /** Intake wizard finished; carries the persona we routed them to. */
  ONBOARDING_COMPLETED: 'Onboarding Completed',
  /** A decision engine ran successfully and rendered a recommendation. */
  ANALYSIS_RUN: 'Analysis Run',
  /** A computed analysis was saved to the user's account. */
  SCENARIO_SAVED: 'Scenario Saved',
  /** A contact-a-pro pipeline CTA was clicked (engaged-lead moment). */
  PARTNER_CONTACTED: 'Partner Contacted',
} as const

export type EventName = (typeof EVENTS)[keyof typeof EVENTS]

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Initialize Mixpanel exactly once, at app startup (see main.tsx).
 * Safe to call when the token is missing — it just leaves `ready` false
 * and every later call no-ops.
 */
export function init(): void {
  if (ready) return
  if (!TOKEN) {
    // Intentionally quiet in production builds; a single dev hint helps
    // when someone forgets to set the env var locally.
    if (import.meta.env.DEV) {
      console.info('[mixpanel] VITE_MIXPANEL_TOKEN not set — analytics disabled.')
    }
    return
  }
  try {
    mixpanel.init(TOKEN, {
      // US ingestion (default api_host) — no EU data residency needed.
      // localStorage persistence survives reloads and is shareable across
      // tabs; cookie mode is unnecessary for an SPA.
      persistence: 'localStorage',
      // CCPA opt-out model: collect by default, honor opt-out via optOut().
      opt_out_tracking_by_default: false,
      // SPA route changes are tracked manually (trackPageView) — disable
      // the automatic single-pageview-on-load so we don't double count.
      track_pageview: false,
      // Trim noisy default autocapture; we send explicit, named events.
      autocapture: false,
      // Keep PII out of the default property set. We attach $email/$name
      // deliberately on the user profile via identify(), not on every event.
      property_blacklist: ['$current_url', '$referrer', '$referring_domain'],
    })
    ready = true
  } catch (err) {
    // Leave ready=false so everything no-ops.
    console.warn('[mixpanel] init failed — analytics disabled:', err)
  }
}

/**
 * Tie subsequent events to a known user and stamp their profile. Call on
 * sign-in. Anonymous events recorded before this stitch to the same person.
 */
export function identify(
  userId: string,
  profile?: { email?: string | null; name?: string | null; role?: string | null },
): void {
  if (!ready) return
  try {
    mixpanel.identify(userId)
    if (profile) {
      const peopleProps: Dict = {}
      if (profile.email) peopleProps.$email = profile.email
      if (profile.name) peopleProps.$name = profile.name
      if (profile.role) peopleProps.role = profile.role
      if (Object.keys(peopleProps).length > 0) {
        mixpanel.people.set(peopleProps)
      }
      // Stamp role as a super property so every later event is segmentable
      // by persona without a join.
      if (profile.role) {
        mixpanel.register({ role: profile.role })
      }
    }
  } catch (err) {
    console.warn('[mixpanel] identify failed:', err)
  }
}

/** Clear identity on sign-out so the next user starts fresh. */
export function reset(): void {
  if (!ready) return
  try {
    mixpanel.reset()
  } catch (err) {
    console.warn('[mixpanel] reset failed:', err)
  }
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

/** Record an event. No-ops if uninitialized; never throws. */
export function track(event: EventName, props?: Dict): void {
  if (!ready) return
  try {
    mixpanel.track(event, props)
  } catch (err) {
    console.warn(`[mixpanel] track '${event}' failed:`, err)
  }
}

/** Manual pageview — call on route change (SPA). */
export function trackPageView(path: string): void {
  if (!ready) return
  try {
    mixpanel.track_pageview({ path })
  } catch (err) {
    console.warn('[mixpanel] pageview failed:', err)
  }
}

// ---------------------------------------------------------------------------
// CCPA opt-out controls — wire these to a privacy / "Do Not Sell or Share
// My Personal Information" control if/when the product adds one.
// ---------------------------------------------------------------------------

/** Stop all tracking for this device/user and forget the queued data. */
export function optOut(): void {
  if (!ready) return
  try {
    mixpanel.opt_out_tracking()
  } catch (err) {
    console.warn('[mixpanel] opt-out failed:', err)
  }
}

/** Re-enable tracking after a prior opt-out. */
export function optIn(): void {
  if (!ready) return
  try {
    mixpanel.opt_in_tracking()
  } catch (err) {
    console.warn('[mixpanel] opt-in failed:', err)
  }
}

/** Whether the current user has opted out (defaults false). */
export function hasOptedOut(): boolean {
  if (!ready) return false
  try {
    return mixpanel.has_opted_out_tracking()
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Namespaced default export — import as `import { analytics } from ...` for
// a tidy call site (analytics.track(...)), or cherry-pick named exports.
// ---------------------------------------------------------------------------

export const analytics = {
  init,
  identify,
  reset,
  track,
  trackPageView,
  optOut,
  optIn,
  hasOptedOut,
  EVENTS,
}

export default analytics
