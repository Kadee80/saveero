/**
 * Typed client for the leads / CRM API.
 *
 * Mirrors api/lead_routes.py on the backend:
 *   POST   /api/leads               create-or-upsert the current user's lead
 *   GET    /api/leads/me            read current user's lead
 *   PUT    /api/leads/me            partial update (wizard / enrichment)
 *   POST   /api/leads/me/activity   append an activity_log entry
 *   GET    /api/leads               admin-only list (drives /admin/crm)
 *
 * All endpoints require an active Supabase session (authHeader()).
 *
 * @module api/leadsApi
 */
import { authHeader } from '@/api/auth'

// ---------------------------------------------------------------------------
// Types — kept as string unions rather than enums so they stay JSON-friendly
// and match the SQL enums exactly.
// ---------------------------------------------------------------------------

export type LeadRole = 'homeowner' | 'first_time_buyer' | 'pro' | 'unknown'

export type LeadIntent =
  // Current-homeowner consumer intents
  | 'considering_move'
  | 'refinance'
  | 'rental_explore'
  | 'curious'
  // First-time-buyer consumer intents (added 2026-05-18)
  | 'fthb_saving'
  | 'fthb_pre_approved'
  | 'fthb_exploring'
  | 'fthb_unsure'
  // Industry-pro purposes (added 2026-05-18 — captured in the same field
  // since the wizard's "what brings you in" step shows pro-specific
  // options when persona='pro')
  | 'pro_evaluating'
  | 'pro_using_with_clients'
  | 'pro_curious'
  | 'unknown'

export type LeadStatus =
  | 'new'
  | 'enriched'
  | 'active'
  | 'engaged'
  | 'converted'
  | 'lost'

/** One entry in the activity_log JSONB column. */
export interface ActivityLogEntry {
  at: string
  kind: string
  data?: Record<string, unknown>
}

export interface Lead {
  id: string
  user_id: string
  name: string | null
  role: LeadRole
  intent: LeadIntent
  pipeline: string | null
  /**
   * Only meaningful when role='pro'. The kind of pro the user IS
   * (financial-planner / real-estate-agent / mortgage-broker). Distinct
   * from `pipeline` which (for consumers) is the kind of pro they want
   * to work with.
   */
  pro_type: string | null
  status: LeadStatus
  activity_log: ActivityLogEntry[]
  created_at: string
  updated_at: string
  /**
   * Embedded from public.users via the user_id FK. Populated by the
   * admin list endpoint (GET /api/leads) but null on the user-facing
   * /me endpoints, which don't bother joining since the caller already
   * knows their own email from the JWT.
   */
  email?: string | null
}

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

export interface CreateLeadRequest {
  /** Captured on the signup form. Optional so the endpoint stays usable
   *  if we ever want to create a lead without a name (e.g. resume after
   *  a failed signup attempt). */
  name?: string
}

export interface UpdateLeadRequest {
  name?: string
  role?: LeadRole
  intent?: LeadIntent
  pipeline?: string
  /** Only sent when role='pro' — what kind of pro the user is. */
  pro_type?: string
}

