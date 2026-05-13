"""
scenarios/fthb/decision_map.py

Decision-map / Outputs sheet for the FTHB engine.

Mirrors the 'Outputs' sheet of FTHB_decision map.xlsx:

    Scenario Comparison      — five-row table (one per scenario) with
                                Net Position, Monthly Cost, Residual
                                Monthly Savings, Savings Accumulation,
                                Cash Required, Cash Remaining, DTI,
                                Equity at Horizon, Feasibility, Risk.
    Recommendation Snapshot  — single-line picks for best executable
                                path, best monthly affordability, best
                                savings capacity, lowest cash, plus a
                                plain-English actionable insight.

Implementation notes — the "Best executable path" cell (Outputs!B13)
in Excel is the audit's known-broken check. It references column L
("Decision Score"), which is empty / contains placeholder text. The
IF chain accidentally lands on the right answer via Excel's MAX-of-
empty-cells equals zero behavior. We implement the *intended* logic
instead — best_executable = scenario name whose net_position equals
MAXIFS(net_position, feasibility="Feasible") — which gives the same
result for the default inputs and is also what `Outputs!B14` uses.
This divergence is documented in the audit report.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

from .assistance import AssistanceResult
from .delay import DelayResult
from .inputs import FTHBInputs
from .preferred import PreferredResult
from .rent import ContinueRentingResult
from .starter import StarterResult


# Scenario name strings — kept exactly as they appear in column A of the
# Outputs sheet, so anything downstream (UI, audit, AI interpretation
# layer) can compare against the canonical labels.
NAME_RENT = "Continue Renting"
NAME_STARTER = "Buy Starter Home"
NAME_PREFERRED = "Buy Preferred Home"
NAME_ASSISTANCE = "Buy with Assistance"
NAME_DELAY = "Delay Purchase"


@dataclass(frozen=True)
class ScenarioComparisonRow:
    """One row of the Outputs sheet's Scenario Comparison table."""
    scenario: str
    net_position: float
    monthly_cost: float | None        # None for Delay (Excel writes "N/A")
    residual_monthly_savings: float
    savings_accumulation: float
    cash_required: float
    cash_remaining: float
    dti: float | None                 # None for Continue Renting + Delay
    equity_at_horizon: float          # 0 for Continue Renting + Delay
    feasibility: str                  # "Feasible" | "Not Feasible"
    risk: str


@dataclass(frozen=True)
class RecommendationSnapshot:
    """The Outputs sheet's Recommendation Snapshot block (B13-B18)."""
    best_executable_path: str
    best_net_position: float
    best_monthly_affordability: str
    best_savings_capacity: str
    lowest_cash_required: str
    actionable_insight: str


@dataclass(frozen=True)
class DecisionMap:
    comparison: List[ScenarioComparisonRow]
    recommendation: RecommendationSnapshot


# ---------------------------------------------------------------------------
# Outputs!B18 — actionable insight strings, indexed by `best_executable_path`.
# Lifted verbatim from the spreadsheet so they read identically wherever
# they're surfaced.
# ---------------------------------------------------------------------------

INSIGHT_BY_BEST: dict[str, str] = {
    NAME_ASSISTANCE: (
        "Assistance improves cash-to-close, but this scenario assumes a "
        "0.50% higher mortgage rate and repayment of the DPA amount at "
        "sale/refinance; this scenario is based on the starter home price. "
        "Net position now reflects the lower savings capacity created by "
        "the higher monthly payment."
    ),
    NAME_STARTER: (
        "Starter home is the best executable ownership path after "
        "accounting for equity, remaining cash, and future savings capacity."
    ),
    NAME_RENT: (
        "Continuing to rent is strongest on a feasibility-adjusted basis "
        "after accounting for retained cash and ongoing savings capacity."
    ),
    NAME_DELAY: (
        "Waiting improves cash position and preserves savings capacity "
        "before buying."
    ),
    NAME_PREFERRED: (
        "Preferred home produces the strongest modeled outcome among "
        "feasible paths after accounting for monthly payment drag."
    ),
}


def compute_decision_map(
    inputs: FTHBInputs,
    rent: ContinueRentingResult,
    starter: StarterResult,
    preferred: PreferredResult,
    assistance: AssistanceResult,
    delay: DelayResult,
) -> DecisionMap:
    """Roll the five scenarios into the Outputs sheet shape."""
    rows = _build_comparison_rows(rent, starter, preferred, assistance, delay)
    rec = _build_recommendation(rows)
    return DecisionMap(comparison=rows, recommendation=rec)


