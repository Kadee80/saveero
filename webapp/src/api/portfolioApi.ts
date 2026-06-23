/**
 * Typed client for the Portfolio Strategy Engine API.
 *
 * V1 surface:
 *   POST /api/portfolio/run — full engine (analytics + target + strategies + dashboard)
 *
 * No auth required for run; persistence endpoints will follow the FTHB
 * pattern (POST/GET/DELETE /api/portfolio/analyses) in a follow-up.
 *
 * @module api/portfolioApi
 */

// ---------------------------------------------------------------------------
// Enum unions — mirror portfolio/inputs.py
// ---------------------------------------------------------------------------

export type CreditBucket = '740+' | '700-739' | '660-699' | '<660'
export type IncomeProfile = 'W-2' | 'Self-Employed' | 'Mixed' | 'Retired' | 'Other'
export type GoalObjective =
  | 'Build Wealth'
  | 'Generate Passive Income'
  | 'Preserve Liquidity'
  | 'Minimize Risk'
export type RiskTolerance = 'Conservative' | 'Moderate' | 'Aggressive'
export type TimeHorizon = '1-2 Years' | '3-4 Years' | '5 Years' | '5-7 Years' | '10+ Years'
export type TargetPropertyType =
  | 'Long-Term Rental'
  | 'Short-Term Rental'
  | 'Residential Multifamily (2-4 Units)'
  | 'Commercial Multifamily (5+ Units)'
  | 'Vacation Home'
  | 'Fix & Flip'
export type PropertyUse = 'Owner-Occupied' | 'Rented' | 'Vacant' | 'Second Home' | 'Other'

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export interface PortfolioProfileIn {
  credit_score_bucket: CreditBucket
  income_profile: IncomeProfile
  available_cash: number
  investor_goal: GoalObjective
  risk_tolerance: RiskTolerance
  time_horizon: TimeHorizon
  expected_annual_appreciation: number
  estimated_acquisition_closing_costs_pct: number
  target_down_payment_pct: number
}

export interface ExistingPropertyIn {
  property_type: string
  use_status: PropertyUse
  current_value: number
  mortgage_balance: number
  current_rate?: number
  monthly_pi?: number
  monthly_taxes_ins_hoa?: number
  monthly_rent?: number
  monthly_operating_expenses?: number
  notes?: string
}

export interface TargetPropertyIn {
  target_property_type: TargetPropertyType
  target_purchase_price: number
  expected_monthly_rent_or_revenue: number
  expected_monthly_taxes_ins_hoa: number
  expected_operating_expenses: number
  estimated_interest_rate: number
  amortization_years: number
  rehab_budget?: number
  holding_costs?: number
  arv?: number
  sale_costs_pct?: number
}

