"""
portfolio/goal_profiles.py

Goal-driven weighting profiles for strategy scoring. Drives the
recommendation logic — different investor goals weight the same
per-strategy dimensions differently.

V1 honors Van's `Investor_Objective_Weightings.xlsx` matrix (2026-06-23)
verbatim. Footnote on that sheet:
    "label the factors exactly as they appear in the scoring engine."
Done — the seven dataclass fields below ARE the scoring engine's
canonical factor names.

Each profile's weights sum to 100. The final weighted score is
    sum(dim_score_0_to_100 * weight) / 100  →  0-100 final
"""
from __future__ import annotations

from dataclasses import dataclass

from .inputs import GoalObjective


@dataclass(frozen=True)
class GoalWeights:
    """
    Weights applied to each strategy's seven per-factor scores.

    Each weight is expressed as the share of 100 the dimension carries
    (e.g. 25 = 25% of the final score). Weights sum to 100 within a
    profile — the engine divides by 100 after summing so the final
    weighted score lives on the same 0-100 scale as the input
    dimensions.

    Field names are the canonical factor labels. The Pydantic schema +
    the frontend display use them too, so renaming requires touching
    schemas.py, strategy_scoring.py, portfolioApi.ts, and
    PortfolioBuilder.tsx together.
    """
    capital_availability: float       # "Can the user actually access enough capital?"
    credit_fit: float                 # Credit-bucket alignment with strategy
    liquidity_preservation: float     # How much liquidity remains after deployment
    cash_flow_impact: float           # Immediate post-deploy monthly cash flow
    long_term_wealth_impact: float    # 5-year compound wealth lens (heuristic; see strategy_scoring)
    complexity: float                 # Process / execution friction
    risk: float                       # Strategy + property-type combined risk

    def sum_check(self) -> float:
        return (
            self.capital_availability
            + self.credit_fit
            + self.liquidity_preservation
            + self.cash_flow_impact
            + self.long_term_wealth_impact
            + self.complexity
            + self.risk
        )


# ---------------------------------------------------------------------------
# Van's matrix — 2026-06-23 (Investor_Objective_Weightings.xlsx)
#
# Each column of his sheet becomes one GoalWeights instance below.
# Rows sum to 100 by construction (asserted in the unit tests).
# ---------------------------------------------------------------------------

GOAL_PROFILES: dict[GoalObjective, GoalWeights] = {
    "Build Wealth": GoalWeights(
        capital_availability=25,
        credit_fit=10,
        liquidity_preservation=5,
        cash_flow_impact=10,
        long_term_wealth_impact=35,
        complexity=5,
        risk=10,
    ),
    "Generate Passive Income": GoalWeights(
        capital_availability=15,
        credit_fit=10,
        liquidity_preservation=5,
        cash_flow_impact=40,
        long_term_wealth_impact=15,
        complexity=5,
        risk=10,
    ),
    "Preserve Liquidity": GoalWeights(
        capital_availability=15,
        credit_fit=10,
        liquidity_preservation=40,
        cash_flow_impact=10,
        long_term_wealth_impact=10,
        complexity=5,
        risk=10,
    ),
    "Minimize Risk": GoalWeights(
        capital_availability=10,
        credit_fit=10,
        liquidity_preservation=15,
        cash_flow_impact=15,
        long_term_wealth_impact=10,
        complexity=10,
        risk=30,
    ),
}


def weights_for_goal(goal: GoalObjective) -> GoalWeights:
    """Look up the weighting profile for a goal. Defaults to Build Wealth."""
    return GOAL_PROFILES.get(goal, GOAL_PROFILES["Build Wealth"])
