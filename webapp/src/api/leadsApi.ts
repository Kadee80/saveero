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

export type LeadRole = 'homeowner' | 'pro' | 'unknown'

export type LeadIntent =
  | 'considering_move'
  | 'refinance'
  | 'rental_explore'
  | 'curious'
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
  status: LeadStatus
  activity_log: ActivityLogEntry[]
  created_at: string
  updated_at: string
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
