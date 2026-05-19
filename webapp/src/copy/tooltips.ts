/**
 * Tooltip copy — single source of truth for every "?" tip in the app.
 *
 * Slugs are namespaced by surface so a grep for "decisionmap." lights up
 * every Decision-Map tooltip:
 *
 *   decisionmap.input.<field_key>    Decision-Map wizard input fields
 *   decisionmap.metric.<metric_key>  Decision-Map result-card line items
 *   fthb.input.<field_key>           FTHB wizard input fields
 *   fthb.metric.<metric_key>         FTHB result-card / scenario line items
 *   compare.metric.<row_key>         ComparisonTable row labels (both engines)
 *
 * Copy style — one or two sentences max, plain English, "why this matters"
 * framing where useful. Never echoes the label verbatim. No jargon without
 * an inline gloss. Van can edit any line here without touching components.
 */

export const TOOLTIPS = {
  // --------------------------------------------------------------------
  // Decision Map — inputs
  // --------------------------------------------------------------------

  'decisionmap.input.hold_years':
    "How many years you plan to keep things as they are before re-evaluating. Every comparison rolls forward to this horizon — a shorter hold favors low-closing-cost paths like Stay; a longer hold favors paths that build equity.",
  'decisionmap.input.current_home_value':
    "What your home would sell for today, not what you paid for it. Drives the appreciation math and your starting equity.",
  'decisionmap.input.current_mortgage_balance':
    "What you owe on the mortgage right now. Your current equity is roughly home value minus this number.",
  'decisionmap.input.current_mortgage_rate':
    "Your existing mortgage's interest rate. Set the benchmark a refinance has to beat to be worthwhile.",
  'decisionmap.input.remaining_term_months':
    "Months left on your current mortgage. Used to track principal paydown over the hold period.",
  'decisionmap.input.monthly_property_tax':
    "What you pay each month in property taxes (annual bill ÷ 12). Stays with you in Stay and Refinance; replaced by the new home's tax in Sell & Buy.",
  'decisionmap.input.monthly_insurance':
    "Homeowner's insurance premium per month. Often escrowed inside your mortgage payment — check your statement.",
  'decisionmap.input.monthly_hoa':
    "HOA / condo dues per month. Enter zero if you have none.",
  'decisionmap.input.monthly_maintenance':
    "Realistic monthly upkeep — a common rule of thumb is 1% of home value per year ÷ 12. Most people under-estimate this.",
  'decisionmap.input.annual_appreciation':
    "How much you expect the home to gain in value each year. The model compounds this over the hold period. Historical US average is roughly 3–4%/yr; your local market may differ.",
  'decisionmap.input.selling_cost_pct':
    "Agent commissions + closing costs as a percentage of sale price. Typical range is 6–8%. Subtracted before showing 'net equity if sold.'",
  'decisionmap.input.marginal_tax_rate':
    "Your top federal + state income-tax bracket. Used to convert pre-tax rental income and mortgage-interest deductions into after-tax dollars.",
  'decisionmap.input.land_value_pct':
    "Share of your home's value that the IRS considers land (non-depreciable). Only the building portion can be depreciated against rental income — typical split is 20–30% land.",
  'decisionmap.input.refinance_rate':
    "The new interest rate you'd get on a refinance. Get a real quote — small differences here move the answer a lot.",
  'decisionmap.input.refinance_term_months':
    "Length of the new mortgage after refinancing, in months. 360 = 30 years, 180 = 15 years.",
  'decisionmap.input.refinance_closing_cost_pct':
    "Refi closing costs as a percentage of the new loan amount. Typical is 2–3%. These determine your break-even — when monthly savings start outweighing the upfront cost.",
  'decisionmap.input.refinance_closing_costs_financed':
    "If yes, closing costs get rolled into the new loan balance (no cash out of pocket, but you pay interest on them). If no, you pay them at closing.",
  'decisionmap.input.target_new_home_value':
    "Purchase price of the home you'd buy in the Sell & Buy or Rent Out & Buy scenarios.",
  'decisionmap.input.new_down_payment_pct':
    "What share of the new home's price you'd put down in cash. 20% avoids private mortgage insurance; lower is allowed but increases monthly cost.",
  'decisionmap.input.new_mortgage_rate':
    "The interest rate on the new purchase mortgage. Different from the refi rate above because purchase and refinance markets price slightly differently.",
  'decisionmap.input.new_mortgage_term_months':
    "Length of the new purchase mortgage, in months. 360 = 30 years.",
  'decisionmap.input.purchase_closing_cost_pct':
    "Closing costs on the new purchase as a percent of price. Typical is 2–4%. Comes out of the cash available at closing.",
  'decisionmap.input.moving_cost':
    "Movers, deposits, set-up, the new couch you'll need — your full one-time moving spend.",
  'decisionmap.input.cash_reserve_held_back':
    "Cash you'd intentionally keep on the sidelines after closing (emergency fund, redecorating budget). Reduces what's available for down payment.",
  'decisionmap.input.new_home_monthly_property_tax':
    "Property tax on the new home, per month. Often higher than your current bill because reassessments happen at sale.",
  'decisionmap.input.new_home_monthly_insurance':
    "Insurance on the new home, per month.",
  'decisionmap.input.new_home_monthly_hoa':
    "HOA / condo dues on the new home, per month.",
  'decisionmap.input.new_home_monthly_maintenance':
    "Expected upkeep on the new home, per month. Newer construction tends to be lower; older homes higher.",
  'decisionmap.input.gross_monthly_rent':
    "What you could realistically rent your current home for, per month, before any vacancy or fees. Use comparable listings, not aspirational pricing.",
  'decisionmap.input.vacancy_rate':
    "Share of the year the unit sits empty between tenants. 5–8% is a common assumption.",
  'decisionmap.input.management_fee_pct':
    "What a property manager would take as a percent of collected rent. Typical full-service is 8–10%. Set to zero if you'd self-manage.",
  'decisionmap.input.maintenance_reserve_pct':
    "Money set aside each month for repairs, as a percent of rent. 5–10% is typical.",
  'decisionmap.input.other_rental_expense_monthly':
    "Anything else recurring — landlord insurance premium delta, license fees, lawn care — per month.",
  'decisionmap.input.make_ready_cost':
    "One-time cost to get the place rent-ready: paint, cleaning, small repairs, appliance fixes.",
  'decisionmap.input.available_cash_for_purchase':
    "How much cash you'd actually have to put toward the new purchase, after holding back any reserves. Caps how aggressive a Rent Out & Buy plan can be.",

  // --------------------------------------------------------------------
  // Decision Map — result-card metrics
  // --------------------------------------------------------------------

  'decisionmap.metric.current_monthly_pi':
    "Principal & interest portion of your monthly mortgage payment. Excludes taxes, insurance, HOA, and maintenance.",
  'decisionmap.metric.total_monthly_ownership_cost':
    "What this scenario costs you each month, all in — P&I + property tax + insurance + HOA + maintenance.",
  'decisionmap.metric.future_home_value':
    "Projected home value at the end of the hold period, compounding your appreciation assumption.",
  'decisionmap.metric.future_mortgage_balance':
    "What you'll still owe at the end of the hold period after years of principal paydown.",
  'decisionmap.metric.gross_equity':
    "Future home value minus future mortgage balance — before selling costs.",
  'decisionmap.metric.net_equity_at_horizon':
    "Cash you'd actually walk away with if you sold at the horizon — after agent fees and closing costs.",
  'decisionmap.metric.total_net_position':
    "Best single comparison number: equity at horizon plus cumulative cash flow (rental income, payment savings) minus one-time costs.",
  'decisionmap.metric.new_loan_amount':
    "Size of the refinanced or new purchase mortgage. For refi this includes financed closing costs if you opted in above.",
  'decisionmap.metric.new_monthly_pi':
    "Monthly principal & interest on the new loan.",
  'decisionmap.metric.monthly_payment_change':
    "How much your monthly P&I would shift versus today. Negative means you save each month.",
  'decisionmap.metric.cash_to_close':
    "Out-of-pocket cash needed at the refinance closing. Zero if you financed the closing costs into the loan.",
  'decisionmap.metric.break_even_months':
    "Months until cumulative monthly savings cover the closing costs. If you'd move before this, the refi isn't worth it.",
  'decisionmap.metric.cumulative_payment_savings':
    "Total monthly savings over the whole hold period, after the closing-cost hurdle.",
  'decisionmap.metric.net_sale_proceeds_before_reserve':
    "Cash from selling the current home, after paying off the mortgage and selling costs, before you set anything aside.",
  'decisionmap.metric.cash_available_for_next_purchase':
    "Sale proceeds minus the cash reserve you'd hold back. This is what's left for down payment, closing, and moving.",
  'decisionmap.metric.required_down_payment':
    "Down-payment dollars needed on the new home, given your down-payment % and the target price.",
  'decisionmap.metric.new_purchase_loan_amount':
    "Size of the mortgage on the new purchase (price minus down payment).",
  'decisionmap.metric.cash_remaining_at_close':
    "Cash left over after paying down payment, closing costs, and moving. Negative means you'd need to bring more cash.",
  'decisionmap.metric.monthly_ownership_cost_change_vs_stay':
    "How much more (or less) you'd spend per month versus staying put. Positive = more expensive.",
  'decisionmap.metric.effective_rent_collected':
    "Gross rent reduced for expected vacancy — what you'd actually collect on average each month.",
  'decisionmap.metric.total_operating_expenses_before_debt':
    "All rental operating costs except the mortgage — management, maintenance reserve, taxes, insurance, HOA, other.",
  'decisionmap.metric.monthly_cash_flow_before_tax':
    "Effective rent minus operating expenses minus P&I — what hits your bank account each month before taxes.",
  'decisionmap.metric.monthly_tax_benefit':
    "Per-month value of mortgage-interest deduction + depreciation, at your marginal tax rate. Reduces your effective tax bill from owning rental property.",
  'decisionmap.metric.monthly_cash_flow_after_tax':
    "Monthly cash flow with the tax benefit added back in. The truest 'this is what you keep' number.",
  'decisionmap.metric.cumulative_after_tax_rental_cash_flow':
    "All after-tax rental cash flow summed across the hold period.",
  'decisionmap.metric.total_upfront_cash_needed':
    "All cash required at signing for Rent Out & Buy: down payment + closing costs + moving + any make-ready on the rental.",
  'decisionmap.metric.available_cash_for_purchase':
    "Cash you said you have on hand, brought forward from the inputs.",
  'decisionmap.metric.cash_surplus_or_shortfall':
    "Available cash minus required cash. Positive = comfortable. Negative = you'd need to find more cash or change the plan.",
  'decisionmap.metric.net_monthly_housing_cost_before_tax':
    "What you'd actually spend monthly in Rent Out & Buy: new home's full payment minus the rental income from the old home.",
  'decisionmap.metric.net_monthly_housing_cost_after_tax':
    "Same as above, but with rental tax benefits applied.",
  'decisionmap.metric.after_tax_monthly_impact_vs_stay':
    "Net change to your monthly housing cost versus simply staying in your current home, after tax benefits.",
  'decisionmap.metric.current_home_net_equity_at_horizon':
    "Equity in your existing home at the end of the hold period, if you kept renting it the whole time then sold.",
  'decisionmap.metric.new_home_net_equity_at_horizon':
    "Equity in the new home at the end of the hold period.",

  // --------------------------------------------------------------------
  // ComparisonTable rows (shared)
  // --------------------------------------------------------------------

  'compare.metric.monthly_all_in_change':
    "Change in your monthly housing cost versus today, before tax considerations. Most-negative number wins on cash flow.",
  'compare.metric.after_tax_monthly_change':
    "Same comparison but factoring in mortgage-interest deductions and any rental-income tax benefits.",
  'compare.metric.net_equity_if_sold':
    "What you'd net if you sold every home in each scenario at the end of the hold period.",
  'compare.metric.total_net_position':
    "Headline scorecard: equity at horizon + cumulative cash flow − one-time costs. Highest number = biggest wealth outcome.",

  // --------------------------------------------------------------------
  // FTHB — inputs (keys match fthbApi.DEFAULT_FTHB_INPUTS exactly)
  // --------------------------------------------------------------------

  'fthb.input.annual_household_income':
    "Combined gross annual income for everyone on the loan, before tax. Drives how big a mortgage lenders will approve.",
  'fthb.input.monthly_debt_obligations':
    "Recurring monthly debt payments — student loans, auto, credit-card minimums. Lenders subtract this from the housing budget they'll qualify you for.",
  'fthb.input.available_cash_for_purchase':
    "All the cash you can put toward this purchase: down payment + closing costs + reserves. Don't include retirement accounts you won't tap.",
  'fthb.input.universal_down_payment':
    "The down-payment dollar amount applied to every buy scenario, so comparisons aren't muddied by also varying the down payment. 20% of price avoids PMI; FHA goes as low as 3.5%.",
  'fthb.input.estimated_credit_score':
    "Roughly where your credit lands today. Used as a sanity-check on rate/product assumptions — not a hard input to the math.",
  'fthb.input.current_monthly_rent':
    "What you pay in rent today. Anchors the Rent & Invest scenario — your monthly housing cost stays roughly here while the buy scenarios add ownership costs on top.",
  'fthb.input.starter_home_price':
    "Lower-entry-point target — the more conservative home you'd be willing to buy. Compared head-to-head against the Preferred home so you can see what stretching costs you.",
  'fthb.input.preferred_home_price':
    "The aspirational / 'reach' home price. Compared against Starter so you can see whether the extra cost is worth it given your income and timeline.",
  'fthb.input.horizon_years':
    "How long you'd plan to stay in the home before selling or re-evaluating. Buying rarely beats renting on short horizons because closing costs are front-loaded.",
  'fthb.input.mortgage_rate':
    "Today's mortgage rate for a buyer with your credit profile. A quick broker quote is more accurate than the headline rate online.",
  'fthb.input.mortgage_term_months':
    "Length of the mortgage, in months. 360 = 30 years (lower payment); 180 = 15 years (faster payoff, far less total interest).",
  'fthb.input.purchase_closing_cost_pct':
    "Closing costs as a percent of purchase price. Typical 2–4% — covers lender fees, title, inspections, escrow.",
  'fthb.input.property_tax_annual_pct':
    "Annual property tax as a percent of home value. US average is ~1.1%, but it ranges from 0.3% (HI) to 2.5%+ (NJ, IL). Check your county assessor.",
  'fthb.input.insurance_annual_pct':
    "Homeowner's insurance premium as a percent of home value, per year. Typical 0.3–0.6%; coastal/wildfire zones run higher.",
  'fthb.input.monthly_hoa':
    "HOA / condo dues per month. Zero for most single-family homes; can be substantial for condos.",
  'fthb.input.maintenance_annual_pct':
    "Money set aside for upkeep each year, as a percent of home value. 1% is the standard rule of thumb. Don't skip this — surprise repairs are the #1 first-year owner regret.",
  'fthb.input.annual_home_appreciation':
    "How fast you expect the home's value to grow each year. US long-run average is ~3–4%; high-cost markets have run faster but with more volatility.",
  'fthb.input.annual_rent_inflation':
    "How fast rent climbs each year if you keep renting. National average is 3–5%; check your lease or local data.",
  'fthb.input.return_on_unspent_cash':
    "Annual return on money you'd otherwise invest instead of using to buy. The Rent & Invest scenario compounds your residual savings at this rate for a fair head-to-head.",
  'fthb.input.take_home_pct':
    "Share of gross income you actually take home after taxes & retirement contributions. Used to gauge whether the monthly payment fits your real cash flow, not just your gross.",
  'fthb.input.max_dti':
    "Maximum debt-to-income ratio your lender will allow. 43% is the conventional ceiling; some FHA programs go higher.",
  'fthb.input.post_close_cushion_pct':
    "Share of your available cash you want left over after closing as a safety cushion. The model warns you if cash-to-close eats into this.",
  'fthb.input.min_post_close_cushion':
    "Absolute dollar floor for your post-close cash cushion. Whichever is larger — the percent or this dollar number — is the floor.",
  'fthb.input.available_dpa':
    "Downpayment assistance you qualify for — typically a second loan from a state/local program. Reduces what you bring to closing.",
  'fthb.input.delay_monthly_savings':
    "Extra cash you'd save each month during the 12-month delay scenario, in addition to your current rent payment. Drives how much bigger your down payment is if you wait a year.",

  // --------------------------------------------------------------------
  // FTHB — comparison table column headers
  // --------------------------------------------------------------------

  'fthb.compare.net_position':
    "Total wealth at the horizon: home equity + leftover cash growing at your assumed rate + ongoing monthly savings compounded. The headline scorecard — highest wins.",
  'fthb.compare.monthly_cost':
    "All-in monthly housing cost in each scenario. For rent scenarios that's rent; for buy scenarios it's P&I + taxes + insurance + HOA + maintenance.",
  'fthb.compare.residual_savings':
    "Money left over each month after paying for housing — flows into investments / emergency fund. The bigger this is, the faster wealth accumulates regardless of which scenario you pick.",
  'fthb.compare.cash_required':
    "Cash needed at closing in each scenario. Renting and Delay show zero because you're not buying.",
  'fthb.compare.equity_at_horizon':
    "Net equity in the home at the horizon, after projected appreciation and principal paydown. Zero for scenarios where you don't buy.",
  'fthb.compare.feasibility':
    "Whether the scenario is actually achievable for you today, based on DTI, cash-to-close, and post-close cushion checks.",
  'fthb.compare.risk':
    "Qualitative risk rating — combines stretch on monthly payment, post-close cushion thinness, and how much the plan depends on optimistic growth assumptions.",

  // --------------------------------------------------------------------
  // FTHB — per-scenario detail rows
  // --------------------------------------------------------------------

  'fthb.detail.cumulative_rent_paid':
    "Total rent dollars you'd pay over the horizon, with the assumed annual rent inflation applied each year.",
  'fthb.detail.fv_available_cash':
    "Future value of the cash you'd otherwise have spent on down payment, growing at your unspent-cash return assumption.",
  'fthb.detail.residual_savings':
    "Money left over each month after housing — added to your savings stack and compounded over the horizon.",
  'fthb.detail.projected_savings_accumulation':
    "Future value of all your monthly residual savings compounded at your return assumption. The bulk of long-term wealth comes from this in the rent scenarios.",
  'fthb.detail.total_net_position':
    "Headline wealth at the horizon. Compare this number across scenarios — highest is the best financial outcome.",
  'fthb.detail.cash_to_close':
    "Cash you'd hand over at closing: down payment + closing costs. Doesn't include reserves you'd keep on the sidelines.",
  'fthb.detail.loan_amount':
    "Mortgage principal at funding: purchase price minus down payment.",
  'fthb.detail.monthly_pi':
    "Principal & interest portion of the monthly mortgage payment. Excludes taxes, insurance, HOA, and maintenance.",
  'fthb.detail.all_in_monthly':
    "Full monthly housing cost: P&I + property tax + insurance + HOA + maintenance.",
  'fthb.detail.dti':
    "Debt-to-income — total housing payment + other debts divided by gross monthly income. Lenders typically cap at 43%; 36% or below is comfortable.",
  'fthb.detail.equity_at_horizon':
    "Net equity in the home at the horizon after projected appreciation and principal paydown.",
  'fthb.detail.extra_savings_wait':
    "Additional cash you'd save during the 12-month delay, beyond your current rent payment.",
  'fthb.detail.cash_after_delay':
    "Total cash on hand after waiting — your starting cash plus extra savings plus growth on what's already saved.",
  'fthb.detail.surplus_vs_starter':
    "How much more (or less) cash you'd have versus the starter-home scenario's cash-to-close. Positive means waiting gives you a real cushion.",
  'fthb.detail.future_net_position':
    "Projected wealth at the horizon if you delay one year then buy. Compare against the immediate-buy net positions to see whether waiting is actually worth it.",
} as const

export type TooltipSlug = keyof typeof TOOLTIPS

/**
 * Resolve a slug to its copy. Returns undefined for unknown slugs so the
 * HelpTip component can render nothing gracefully (rather than throwing or
 * showing a placeholder string).
 */
export function tooltipFor(slug: string | undefined | null): string | undefined {
  if (!slug) return undefined
  return (TOOLTIPS as Record<string, string>)[slug]
}
