/**
 * Mortgage API client — talks to the FastAPI backend at /api/mortgage/*.
 *
 * This module replaces the old client-side math in `@/lib/mortgage` for
 * cases where we want a single source of truth (the Python engine). The
 * frontend's `lib/mortgage.ts` is kept around as a same-session fallback
 * for offline/dev, but UI code should prefer these calls so the engine
 * results are auditable and persistable.
 *
 * All compute endpoints (analyze, affordability, refinance) are public —
 * no auth required. The persistence endpoints (saving / listing past
 * analyses) go through `authHeader()` and require an active Supabase session.
 */
import { authHeader } from '@/api/auth'

// ---------------------------------------------------------------------------
// Shared types — mirror `mortgage.schemas` on the server
// ---------------------------------------------------------------------------

export interface AmortizationRow {
  month: number
  payment: number
  principal: number
  interest: number
  balance: number
}

export interface MonthlyBreakdown {
  principal: number
  interest: number
  pmi: number
  property_tax: number
  insurance: number
  hoa: number
  total: number
}

// ---------------------------------------------------------------------------
// /api/mortgage/analyze
// ---------------------------------------------------------------------------

export interface AnalyzeMortgageRequest {
  purchase_price: number
  down_payment: number
  annual_rate_percent: number
  term_years: number
  annual_property_tax_percent?: number
  annual_insurance_dollars?: number
  monthly_hoa?: number
}

export interface AnalyzeMortgageResponse {
  loan_amount: number
  ltv: number
  monthly_principal_interest: number
  monthly: MonthlyBreakdown
  total_interest_paid: number
  total_cost_of_loan: number
  pmi_required: boolean
  pmi_drop_off_month: number
  amortization: AmortizationRow[]
}

export async function analyzeMortgage(
  req: AnalyzeMortgageRequest,
): Promise<AnalyzeMortgageResponse> {
  const res = await fetch('/api/mortgage/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const msg = await safeError(res)
    throw new Error(msg || `analyze failed (${res.status})`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// /api/mortgage/affordability
// ---------------------------------------------------------------------------

export interface AffordabilityRequest {
  annual_income: number
  monthly_debts?: number
  down_payment_cash?: number
  annual_rate_percent?: number
  term_years?: number
  annual_property_tax_percent?: number
  annual_insurance_dollars?: number
  monthly_hoa?: number
  max_front_end_dti?: number
  max_back_end_dti?: number
}

export interface AffordabilityResponse {
  monthly_income: number
  max_monthly_housing_payment: number
  binding_constraint: 'front_end_dti' | 'back_end_dti' | 'income_zero'
  max_loan_amount: number
  max_purchase_price: number
  estimated_monthly_pi: number
  estimated_monthly_tax: number
  estimated_monthly_insurance: number
  estimated_monthly_pmi: number
  estimated_monthly_total: number
  front_end_dti: number
  back_end_dti: number
  pmi_required: boolean
  notes: string
}

export async function computeAffordability(
  req: AffordabilityRequest,
): Promise<AffordabilityResponse> {
  const res = await fetch('/api/mortgage/affordability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error((await safeError(res)) || `affordability failed (${res.status})`)
  return res.json()
}

// ---------------------------------------------------------------------------
// /api/mortgage/refinance
// ---------------------------------------------------------------------------

export interface RefinanceRequest {
  current: {
    original_principal: number
    annual_rate_percent: number
    term_years: number
    elapsed_months?: number
  }
  offer: {
    annual_rate_percent: number
    new_term_years: number
    closing_costs?: number
    cash_out?: number
    rolled_in_closing?: boolean
  }
}

export interface RefinanceResponse {
  current_balance: number
  current_monthly_pi: number
  current_remaining_months: number
  current_lifetime_remaining_interest: number
  new_loan_amount: number
  new_monthly_pi: number
  new_total_months: number
  new_lifetime_interest: number
  monthly_savings: number
  break_even_month: number
  lifetime_savings: number
  recommendation: 'refinance' | 'hold' | 'marginal'
  notes: string
}

export async function analyzeRefinance(
  req: RefinanceRequest,
): Promise<RefinanceResponse> {
  const res = await fetch('/api/mortgage/refinance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error((await safeError(res)) || `refinance failed (${res.status})`)
  return res.json()
}

// ---------------------------------------------------------------------------
// /api/mortgage/analyses  (persistence — requires auth)
// ---------------------------------------------------------------------------

export type AnalysisType = 'analyze' | 'affordability' | 'refinance'

export interface SavedAnalysisSummary {
  id: string
  label: string | null
  analysis_type: AnalysisType
  purchase_price: number | null
  loan_amount: number | null
  monthly_total: number | null
  annual_rate_percent: number | null
  term_years: number | null
  created_at: string
}

export interface SaveAnalysisRequest {
  label?: string
  analysis_type: AnalysisType
  inputs: Record<string, unknown>
  result: Record<string, unknown>
  property_id?: string
}

export async function saveAnalysis(body: SaveAnalysisRequest): Promise<{ id: string }> {
  const auth = await authHeader()
  if (!auth) throw new Error('Not signed in')
  const res = await fetch('/api/mortgage/analyses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error((await safeError(res)) || `save failed (${res.status})`)
  const json = await res.json()
  return { id: json.id }
}

export async function listAnalyses(): Promise<SavedAnalysisSummary[]> {
  const auth = await authHeader()
  if (!auth) throw new Error('Not signed in')
  const res = await fetch('/api/mortgage/analyses', {
    headers: { Authorization: auth },
  })
  if (!res.ok) throw new Error((await safeError(res)) || `list failed (${res.status})`)
  return res.json()
}

export async function getAnalysis(id: string): Promise<{
  id: string
  label: string | null
  analysis_type: AnalysisType
  inputs: Record<string, unknown>
  result: Record<string, unknown>
  created_at: string
}> {
  const auth = await authHeader()
  if (!auth) throw new Error('Not signed in')
  const res = await fetch(`/api/mortgage/analyses/${encodeURIComponent(id)}`, {
    headers: { Authorization: auth },
  })
  if (!res.ok) throw new Error((await safeError(res)) || `get failed (${res.status})`)
  return res.json()
}

export async function deleteAnalysis(id: string): Promise<void> {
  const auth = await authHeader()
  if (!auth) throw new Error('Not signed in')
  const res = await fetch(`/api/mortgage/analyses/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: auth },
  })
  if (!res.ok && res.status !== 204) {
    throw new Error((await safeError(res)) || `delete failed (${res.status})`)
  }
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
