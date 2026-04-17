"""
scenarios/decision_map.py

Decision Map — the cross-scenario comparison and recommendation logic.

Mirrors 'Outputs' sheet (rows 2–41) in the client's Excel model, which
includes:
  * Financial comparison table (monthly impact, after-tax monthly impact,
    net equity, total net position) across all 5 scenarios
  * Rent scenario driver breakdown (additive decomposition)
  * Recommendation snapshot (best financial, best monthly, simplest path,
    plain-English insight)
  * "How to think about this decision" priority-based rankings
  * Feasibility flags

Critical rule: Rent Out & Buy is EXCLUDED from the financial ranking
when its liquidity status is "Not viable".
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .inputs import MasterInputs
from .rent import RentResult
from .rent_out_buy import RentOutBuyResult
from .refinance import RefinanceResult
from .sell_buy import SellBuyResult
from .stay import StayResult


ScenarioName = Literal["Stay", "Refinance", "Sell + Buy", "Rent", "Rent Out & Buy"]


@dataclass(frozen=True)
class ComparisonRow:
    """One scenario's numbers in the Decision Map comparison table."""
    stay: float
    refinance: float
    sell_buy: float
    rent: float
    rent_out_buy: float


@dataclass(frozen=True)
class RentDriverBreakdown:
    """Additive decomposition of the Rent scenario's total net position."""
    current_net_equity_today: float
    net_appreciation_after_selling_costs: float
    principal_paydown_over_hold_period: float
    cumulative_after_tax_rental_cash_flow: float
    initial_make_ready_cost: float                 # negative (subtracted)
    total_net_position: float


@dataclass(frozen=True)
class RecommendationSnapshot:
    best_financial_outcome: ScenarioName
    best_total_net_position: float
    best_for_monthly_affordability: ScenarioName
    simplest_path: ScenarioName
    plain_english_insight: str


@dataclass(frozen=True)
class PriorityRankings:
    """'How to Think About This Decision' section — rows 28–31."""
    max_wealth: ScenarioName
    monthly_affordability: ScenarioName
    simplicity: ScenarioName
    move_lifestyle_change: ScenarioName


@dataclass(frozen=True)
class FeasibilityFlags:
    """'Feasibility Flags' section — rows 34–41."""
    top_ranked_scenario: ScenarioName
    requires_monthly_subsidy: str                  # "Yes" | "No" | "Depends on next housing cost"
    complexity: Literal["Low", "Medium", "High"]
    monthly_figure_to_watch: float
    rent_out_buy_liquidity_status: str
    rent_out_buy_upfront_cash_required: float
    available_cash_for_new_purchase: float
    cash_surplus_or_shortfall: float


@dataclass(frozen=True)
class DecisionMap:
    selected_hold_period_years: float
    monthly_all_in_impact_vs_today: ComparisonRow
    after_tax_monthly_impact_vs_today: ComparisonRow
    net_equity_if_sold_at_horizon: ComparisonRow
    total_net_position: ComparisonRow
    rent_driver_breakdown: RentDriverBreakdown
    recommendation: RecommendationSnapshot
    priority_rankings: PriorityRankings
    feasibility_flags: FeasibilityFlags


