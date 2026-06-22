"""
portfolio/goal_profiles.py

Goal-driven weighting profiles for the Strategy Scoring sheet.

Email 2026-05-15 (Van):
    "I do think the user's stated goal should influence the scoring…
     but rather than allowing users to manually adjust weights, let's
     use a predefined weighting profile based on the goal they select."

V1 dropdown goals:
    - Build Wealth
    - Generate Passive Income
    - Preserve Liquidity
    - Minimize Risk

------------------------------------------------------------------------
OPEN QUESTION — the actual weighting matrix isn't in this file yet.
------------------------------------------------------------------------
Van's email said "See attached weighting matrix" but neither the
spreadsheet nor the workspace included a matrix file. Until we get it,
all four profiles fall back to the workbook's static V4.1 weights
(25/15/10/15/20/7.5/7.5/10) — meaning the engine WORKS but every goal
produces the same score for now. Swap the dict literals once Van sends
the actual matrix and the engine will start differentiating.

Suggested-from-Excel placeholder hints (uncomment + tune when discussing
tomorrow if Van wants a stake-in-the-ground from us):

    - Build Wealth          — heavier on cash_flow + property_fit
    - Generate Passive Income — heavier on cash_flow + eligibility
    - Preserve Liquidity    — heavier on liquidity + complexity
    - Minimize Risk         — heavier on risk + credit + complexity

The 8 weighted factors are fixed by the workbook (sheet 7 columns
D-J + R). Tomorrow's discussion may add a 9th (e.g. "tax efficiency")
or remove one; the dataclass shape can grow without breaking callers.
"""
from __future__ import annotations

from dataclasses import dataclass

from .inputs import GoalObjective


@dataclass(frozen=True)
class GoalWeights:
    """
    Weights applied to each strategy's per-factor scores.

    Capital coverage is on a 0-1 scale (it's a coverage ratio); every
    other factor is on a 0-100 scale. The workbook works around this by
    scaling capital coverage with a weight of 25 (i.e. 0-1 * 25 -> 0-25)
    and the other seven with decimal weights (0-100 * 0.15 -> 0-15).
    We mirror that so the math is bit-for-bit reproducible.
    """
    capital_coverage_weight: float
    credit_score_weight: float
    liquidity_score_weight: float
    cash_flow_score_weight: float
    eligibility_score_weight: float
    complexity_score_weight: float
    risk_score_weight: float
    property_fit_weight: float

    def sum_check(self) -> float:
        """
        For audit/debug: weights should sum to 100 since the engine
        normalizes capital_coverage to 0-1 internally (weight applied
        is *25*, not *0.25*, but the implied 100-point ceiling is the
        same intent). This helper just lets tests assert.
        """
        return (
            self.capital_coverage_weight
            + self.credit_score_weight * 100
            + self.liquidity_score_weight * 100
            + self.cash_flow_score_weight * 100
            + self.eligibility_score_weight * 100
            + self.complexity_score_weight * 100
            + self.risk_score_weight * 100
            + self.property_fit_weight * 100
        ) / 100


# ---------------------------------------------------------------------------
# The static V4.1 profile — used as the placeholder for all four goals.
# ---------------------------------------------------------------------------

_STATIC_V41 = GoalWeights(
    capital_coverage_weight=25.0,    # applied to 0-1 coverage -> 0-25 points
    credit_score_weight=0.15,        # applied to 0-100 score  -> 0-15 points
    liquidity_score_weight=0.10,
    cash_flow_score_weight=0.15,
    eligibility_score_weight=0.20,
    complexity_score_weight=0.075,
    risk_score_weight=0.075,
    property_fit_weight=0.10,
)


# ---------------------------------------------------------------------------
# Placeholder mapping — all four goals point at the same static profile.
# Swap each value with the real per-goal weights once Van sends the
# matrix.
# ---------------------------------------------------------------------------

GOAL_PROFILES: dict[GoalObjective, GoalWeights] = {
    "Build Wealth": _STATIC_V41,
    "Generate Passive Income": _STATIC_V41,
    "Preserve Liquidity": _STATIC_V41,
    "Minimize Risk": _STATIC_V41,
}


def weights_for_goal(goal: GoalObjective) -> GoalWeights:
    """Look up the weighting profile for a goal. Defaults to static V4.1."""
    return GOAL_PROFILES.get(goal, _STATIC_V41)
