"""
portfolio/dashboard.py

Consumer-facing summary payload. Mirrors sheet 9 (`Dashboard`) of the
workbook — what the user sees on the results page after they hit "Run".
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .portfolio_analytics import PortfolioAnalytics
from .strategy_scoring import ScoredStrategy
from .target_property import TargetPropertyMetrics


@dataclass(frozen=True)
class DashboardOut:
    """The 9-row dashboard rendered to the user as the results page."""

    # Identity / context
    target_property_type: str
    property_type_logic: str

    # Headline numbers
    total_equity: float
    estimated_accessible_equity: float       # DSCR / no-ratio total, i.e. investment-quality access
    portfolio_monthly_cash_flow: float
    target_property_dscr: float
    capital_needed: float
    target_monthly_cash_flow_or_flip_profit: float

    # Recommended path
    recommended_path: str
    recommended_score: float
    alternative_path: Optional[str]
    alternative_score: Optional[float]

    # Consumer narrative
    consumer_explanation: str
    primary_tradeoff: str
    property_type_note: str
    suggested_next_step: str


_SUGGESTED_NEXT_STEP = (
    "Review this strategy with a licensed mortgage professional / product "
    "specialist before relying on it."
)


def build_dashboard(
    portfolio: PortfolioAnalytics,
    target_metrics: TargetPropertyMetrics,
    scored: list[ScoredStrategy],
    target_property_type: str,
) -> DashboardOut:
    """
    Distill the ranked strategy list + portfolio + target metrics into
    the consumer dashboard payload. Top-ranked = Recommended; #2 if its
    score is within 5 points of the top = Alternative (otherwise we hide
    it to avoid forcing a runner-up that materially under-performs).
    """
    ranked = sorted(scored, key=lambda s: s.rank)
    recommended = ranked[0] if ranked else None
    alternative = (
        ranked[1]
        if len(ranked) >= 2 and ranked[1].weighted_score >= (ranked[0].weighted_score - 5)
        else None
    )

    target_cash_flow_or_profit = (
        target_metrics.projected_flip_profit
        if target_metrics.projected_flip_profit != 0
        else target_metrics.monthly_cash_flow
    )

    return DashboardOut(
        target_property_type=target_property_type,
        property_type_logic=target_metrics.preferred_financing_theme,
        total_equity=portfolio.summary.total_equity,
        estimated_accessible_equity=portfolio.summary.total_dscr_no_ratio_accessible_equity,
        portfolio_monthly_cash_flow=portfolio.summary.total_monthly_cash_flow,
        target_property_dscr=target_metrics.dscr,
        capital_needed=target_metrics.total_capital_needed,
        target_monthly_cash_flow_or_flip_profit=target_cash_flow_or_profit,
        recommended_path=recommended.name if recommended else "—",
        recommended_score=recommended.weighted_score if recommended else 0.0,
        alternative_path=alternative.name if alternative else None,
        alternative_score=alternative.weighted_score if alternative else None,
        consumer_explanation=(
            recommended.consumer_output
            if recommended
            else "Not enough information to recommend a path."
        ),
        primary_tradeoff=recommended.key_tradeoff if recommended else "",
        property_type_note=recommended.property_type_note if recommended else "",
        suggested_next_step=_SUGGESTED_NEXT_STEP,
    )