def compute_decision_map(
    inputs: MasterInputs,
    stay: StayResult,
    refinance: RefinanceResult,
    sell_buy: SellBuyResult,
    rent: RentResult,
    rent_out_buy: RentOutBuyResult,
) -> DecisionMap:
    """
    Compute the Decision Map given all five scenario results.

    Args:
        inputs: Master inputs (needed for selling cost % and hold period).
        stay/refinance/sell_buy/rent/rent_out_buy: Scenario outputs.
    """
    # --- Financial comparison rows ---

    # Excel Outputs!B5:F5 — Monthly all-in housing impact vs today
    # Stay: 0 (baseline)
    # Refi: stay.total_monthly - refi.total_monthly (row 27)
    # Sell+Buy: stay.total_monthly - sellbuy.total_monthly
    # Rent: stay.total_monthly + rent.cash_flow_before_tax  (positive rent cash flow makes impact smaller)
    # Rent Out & Buy: row 41 (change_vs_stay_pretax)
    monthly_impact = ComparisonRow(
        stay=0.0,
        refinance=stay.total_monthly_ownership_cost - refinance.total_monthly_ownership_cost,
        sell_buy=stay.total_monthly_ownership_cost - sell_buy.total_monthly_ownership_cost,
        rent=stay.total_monthly_ownership_cost + rent.monthly_flow.monthly_cash_flow_before_tax,
        rent_out_buy=rent_out_buy.monthly_housing_cost_change_vs_stay,
    )

    # Excel Outputs!B6:F6 — After-tax monthly impact
    after_tax_impact = ComparisonRow(
        stay=0.0,
        refinance=stay.total_monthly_ownership_cost - refinance.total_monthly_ownership_cost,
        sell_buy=stay.total_monthly_ownership_cost - sell_buy.total_monthly_ownership_cost,
        rent=stay.total_monthly_ownership_cost + rent.tax_view.monthly_cash_flow_after_tax,
        rent_out_buy=rent_out_buy.after_tax_monthly_impact_vs_stay,
    )

    # Excel Outputs!B7:F7 — Net equity if sold at horizon
    # Rent Out & Buy uses SUM of current + new home net equity
    net_equity = ComparisonRow(
        stay=stay.net_equity_at_horizon,
        refinance=refinance.net_equity_at_horizon,
        sell_buy=sell_buy.net_equity_at_horizon,
        rent=rent.net_equity_at_horizon,
        rent_out_buy=(
            rent_out_buy.current_home_net_equity_at_horizon
            + rent_out_buy.new_home_net_equity_at_horizon
        ),
    )

    # Excel Outputs!B8:F8 — Total net position
    total_net = ComparisonRow(
        stay=stay.total_net_position,
        refinance=refinance.total_net_position,
        sell_buy=sell_buy.total_net_position,
        rent=rent.total_net_position,
        rent_out_buy=rent_out_buy.total_net_position,
    )

    # --- Rent driver breakdown (rows 11–16) ---
    # Excel:
    #   B11: current net equity today = value*(1-selling%) - balance
    #   B12: net appreciation = (future_value - current_value) * (1 - selling%)
    #   B13: principal paydown = current_balance - future_balance
    #   B14: cumulative after-tax cash flow = Rent!B32
    #   B15: -make_ready
    #   B16: SUM
    current_net_equity_today = (
        inputs.current_home_value * (1 - inputs.selling_cost_pct)
        - inputs.current_mortgage_balance
    )
    net_appreciation = (
        (rent.future_home_value - inputs.current_home_value)
        * (1 - inputs.selling_cost_pct)
    )
    principal_paydown = inputs.current_mortgage_balance - rent.future_mortgage_balance
    neg_make_ready = -rent.make_ready_cost
    rent_driver_total = (
        current_net_equity_today + net_appreciation + principal_paydown
        + rent.cumulative_after_tax_rental_cash_flow + neg_make_ready
    )

    rent_drivers = RentDriverBreakdown(
        current_net_equity_today=current_net_equity_today,
        net_appreciation_after_selling_costs=net_appreciation,
        principal_paydown_over_hold_period=principal_paydown,
        cumulative_after_tax_rental_cash_flow=rent.cumulative_after_tax_rental_cash_flow,
        initial_make_ready_cost=neg_make_ready,
        total_net_position=rent_driver_total,
    )

    # --- Recommendation snapshot ---
    rent_out_buy_viable = rent_out_buy.liquidity_status != "Not viable"

    # Excel Outputs!B19 — argmax of total_net_position, excluding Rent Out & Buy if Not viable
    #   Tie-breaker: Stay > Refi > Sell+Buy > Rent > Rent Out & Buy (sheet's nested IF order)
    candidates: list[tuple[ScenarioName, float]] = [
        ("Stay", total_net.stay),
        ("Refinance", total_net.refinance),
        ("Sell + Buy", total_net.sell_buy),
        ("Rent", total_net.rent),
    ]
    if rent_out_buy_viable:
        candidates.append(("Rent Out & Buy", total_net.rent_out_buy))

    best_financial: ScenarioName = candidates[0][0]
    best_total = candidates[0][1]
    for name, value in candidates[1:]:
        if value > best_total:
            best_financial = name
            best_total = value

    # Excel Outputs!B20 — MAX(..., IF(not viable, -1E+99, F8))
    if rent_out_buy_viable:
        best_total_ever = max(total_net.stay, total_net.refinance, total_net.sell_buy, total_net.rent, total_net.rent_out_buy)
    else:
        best_total_ever = max(total_net.stay, total_net.refinance, total_net.sell_buy, total_net.rent)

    # Excel Outputs!B21 — Best for monthly affordability (after-tax impact)
    #   Excludes Rent (it doesn't include next-housing cost)
    monthly_candidates: list[tuple[ScenarioName, float]] = [
        ("Stay", after_tax_impact.stay),
        ("Refinance", after_tax_impact.refinance),
        ("Sell + Buy", after_tax_impact.sell_buy),
        ("Rent Out & Buy", after_tax_impact.rent_out_buy),
    ]
    best_monthly = monthly_candidates[0][0]
    best_monthly_value = monthly_candidates[0][1]
    for name, value in monthly_candidates[1:]:
        if value > best_monthly_value:
            best_monthly = name
            best_monthly_value = value

    # Excel Outputs!B22 — always "Stay"
    simplest: ScenarioName = "Stay"

    # Plain-English insight (Excel B23)
    plain = _plain_english_insight(best_financial, rent_out_buy_viable)

    recommendation = RecommendationSnapshot(
        best_financial_outcome=best_financial,
        best_total_net_position=best_total_ever,
        best_for_monthly_affordability=best_monthly,
        simplest_path=simplest,
        plain_english_insight=plain,
    )

    # --- Priority rankings (rows 28–31) ---
    # Excel B31: IF(not viable, "Sell + Buy", IF(F8>D8, "Rent Out & Buy", "Sell + Buy"))
    if not rent_out_buy_viable:
        move_lifestyle: ScenarioName = "Sell + Buy"
    else:
        move_lifestyle = (
            "Rent Out & Buy"
            if total_net.rent_out_buy > total_net.sell_buy
            else "Sell + Buy"
        )

    priority = PriorityRankings(
        max_wealth=best_financial,
        monthly_affordability=best_monthly,
        simplicity=simplest,
        move_lifestyle_change=move_lifestyle,
    )

    # --- Feasibility flags (rows 34–41) ---
    if best_financial == "Rent":
        subsidy = "Depends on next housing cost"
    elif best_financial == "Stay":
        subsidy = "Yes" if after_tax_impact.stay < 0 else "No"
    elif best_financial == "Refinance":
        subsidy = "Yes" if after_tax_impact.refinance < 0 else "No"
    elif best_financial == "Sell + Buy":
        subsidy = "Yes" if after_tax_impact.sell_buy < 0 else "No"
    else:  # Rent Out & Buy
        subsidy = "Yes" if after_tax_impact.rent_out_buy < 0 else "No"

    if best_financial in ("Rent", "Rent Out & Buy"):
        complexity: Literal["Low", "Medium", "High"] = "High"
    elif best_financial == "Sell + Buy":
        complexity = "Medium"
    else:
        complexity = "Low"

    # Excel B37: after-tax monthly impact for the top scenario
    figure_map = {
        "Stay": after_tax_impact.stay,
        "Refinance": after_tax_impact.refinance,
        "Sell + Buy": after_tax_impact.sell_buy,
        "Rent": after_tax_impact.rent,
        "Rent Out & Buy": after_tax_impact.rent_out_buy,
    }
    monthly_to_watch = figure_map[best_financial]

    flags = FeasibilityFlags(
        top_ranked_scenario=best_financial,
        requires_monthly_subsidy=subsidy,
        complexity=complexity,
        monthly_figure_to_watch=monthly_to_watch,
        rent_out_buy_liquidity_status=rent_out_buy.liquidity_status,
        rent_out_buy_upfront_cash_required=rent_out_buy.total_upfront_cash_needed,
        available_cash_for_new_purchase=inputs.available_cash_for_purchase,
        cash_surplus_or_shortfall=rent_out_buy.cash_surplus_or_shortfall,
    )

    return DecisionMap(
        selected_hold_period_years=inputs.hold_years,
        monthly_all_in_impact_vs_today=monthly_impact,
        after_tax_monthly_impact_vs_today=after_tax_impact,
        net_equity_if_sold_at_horizon=net_equity,
        total_net_position=total_net,
        rent_driver_breakdown=rent_drivers,
        recommendation=recommendation,
        priority_rankings=priority,
        feasibility_flags=flags,
    )


