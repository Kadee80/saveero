/**
 * FTHB API client — talks to the FastAPI first-time-homebuyer engine
 * at /api/fthb/scenarios/*.
 *
 * Parallel to scenarioApi.ts (which talks to the homeowner engine at
 * /api/scenarios/*). The two engines are separate by design — the
 * client (Van) framed FTHB as a separate branch from the homeowner
 * branch — and the wire formats reflect that.
 *
 * Every number returned ties to a cell in the client's
 * `FTHB_decision map.xlsx` workbook to within $0.0001 (124 golden
 * tests pin every visible cell).
 *
 * TypeScript types mirror `scenarios/fthb/schemas.py` field-for-field.
 * If a Pydantic model changes, update the mirror here and the compile
 * will catch any drift in pages that consume it.
 */

// ---------------------------------------------------------------------------
// Request — FTHB inputs (~25 fields, server applies defaults)
// ---------------------------------------------------------------------------

export interface FTHBInputs {
  // Financial Profile
  annual_household_income: number
  monthly_debt_obligations: number
  available_cash_for_purchase: number
  universal_down_payment: number
  estimated_credit_score: number

  // Home Goals
  current_monthly_rent: number
  starter_home_price: number
  preferred_home_price: number
  horizon_years: number

  // System Assumptions
  mortgage_rate: number                    // decimal (0.0575 = 5.75%)
  mortgage_term_months: number
  purchase_closing_cost_pct: number
  property_tax_annual_pct: number
  insurance_annual_pct: number
  monthly_hoa: number
  maintenance_annual_pct: number
  annual_home_appreciation: number
  annual_rent_inflation: number
  return_on_unspent_cash: number
  max_dti: number
  post_close_cushion_pct: number
  min_post_close_cushion: number
  available_dpa: number
  delay_monthly_savings: number
  take_home_pct: number
}

/**
 * Defaults mirror Excel column B of the FTHB workbook. Keep in
 * lockstep with `FTHBInputsRequest` defaults in
 * scenarios/fthb/schemas.py.
 */
export const DEFAULT_FTHB_INPUTS: FTHBInputs = {
  annual_household_income: 185_000,
  monthly_debt_obligations: 850,
  available_cash_for_purchase: 90_000,
  universal_down_payment: 65_000,
  estimated_credit_score: 735,

  current_monthly_rent: 3_500,
  starter_home_price: 550_000,
  preferred_home_price: 700_000,
  horizon_years: 7,

  mortgage_rate: 0.0575,
  mortgage_term_months: 360,
  purchase_closing_cost_pct: 0.03,
  property_tax_annual_pct: 0.01,
  insurance_annual_pct: 0.0025,
  monthly_hoa: 75,
  maintenance_annual_pct: 0.01,
  annual_home_appreciation: 0.03,
  annual_rent_inflation: 0.035,
  return_on_unspent_cash: 0.03,
  max_dti: 0.45,
  post_close_cushion_pct: 0.10,
  min_post_close_cushion: 5_000,
  available_dpa: 15_000,
  delay_monthly_savings: 1_500,
  take_home_pct: 0.70,
}

// ---------------------------------------------------------------------------
// Response — per-scenario results
// ---------------------------------------------------------------------------

export interface ContinueRentingOut {
  current_monthly_rent: number
  annual_rent_inflation: number
  horizon_years: number
  cumulative_rent_paid: number
  future_value_of_available_cash: number
  total_net_position: number
  monthly_housing_cost_today: number
  cash_required_now: number
  cash_remaining_now: number
  feasibility_status: string
  risk_level: string
  residual_monthly_savings: number
  projected_savings_accumulation: number
}

/**
 * Shared response shape used by Buy Starter, Buy Preferred, and Buy
 * with Assistance. The three differ only in their inputs (price,
 * +50bps rate, DPA cash & repayment) — the output schema is identical.
 */
