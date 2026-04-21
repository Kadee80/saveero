/**
 * Scenario API client — talks to the FastAPI scenario engine at /api/scenarios/*.
 *
 * The engine is a bit-for-bit port of the client-supplied
 * `FINAL_V1_Protected_Home Decision_Model` Excel workbook. Every number
 * returned here ties to an Excel cell to within $0.0001.
 *
 * All endpoints are POST. The full run returns 5 scenarios + a Decision Map
 * + an Audit report. Per-scenario endpoints exist on the backend as well
 * but are not exposed here yet — the UI only consumes the run-all.
 *
 * TypeScript types mirror `scenarios/schemas.py` field-for-field. If a
 * Pydantic model changes, update the mirror below and the compile will
 * catch any drift in the pages that consume it.
 */

// ---------------------------------------------------------------------------
// Request — master inputs (45 fields, all optional; server applies defaults)
// ---------------------------------------------------------------------------

export interface MasterInputs {
  hold_years: number
  current_home_value: number
  current_mortgage_balance: number
  current_mortgage_rate: number            // decimal, e.g. 0.067 for 6.7%
  remaining_term_months: number
  monthly_property_tax: number
  monthly_insurance: number
  monthly_hoa: number
  monthly_maintenance: number

  annual_appreciation: number
  selling_cost_pct: number
  marginal_tax_rate: number
  land_value_pct: number

  refinance_rate: number
  refinance_term_months: number
  refinance_closing_cost_pct: number
  refinance_closing_costs_financed: boolean

  target_new_home_value: number
  new_down_payment_pct: number
  new_mortgage_rate: number
  new_mortgage_term_months: number
  purchase_closing_cost_pct: number
  moving_cost: number
  cash_reserve_held_back: number

  gross_monthly_rent: number
  vacancy_rate: number
  management_fee_pct: number
  maintenance_reserve_pct: number
  other_rental_expense_monthly: number
  make_ready_cost: number

  new_home_monthly_property_tax: number
  new_home_monthly_insurance: number
  new_home_monthly_hoa: number
  new_home_monthly_maintenance: number

  available_cash_for_purchase: number
}

/**
 * Defaults mirror Excel column B. Keep in lockstep with
 * `MasterInputsRequest` defaults in scenarios/schemas.py.
 */
export const DEFAULT_INPUTS: MasterInputs = {
  hold_years: 5.0,
  current_home_value: 750_000,
  current_mortgage_balance: 400_000,
  current_mortgage_rate: 0.067,
  remaining_term_months: 300,
  monthly_property_tax: 750,
  monthly_insurance: 150,
  monthly_hoa: 150,
  monthly_maintenance: 250,

  annual_appreciation: 0.03,
  selling_cost_pct: 0.07,
  marginal_tax_rate: 0.35,
  land_value_pct: 0.20,

  refinance_rate: 0.0575,
  refinance_term_months: 360,
  refinance_closing_cost_pct: 0.025,
  refinance_closing_costs_financed: true,

  target_new_home_value: 900_000,
  new_down_payment_pct: 0.20,
  new_mortgage_rate: 0.06,
  new_mortgage_term_months: 360,
  purchase_closing_cost_pct: 0.02,
  moving_cost: 15_000,
  cash_reserve_held_back: 25_000,

  gross_monthly_rent: 3_800,
  vacancy_rate: 0.05,
  management_fee_pct: 0.08,
  maintenance_reserve_pct: 0.08,
  other_rental_expense_monthly: 150,
  make_ready_cost: 2_500,

  new_home_monthly_property_tax: 900,
  new_home_monthly_insurance: 175,
  new_home_monthly_hoa: 150,
  new_home_monthly_maintenance: 300,

  available_cash_for_purchase: 150_000,
}

// ---------------------------------------------------------------------------
// Response — per-scenario results
// ---------------------------------------------------------------------------

export interface StayOut {
  current_monthly_pi: number
  monthly_property_tax: number
  monthly_insurance: number
  monthly_hoa: number
  monthly_maintenance: number
  total_monthly_ownership_cost: number
  future_home_value: number
  future_mortgage_balance: number
  gross_equity: number
  selling_costs_at_horizon: number
  net_equity_at_horizon: number
  total_net_position: number
}

export interface RefinanceOut {
  current_monthly_pi: number
  refinance_closing_costs: number
  refinance_closing_costs_financed: number
  new_loan_amount: number
  new_monthly_pi: number
  monthly_payment_change: number
  cash_to_close: number
  break_even_months: number | null
  future_home_value: number
  future_refinance_loan_balance: number
  gross_equity: number
  selling_costs_at_horizon: number
  net_equity_at_horizon: number
  cumulative_payment_savings: number
  total_net_position: number
  monthly_property_tax: number
  monthly_insurance: number
  monthly_hoa: number
  monthly_maintenance: number
  total_monthly_ownership_cost: number
}

export interface SellBuyOut {
  current_home_sale_price: number
  current_home_selling_costs: number
  current_mortgage_payoff: number
  net_sale_proceeds_before_reserve: number
  cash_reserve_held_back: number
  cash_available_for_next_purchase: number
  target_new_home_value: number
  required_down_payment: number
  new_purchase_loan_amount: number
  purchase_closing_costs: number
  moving_cost: number
  cash_remaining_at_close: number
  new_monthly_pi: number
  future_new_home_value: number
  future_new_mortgage_balance: number
  gross_equity: number
  selling_costs_at_horizon: number
  net_equity_at_horizon: number
  total_net_position: number
  new_home_monthly_property_tax: number
  new_home_monthly_insurance: number
  new_home_monthly_hoa: number
  new_home_monthly_maintenance: number
  total_monthly_ownership_cost: number
  monthly_ownership_cost_change_vs_stay: number
}