def _plain_english_insight(
    best: ScenarioName,
    rent_out_buy_viable: bool,
) -> str:
    """Translate the winning scenario into the exact sentence from Excel B23."""
    if not rent_out_buy_viable:
        if best == "Rent":
            return (
                "Rent produces the strongest feasibility-aware modeled outcome over the "
                "selected hold period in this case. Pure Rent still excludes the "
                "next-housing cost, so it should be viewed as an investment result, not "
                "a full housing outcome."
            )
        if best == "Refinance":
            return (
                "Refinancing produces the strongest feasibility-aware balance of monthly "
                "affordability and long-term value in this case."
            )
        return (
            "The top-ranked scenario produces the strongest feasibility-aware modeled "
            "outcome over the selected hold period in this case."
        )
    # Rent Out & Buy is viable
    if best == "Rent":
        return (
            "Rent produces the strongest modeled outcome over the selected hold period "
            "in this case, but the rent scenario monthly rows only reflect the economics "
            "of the current home as a rental and do not include the cost of the next "
            "residence."
        )
    if best == "Rent Out & Buy":
        return (
            "Rent Out & Buy produces the strongest modeled outcome over the selected hold "
            "period in this case, combining next-home ownership with retained current-home "
            "rental economics. Check the liquidity status row before treating it as "
            "executable."
        )
    if best == "Refinance":
        return (
            "Refinancing produces the strongest modeled balance of monthly affordability "
            "and long-term value in this case."
        )
    return (
        "The top-ranked scenario produces the strongest modeled outcome over the "
        "selected hold period in this case, but the monthly rows should still be "
        "checked before treating it as the preferred path."
    )
