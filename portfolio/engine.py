"""
portfolio/engine.py

Top-level orchestrator for the Real Estate Portfolio Strategy Engine.

Takes one PortfolioInputs, runs every layer (analytics -> target
property -> goal-weighted strategy scoring -> dashboard), and returns
a single EngineResult.

Mirrors the workbook's "edit any input, everything recomputes"
workflow. Clients wanting finer-grained access can call the per-layer
`compute_*` / `score_strategies` / `build_dashboard` functions directly.
"""
from __future__ import annotations

from dataclasses import dataclass

from .dashboard import DashboardOut, build_dashboard
from .goal_profiles import weights_for_goal
from .inputs import PortfolioInputs
from .portfolio_analytics import PortfolioAnalytics, compute_portfolio_analytics
from .product_rules import DEFAULT_PRODUCT_RULES, ProductRules
from .strategy_scoring import ScoredStrategy, score_strategies
from .target_property import TargetPropertyMetrics, compute_target_property


@dataclass(frozen=True)
class EngineResult:
    inputs: PortfolioInputs
    portfolio: PortfolioAnalytics
    target_metrics: TargetPropertyMetrics
    strategies: tuple[ScoredStrategy, ...]
    dashboard: DashboardOut


def run_all(
    inputs: PortfolioInputs,
    rules: ProductRules = DEFAULT_PRODUCT_RULES,
) -> EngineResult:
    """
    Run the full Portfolio engine against one set of inputs.

    Validation errors surface as ValueError — the API layer catches
    these and returns a 400. Internally the engine assumes inputs are
    valid.
    """
    inputs.validate()

    portfolio = compute_portfolio_analytics(inputs.existing_properties, rules)
    target_metrics = compute_target_property(inputs.target_property, inputs.profile, rules)
    weights = weights_for_goal(inputs.profile.investor_goal)
    strategies = score_strategies(
        portfolio=portfolio,
        target=inputs.target_property,
        target_metrics=target_metrics,
        profile=inputs.profile,
        weights=weights,
        rules=rules,
    )
    dashboard = build_dashboard(
        portfolio=portfolio,
        target_metrics=target_metrics,
        scored=strategies,
        target_property_type=inputs.target_property.target_property_type,
    )
    return EngineResult(
        inputs=inputs,
        portfolio=portfolio,
        target_metrics=target_metrics,
        strategies=tuple(strategies),
        dashboard=dashboard,
    )