export interface RentMonthlyFlowOut {
  gross_monthly_rent: number
  vacancy_allowance: number
  effective_rent_collected: number
  management_fee: number
  maintenance_reserve: number
  other_rental_expense: number
  monthly_property_tax: number
  monthly_insurance: number
  monthly_hoa: number
  total_operating_expenses_before_debt: number
  current_monthly_pi: number
  monthly_cash_flow_before_tax: number
}

export interface RentTaxViewOut {
  mortgage_balance_after_12_months: number
  first_year_mortgage_interest_deduction: number
  annual_depreciation: number
  annual_taxable_rental_income: number
  annual_tax_benefit: number
  monthly_tax_benefit: number
  monthly_cash_flow_after_tax: number
}

export interface RentOut {
  monthly_flow: RentMonthlyFlowOut
  tax_view: RentTaxViewOut
  future_home_value: number
  future_mortgage_balance: number
  gross_equity: number
  selling_costs_at_horizon: number
  net_equity_at_horizon: number
  cumulative_after_tax_rental_cash_flow: number
  make_ready_cost: number
  total_net_position: number
}

export type LiquidityStatus = 'Feasible' | 'Stretch' | 'Not viable'

export interface RentOutBuyOut {
  monthly_flow: RentMonthlyFlowOut
  tax_view: RentTaxViewOut
  target_new_home_value: number
  required_down_payment: number
  new_purchase_loan_amount: number
  purchase_closing_costs: number
  moving_cost: number
  total_upfront_cash_needed: number
  new_monthly_pi: number
  new_home_monthly_property_tax: number
  new_home_monthly_insurance: number
  new_home_monthly_hoa: number
  new_home_monthly_maintenance: number
  total_new_home_monthly_ownership_cost: number
  net_monthly_housing_cost_before_tax: number
  net_monthly_housing_cost_after_tax: number
  monthly_housing_cost_change_vs_stay: number
  after_tax_monthly_impact_vs_stay: number
  future_current_home_value: number
  future_current_mortgage_balance: number
  current_home_gross_equity: number
  current_home_selling_costs_at_horizon: number
  current_home_net_equity_at_horizon: number
  future_new_home_value: number
  future_new_mortgage_balance: number
  new_home_gross_equity: number
  new_home_selling_costs_at_horizon: number
  new_home_net_equity_at_horizon: number
  cumulative_after_tax_rental_cash_flow: number
  make_ready_cost: number
  total_net_position: number
  available_cash_for_purchase: number
  cash_surplus_or_shortfall: number
  liquidity_status: LiquidityStatus
  execution_note: string
}

// ---------------------------------------------------------------------------
// Response — Decision Map
// ---------------------------------------------------------------------------

export interface ComparisonRowOut {
  stay: number
  refinance: number
  sell_buy: number
  rent: number
  rent_out_buy: number
}

export interface RentDriverBreakdownOut {
  current_net_equity_today: number
  net_appreciation_after_selling_costs: number
  principal_paydown_over_hold_period: number
  cumulative_after_tax_rental_cash_flow: number
  initial_make_ready_cost: number
  total_net_position: number
}

export interface RecommendationSnapshotOut {
  best_financial_outcome: string
  best_total_net_position: number
  best_for_monthly_affordability: string
  simplest_path: string
  plain_english_insight: string
}

export interface PriorityRankingsOut {
  max_wealth: string
  monthly_affordability: string
  simplicity: string
  move_lifestyle_change: string
}

export interface FeasibilityFlagsOut {
  top_ranked_scenario: string
  requires_monthly_subsidy: string
  complexity: 'Low' | 'Medium' | 'High'
  monthly_figure_to_watch: number
  rent_out_buy_liquidity_status: string
  rent_out_buy_upfront_cash_required: number
  available_cash_for_new_purchase: number
  cash_surplus_or_shortfall: number
}

export interface DecisionMapOut {
  selected_hold_period_years: number
  monthly_all_in_impact_vs_today: ComparisonRowOut
  after_tax_monthly_impact_vs_today: ComparisonRowOut
  net_equity_if_sold_at_horizon: ComparisonRowOut
  total_net_position: ComparisonRowOut
  rent_driver_breakdown: RentDriverBreakdownOut
  recommendation: RecommendationSnapshotOut
  priority_rankings: PriorityRankingsOut
  feasibility_flags: FeasibilityFlagsOut
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
  stay: StayOut
  refinance: RefinanceOut
  sell_buy: SellBuyOut
  rent: RentOut
  rent_out_buy: RentOutBuyOut
  decision_map: DecisionMapOut
  audit: AuditReportOut
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/**
 * Run the full scenario engine — returns all 5 scenarios, the Decision
 * Map, and the Audit report in one call. This is what the Decision Map
 * page uses on every Recalculate.
 *
 * Scenario engine endpoints are public (no auth required) — they are pure
 * computation with no persistence.
 */
export async function runAll(inputs: MasterInputs): Promise<RunAllResponse> {
  const res = await fetch('/api/scenarios/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs),
  })
  if (!res.ok) {
    const msg = await safeError(res)
    throw new Error(msg || `run-all failed (${res.status})`)
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