def _build_comparison_rows(
    rent: ContinueRentingResult,
    starter: StarterResult,
    preferred: PreferredResult,
    assistance: AssistanceResult,
    delay: DelayResult,
) -> List[ScenarioComparisonRow]:
    return [
        # Continue Renting — Outputs row 5
        # Notes: cash_required is `'Continue Renting'!B11` which is monthly_housing_cost_today
        #        in Excel, NOT cash_required_now. Mirror Excel: pulls B11 (rent), not B12 (cash).
        # Wait — re-checking Excel: F5 (Cash Required) = 'Continue Renting'!B11 = 0
        #   (B11 is "Cash required now ($)" = 0 — not monthly cost)
        # G5 (Cash Remaining) = 'Continue Renting'!B12 = available cash = 90000
        ScenarioComparisonRow(
            scenario=NAME_RENT,
            net_position=rent.total_net_position,
            monthly_cost=rent.monthly_housing_cost_today,
            residual_monthly_savings=rent.residual_monthly_savings,
            savings_accumulation=rent.projected_savings_accumulation,
            cash_required=rent.cash_required_now,
            cash_remaining=rent.cash_remaining_now,
            dti=None,                                 # Excel writes "N/A"
            equity_at_horizon=0.0,
            feasibility=rent.feasibility_status,
            risk=rent.risk_level,
        ),
        ScenarioComparisonRow(
            scenario=NAME_STARTER,
            net_position=starter.total_net_position,
            monthly_cost=starter.total_monthly_housing_payment,
            residual_monthly_savings=starter.residual_monthly_savings,
            savings_accumulation=starter.projected_savings_accumulation,
            cash_required=starter.total_cash_required_at_close,
            cash_remaining=starter.cash_remaining_after_close,
            dti=starter.dti,
            equity_at_horizon=starter.net_equity_at_horizon,
            feasibility=starter.feasibility_status,
            risk=starter.risk_level,
        ),
        ScenarioComparisonRow(
            scenario=NAME_PREFERRED,
            net_position=preferred.total_net_position,
            monthly_cost=preferred.total_monthly_housing_payment,
            residual_monthly_savings=preferred.residual_monthly_savings,
            savings_accumulation=preferred.projected_savings_accumulation,
            cash_required=preferred.total_cash_required_at_close,
            cash_remaining=preferred.cash_remaining_after_close,
            dti=preferred.dti,
            equity_at_horizon=preferred.net_equity_at_horizon,
            feasibility=preferred.feasibility_status,
            risk=preferred.risk_level,
        ),
        ScenarioComparisonRow(
            scenario=NAME_ASSISTANCE,
            net_position=assistance.total_net_position,
            monthly_cost=assistance.total_monthly_housing_payment,
            residual_monthly_savings=assistance.residual_monthly_savings,
            savings_accumulation=assistance.projected_savings_accumulation,
            cash_required=assistance.total_cash_required_at_close,
            cash_remaining=assistance.cash_remaining_after_close,
            dti=assistance.dti,
            equity_at_horizon=assistance.net_equity_at_horizon,
            feasibility=assistance.feasibility_status,
            risk=assistance.risk_level,
        ),
        ScenarioComparisonRow(
            scenario=NAME_DELAY,
            net_position=delay.total_net_position,
            monthly_cost=None,                        # Excel writes "N/A"
            residual_monthly_savings=delay.residual_monthly_savings_while_renting,
            savings_accumulation=delay.projected_remaining_period_savings,
            cash_required=0.0,                        # Excel hardcodes 0
            cash_remaining=delay.projected_available_cash_after_delay,
            dti=None,                                 # Excel writes "N/A"
            equity_at_horizon=0.0,
            feasibility=delay.expected_future_feasibility,
            risk=delay.risk_level,
        ),
    ]


def _build_recommendation(rows: List[ScenarioComparisonRow]) -> RecommendationSnapshot:
    """
    Build the Recommendation Snapshot.

    `best_net_position` mirrors Outputs!B14:
        =MAXIFS(net_position, feasibility="Feasible")
    `best_executable_path` is the scenario name whose net_position
    matches that max — i.e. the *intended* logic for B13. (See module
    docstring for the broken IF chain we're not mirroring.)

    The other three picks (B15-B17) are MIN/MAX over the corresponding
    column. Affordability + lowest cash exclude Delay because Excel
    omits it from the chain (Delay's monthly_cost / cash_required are
    "N/A"). Savings capacity includes all five.
    """
    feasible_rows = [r for r in rows if r.feasibility == "Feasible"]

    # B14 / B13 — best executable path (feasibility-filtered).
    if feasible_rows:
        best_row = max(feasible_rows, key=lambda r: r.net_position)
        best_executable_path = best_row.scenario
        best_net_position = best_row.net_position
    else:
        best_executable_path = ""
        best_net_position = 0.0

    # B15 — best monthly affordability among rows 5-8 (excludes Delay).
    affordability_pool = [r for r in rows[:4] if r.monthly_cost is not None]
    best_monthly_affordability = (
        min(affordability_pool, key=lambda r: r.monthly_cost).scenario
        if affordability_pool else ""
    )

    # B16 — best savings capacity across all five rows.
    best_savings_capacity = max(rows, key=lambda r: r.residual_monthly_savings).scenario

    # B17 — lowest cash required among rows 5-8 (excludes Delay).
    cash_pool = rows[:4]
    lowest_cash_required = min(cash_pool, key=lambda r: r.cash_required).scenario

    insight = INSIGHT_BY_BEST.get(best_executable_path, "")

    return RecommendationSnapshot(
        best_executable_path=best_executable_path,
        best_net_position=best_net_position,
        best_monthly_affordability=best_monthly_affordability,
        best_savings_capacity=best_savings_capacity,
        lowest_cash_required=lowest_cash_required,
        actionable_insight=insight,
    )
