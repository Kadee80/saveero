/**
 * Anonymous-run stash — bridges the gap between a logged-out user running
 * a calculation and the moment they create an account.
 *
 * Flow:
 *   1. Anonymous user runs DecisionMap or FTHB → page calls stashAnonRun()
 *      after a successful Recalculate.
 *   2. User clicks "Create free account" CTA → goes to /login → signs up.
 *   3. App.tsx's session-mount effect calls readAnonStash() and, if a
 *      stash exists, replays it (POSTs to the appropriate save endpoint)
 *      so the user's first signed-in view already has their first
 *      saved scenario waiting.
 *   4. Stash is cleared after a successful replay (or on explicit clear).
 *
 * We only keep ONE stash at a time — the latest run. Anonymous users who
 * hop between calculators get their last attempt preserved. That's the
 * 90% case; the 10% where someone runs both engines before signing up
 * loses the older one, which is fine.
 *
 * Stash payload is intentionally opaque to this module — the calculator
 * pages know what shape to put in, and App.tsx + the save endpoints know
 * what shape to read out. Keeping it loose lets us add new engine kinds
 * without churning this file.
 */

const KEY = 'saveero.anon.lastRun'

export type AnonStashKind = 'homeowner_decision' | 'fthb_decision'

export interface AnonStash {
  kind: AnonStashKind
  /** Engine inputs as the calculator's API expects them. */
  inputs: Record<string, unknown>
  /** Engine result blob (same shape the page rendered from). */
  result: Record<string, unknown>
  /** ISO timestamp — used to drop stale stashes after long absences. */
  savedAt: string
}

/** Max age before we treat a stash as stale and ignore it (7 days). */
const STALE_MS = 7 * 24 * 60 * 60 * 1000

/** Write the latest anonymous run. Silent on storage errors. */
export function stashAnonRun(stash: Omit<AnonStash, 'savedAt'>): void {
  try {
    const full: AnonStash = { ...stash, savedAt: new Date().toISOString() }
    localStorage.setItem(KEY, JSON.stringify(full))
  } catch {
    // localStorage can throw in private mode or when full — silently skip.
  }
}

/** Read the stashed run, or null if none / stale / unparseable. */
export function readAnonStash(): AnonStash | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AnonStash
    if (!parsed?.kind || !parsed.inputs || !parsed.result || !parsed.savedAt) {
      return null
    }
    const age = Date.now() - Date.parse(parsed.savedAt)
    if (!Number.isFinite(age) || age > STALE_MS) return null
    return parsed
  } catch {
    return null
  }
}

/** Drop the stash — call after a successful replay or explicit dismissal. */
export function clearAnonStash(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Anonymous onboarding stash — separate concern, separate key.
//
// The /start anonymous intake flow asks the same persona/intent questions
// as the post-signup OnboardingWizard but has nowhere to write them yet
// (no lead row). We stash the assembled body in localStorage so it can be
// replayed via updateMyLead the moment the user signs up — landing them
// straight on the right calculator with their lead already enriched.
//
// Kept distinct from the run stash above because:
//   - different shape (a lead body vs. an engine run)
//   - different replay target (PUT /api/me/lead vs. POST scenario save)
//   - one user may legitimately have both at once (ran a calc, opened
//     the intake wizard, signed up — we want both replayed)
// ---------------------------------------------------------------------------

const ONBOARDING_KEY = 'saveero.anon.onboarding'

/**
 * Body shape mirrored from OnboardingWizard's OnboardingBody (kept loose
 * here so this file doesn't depend on the wizard module). The replay
 * effect type-asserts before handing to updateMyLead.
 */
export interface AnonOnboarding {
  name?: string
  role?: string
  intent?: string
  pipeline?: string
  pro_type?: string
  /** ISO timestamp — drives the staleness window. */
  savedAt: string
}

/** Write the latest anonymous-intake answers. Silent on storage errors. */
export function stashAnonOnboarding(
  body: Omit<AnonOnboarding, 'savedAt'>,
): void {
  try {
    const full: AnonOnboarding = { ...body, savedAt: new Date().toISOString() }
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(full))
  } catch {
    // localStorage can throw in private mode or when full — silently skip.
  }
}

/** Read the stashed intake answers, or null if none / stale / unparseable. */
export function readAnonOnboarding(): AnonOnboarding | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AnonOnboarding
    if (!parsed?.savedAt) return null
    const age = Date.now() - Date.parse(parsed.savedAt)
    if (!Number.isFinite(age) || age > STALE_MS) return null
    return parsed
  } catch {
    return null
  }
}

/** Drop the onboarding stash — call after a successful replay. */
export function clearAnonOnboarding(): void {
  try {
    localStorage.removeItem(ONBOARDING_KEY)
  } catch {
    // ignore
  }
}