export interface AppendActivityRequest {
  /** Event slug. By convention:
   *    'ran_*'             -> bumps status to 'active'
   *    'saved_*'           -> bumps status to 'active'
   *    'clicked_contact_*' -> bumps status to 'engaged'
   *  Any other slug just appends without a status change.
   */
  kind: string
  data?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/**
 * Create-or-upsert the current user's lead row. Called from the signup
 * flow right after Supabase signUp succeeds — idempotent, so re-calling
 * is safe.
 */
export async function createLead(body: CreateLeadRequest): Promise<Lead> {
  const auth = await authHeader()
  if (!auth) throw new Error('Not signed in')
  const res = await fetch('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error((await safeError(res)) || `create lead failed (${res.status})`)
  }
  return res.json()
}

/** Read the current user's own lead row. 404s if it hasn't been created yet. */
export async function getMyLead(): Promise<Lead> {
  const auth = await authHeader()
  if (!auth) throw new Error('Not signed in')
  const res = await fetch('/api/leads/me', { headers: { Authorization: auth } })
  if (!res.ok) {
    throw new Error((await safeError(res)) || `get my lead failed (${res.status})`)
  }
  return res.json()
}

/** Partial update — used by the post-signup wizard and any later enrichment. */
export async function updateMyLead(body: UpdateLeadRequest): Promise<Lead> {
  const auth = await authHeader()
  if (!auth) throw new Error('Not signed in')
  const res = await fetch('/api/leads/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error((await safeError(res)) || `update lead failed (${res.status})`)
  }
  return res.json()
}

/** Caller's own public.users row + a precomputed is_admin flag. */
export interface MyProfile {
  id: string
  email: string | null
  role: string
  is_admin: boolean
}

/**
 * Lightweight self-profile read — used on App mount to decide whether to
 * show the admin CRM nav link. Cheap GET against the user's own row;
 * intentionally distinct from listAllLeads (which returns every lead in
 * the system and was previously misused for admin detection — that
 * payload could block the user's own /leads/me read on a cold dyno and
 * left admin dashboards stuck on Loading…).
 */
export async function getMyProfile(): Promise<MyProfile> {
  const auth = await authHeader()
  if (!auth) throw new Error('Not signed in')
  const res = await fetch('/api/me/profile', {
    headers: { Authorization: auth },
  })
  if (!res.ok) {
    throw new Error((await safeError(res)) || `profile fetch failed (${res.status})`)
  }
  return res.json()
}

/**
 * Fire-and-forget wrapper around appendActivity. Callers that just want
 * to log a user action without caring about the response should use this
 * — it swallows network failures and never throws, so a flaky CRM call
 * can never block the workflow it's tagging along on.
 *
 * Anonymous users hit the "Not signed in" guard in appendActivity; we
 * swallow that case silently rather than warning (Van's #5 — calculator
 * pages are intentionally usable signed-out, so a CRM-tracking warning
 * on every Recalculate would be noise). Other failures still log.
 *
 * Example:
 *   trackActivity('ran_decision_map')
 *   trackActivity('clicked_contact_financial_planner', { from: 'recommendation' })
 */
export function trackActivity(kind: string, data?: Record<string, unknown>): void {
  appendActivity({ kind, data }).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === 'Not signed in') return
    console.warn(`[lead] activity '${kind}' failed:`, err)
  })
}

/** Append one event to the activity_log. Status auto-bumps per backend rules. */
export async function appendActivity(body: AppendActivityRequest): Promise<Lead> {
  const auth = await authHeader()
  if (!auth) throw new Error('Not signed in')
  const res = await fetch('/api/leads/me/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error((await safeError(res)) || `append activity failed (${res.status})`)
  }
  return res.json()
}

/** Admin patch payload — used by AdminCRM's LeadDrawer status editor. */
export interface AdminPatchLeadRequest {
  status?: LeadStatus
  /** Optional free-text note attached to the activity_log entry. */
  note?: string
  name?: string
  role?: LeadRole
  intent?: LeadIntent
  pipeline?: string
  pro_type?: string
}

/**
 * Admin-only — patch any field on any lead. Used by the CRM drawer to
 * mark leads `converted`/`lost`, fix captured names, etc. Status moves
 * bypass the user-side forward-only ladder so admins can correct
 * misclassifications (e.g. roll a 'converted' back to 'engaged' if a
 * deal falls through). Returns the updated lead row.
 */
export async function adminUpdateLead(
  leadId: string,
  body: AdminPatchLeadRequest,
): Promise<Lead> {
  const auth = await authHeader()
  if (!auth) throw new Error('Not signed in')
  const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error((await safeError(res)) || `admin update failed (${res.status})`)
  }
  return res.json()
}

/**
 * Admin-only — bulk delete leads by id. Works for both "delete one"
 * (pass a single-element array from the drawer) and "delete N
 * selected" (pass the array from the Kanban's multi-select state).
 * Returns the number actually removed.
 *
 * Only the leads row is deleted; the public.users record stays. The
 * user can sign back in and App.tsx will re-seed a fresh 'new' lead.
 */
export async function adminBulkDeleteLeads(
  leadIds: string[],
): Promise<{ deleted: number }> {
  const auth = await authHeader()
  if (!auth) throw new Error('Not signed in')
  const res = await fetch('/api/leads/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ lead_ids: leadIds }),
  })
  if (!res.ok) {
    throw new Error((await safeError(res)) || `bulk delete failed (${res.status})`)
  }
  return res.json()
}

/** Admin-only — full list for the CRM dashboard. Non-admins get 403. */
export async function listAllLeads(): Promise<Lead[]> {
  const auth = await authHeader()
  if (!auth) throw new Error('Not signed in')
  const res = await fetch('/api/leads', { headers: { Authorization: auth } })
  if (!res.ok) {
    throw new Error((await safeError(res)) || `list leads failed (${res.status})`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function safeError(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { detail?: string | unknown }
    if (typeof body?.detail === 'string') return body.detail
    return null
  } catch {
    return null
  }
}