export interface BuyScenarioOut {
  target_purchase_price: number
  universal_down_payment: number
  purchase_closing_costs: number
  assistance_benefit: number
  total_cash_required_at_close: number
  cash_remaining_after_close: number
  new_loan_amount: number
  monthly_principal_and_interest: number
  monthly_property_tax: number
  monthly_insurance: number
  monthly_hoa: number
  monthly_maintenance: number
  total_monthly_housing_payment: number
  dti: number
  future_home_value: number
  future_loan_balance: number
  net_equity_at_horizon: number
  future_value_of_remaining_cash: number
  total_net_position: number
  liquidity_cushion_threshold: number
  feasibility_status: string
  risk_level: string
  residual_monthly_savings: number
  projected_savings_accumulation: number
}

export interface DelayOut {
  recommended_delay_months: number
  projected_additional_savings: number
  projected_available_cash_after_delay: number
  starter_cash_required_today: number
  projected_cash_surplus_or_shortfall: number
  expected_future_feasibility: string
  risk_level: string
  total_net_position: number
  residual_monthly_savings_while_renting: number
  projected_remaining_period_savings: number
}

// ---------------------------------------------------------------------------
// Response — Decision Map
// ---------------------------------------------------------------------------

export interface ScenarioComparisonRowOut {
  scenario: string
  net_position: number
  monthly_cost: number | null         // null for Delay (Excel writes "N/A")
  residual_monthly_savings: number
  savings_accumulation: number
  cash_required: number
  cash_remaining: number
  dti: number | null                  // null for Continue Renting + Delay
  equity_at_horizon: number
  feasibility: string
  risk: string
}

export interface RecommendationSnapshotOut {
  best_executable_path: string
  best_net_position: number
  best_monthly_affordability: string
  best_savings_capacity: string
  lowest_cash_required: string
  actionable_insight: string
}

export interface DecisionMapOut {
  comparison: ScenarioComparisonRowOut[]
  recommendation: RecommendationSnapshotOut
}

// ---------------------------------------------------------------------------
// Response — Audit
// ---------------------------------------------------------------------------

export interface AuditCheckOut {
  name: string
  status: 'PASS' | 'CHECK'
  notes: string
}

export interface AuditReportOut {
  checks: AuditCheckOut[]
  all_passed: boolean
}

// ---------------------------------------------------------------------------
// Response — full engine
// ---------------------------------------------------------------------------

export interface RunAllResponse {
  continue_renting: ContinueRentingOut
  buy_starter: BuyScenarioOut
  buy_preferred: BuyScenarioOut
  buy_with_assistance: BuyScenarioOut
  delay_purchase: DelayOut
  decision_map: DecisionMapOut
  audit: AuditReportOut
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/**
 * Run the full FTHB engine — returns all 5 scenarios, the Decision
 * Map, and the Audit report in one call. The page uses this on every
 * Recalculate; one round-trip keeps the UI consistent across all
 * surfaces (comparison, scenario detail, recommendation, audit).
 *
 * FTHB endpoints are public (no auth required) — pure computation
 * with no persistence.
 */
export async function runAllFthb(inputs: FTHBInputs): Promise<RunAllResponse> {
  const res = await fetch('/api/fthb/scenarios/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs),
  })
  if (!res.ok) {
    const msg = await safeError(res)
    throw new Error(msg || `FTHB run-all failed (${res.status})`)
  }
  return res.json()
}

/**
 * Decision-map-only call. Cheaper payload than runAllFthb — useful
 * when the UI only needs the comparison + recommendation (e.g. for a
 * compact summary card).
 */
export async function runFthbDecisionMap(
  inputs: FTHBInputs,
): Promise<DecisionMapOut> {
  const res = await fetch('/api/fthb/scenarios/decision-map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs),
  })
  if (!res.ok) {
    const msg = await safeError(res)
    throw new Error(msg || `FTHB decision-map failed (${res.status})`)
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