export interface RunPortfolioRequest {
  profile: PortfolioProfileIn
  existing_properties: ExistingPropertyIn[]
  target_property: TargetPropertyIn
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

export interface PropertyAnalyticsOut {
  property_type: string
  value: number
  mortgage_balance: number
  equity: number
  ltv: number
  monthly_pi: number
  pitia: number
  rent: number
  operating_expenses: number
  monthly_cash_flow: number
  dscr: number
  heloc_accessible_equity: number
  cash_out_accessible_equity: number
  dscr_no_ratio_accessible_equity: number
}

export interface PortfolioSummaryOut {
  total_property_value: number
  total_mortgage_balance: number
  total_equity: number
  total_monthly_rent: number
  total_monthly_pitia: number
  total_monthly_cash_flow: number
  total_heloc_accessible_equity: number
  total_cash_out_accessible_equity: number
  total_dscr_no_ratio_accessible_equity: number
}

export interface PortfolioAnalyticsOut {
  properties: PropertyAnalyticsOut[]
  summary: PortfolioSummaryOut
}

export interface TargetMetricsOut {
  down_payment_pct: number
  down_payment_needed: number
  closing_costs_needed: number
  total_capital_needed: number
  loan_amount: number
  monthly_pi: number
  pitia: number
  dscr: number
  monthly_cash_flow: number
  projected_flip_profit: number
  projected_flip_gross_roi: number
  property_type_fit_score: number
  dscr_relevant: boolean
  bridge_hard_money_relevant: boolean
  preferred_financing_theme: string
  property_type_logic_note: string
}

export type StrategyKey =
  | 'use_available_cash'
  | 'heloc_on_existing_equity'
  | 'conventional_cash_out'
  | 'dscr_cash_out_on_rental'
  | 'no_ratio_asset_based_cash_out'
  | 'sell_and_redeploy'
  | 'combination_strategy'
  | 'bridge_hard_money_private_capital'

export interface ScoredStrategyOut {
  key: StrategyKey
  name: string
  // Capital math (context, not weighted directly)
  capital_available: number
  capital_needed: number
  capital_coverage_pct: number
  // The seven scoring dimensions — Van's canonical names. Renaming
  // requires changing portfolio/strategy_scoring.py + schemas.py in
  // lockstep with this file.
  capital_availability: number
  credit_fit: number
  liquidity_preservation: number
  cash_flow_impact: number
  long_term_wealth_impact: number
  complexity: number
  risk: number
  // Final
  weighted_score: number
  rank: number
  // Consumer language
  consumer_output: string
  capital_check: string
  key_tradeoff: string
  recommendation_type: string
  property_type_note: string
  product_logic_fit: string
}

export interface DashboardOut {
  target_property_type: string
  property_type_logic: string
  total_equity: number
  estimated_accessible_equity: number
  portfolio_monthly_cash_flow: number
  target_property_dscr: number
  capital_needed: number
  target_monthly_cash_flow_or_flip_profit: number
  recommended_path: string
  recommended_score: number
  alternative_path: string | null
  alternative_score: number | null
  consumer_explanation: string
  primary_tradeoff: string
  property_type_note: string
  suggested_next_step: string
}

export interface RunPortfolioResponse {
  portfolio: PortfolioAnalyticsOut
  target_metrics: TargetMetricsOut
  strategies: ScoredStrategyOut[]
  dashboard: DashboardOut
}

// ---------------------------------------------------------------------------
// Single API call
// ---------------------------------------------------------------------------

/**
 * Run the full Portfolio Strategy Engine.
 *
 * Stateless on the backend; no auth required. Returns the full bundle
 * the results page needs to render.
 */
export async function runPortfolio(
  body: RunPortfolioRequest,
): Promise<RunPortfolioResponse> {
  const res = await fetch('/api/portfolio/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let msg = `Portfolio run failed (${res.status})`
    try {
      const body = (await res.json()) as { detail?: string }
      if (typeof body?.detail === 'string') msg = body.detail
    } catch {
      // ignore
    }
    throw new Error(msg)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Seeded sample inputs — matches the workbook's V4.1 sample so the
// PortfolioBuilder page renders meaningfully on first load.
// ---------------------------------------------------------------------------

export const SAMPLE_PORTFOLIO_INPUTS: RunPortfolioRequest = {
  profile: {
    credit_score_bucket: '700-739',
    income_profile: 'Self-Employed',
    available_cash: 75_000,
    investor_goal: 'Build Wealth',
    risk_tolerance: 'Moderate',
    time_horizon: '5 Years',
    expected_annual_appreciation: 0.03,
    estimated_acquisition_closing_costs_pct: 0.03,
    target_down_payment_pct: 0.25,
  },
  existing_properties: [
    {
      property_type: 'Primary Residence',
      use_status: 'Owner-Occupied',
      current_value: 750_000,
      mortgage_balance: 420_000,
      current_rate: 0.035,
      monthly_pi: 1885,
      monthly_taxes_ins_hoa: 850,
      monthly_rent: 0,
      monthly_operating_expenses: 0,
      notes: 'Current home',
    },
    {
      property_type: 'Investment Property',
      use_status: 'Rented',
      current_value: 525_000,
      mortgage_balance: 310_000,
      current_rate: 0.0625,
      monthly_pi: 1909,
      monthly_taxes_ins_hoa: 700,
      monthly_rent: 3600,
      monthly_operating_expenses: 450,
      notes: 'Existing rental',
    },
  ],
  target_property: {
    target_property_type: 'Long-Term Rental',
    target_purchase_price: 500_000,
    expected_monthly_rent_or_revenue: 3_800,
    expected_monthly_taxes_ins_hoa: 750,
    expected_operating_expenses: 500,
    estimated_interest_rate: 0.075,
    amortization_years: 30,
  },
}
