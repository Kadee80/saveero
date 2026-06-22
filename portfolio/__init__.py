"""
portfolio — Real Estate Portfolio Strategy Engine.

Third decision branch alongside the existing homeowner (`scenarios/`) and
first-time-homebuyer (`scenarios/fthb/`) engines.

The engine answers: "Given my existing portfolio + my profile + the
property I want to buy, what acquisition strategy should I pursue?"

V1 ranks 8 strategies (Use Cash / HELOC / Conventional Cash-Out / DSCR
Cash-Out / No-Ratio Cash-Out / Sell & Redeploy / Combination / Bridge)
on 8 factors, weighted by the user's investor goal (Build Wealth /
Passive Income / Preserve Liquidity / Minimize Risk).

Math mirrors Van's `Portfolio Builder Engine.xlsx` workbook. Strategies
are NOT a closed enum — additional strategies + combinations are
expected to land over time, so the scoring loop iterates over a list of
Strategy dataclasses rather than a hardcoded if/else.

Public API:
    PortfolioInputs           — all inputs the engine needs
    ExistingProperty          — one property row from the current portfolio
    TargetProperty            — the property the user wants to buy
    PortfolioProfile          — credit/income/cash/goal/risk/horizon
    GoalObjective             — the four V1 weighting profiles
    run_all(inputs)           — full engine (analytics + target + scores + dashboard)
    compute_portfolio_analytics
    compute_target_property
    score_strategies
    build_dashboard
"""
from .engine import EngineResult, run_all
from .goal_profiles import GOAL_PROFILES, GoalObjective, GoalWeights
from .inputs import (
    CreditBucket,
    ExistingProperty,
    IncomeProfile,
    PortfolioInputs,
    PortfolioProfile,
    PropertyUse,
    RiskTolerance,
    TargetProperty,
    TargetPropertyType,
    TimeHorizon,
)
from .portfolio_analytics import (
    PortfolioAnalytics,
    PortfolioSummary,
    PropertyAnalytics,
    compute_portfolio_analytics,
)
from .product_rules import ProductRules, DEFAULT_PRODUCT_RULES
from .strategy_scoring import (
    ScoredStrategy,
    StrategyKey,
    score_strategies,
)
from .target_property import TargetPropertyMetrics, compute_target_property
from .dashboard import DashboardOut, build_dashboard

__all__ = [
    "EngineResult",
    "run_all",
    "PortfolioInputs",
    "ExistingProperty",
    "TargetProperty",
    "PortfolioProfile",
    "GoalObjective",
    "GoalWeights",
    "GOAL_PROFILES",
    "CreditBucket",
    "IncomeProfile",
    "PropertyUse",
    "RiskTolerance",
    "TimeHorizon",
    "TargetPropertyType",
    "PortfolioAnalytics",
    "PropertyAnalytics",
    "PortfolioSummary",
    "compute_portfolio_analytics",
    "ProductRules",
    "DEFAULT_PRODUCT_RULES",
    "ScoredStrategy",
    "StrategyKey",
    "score_strategies",
    "TargetPropertyMetrics",
    "compute_target_property",
    "DashboardOut",
    "build_dashboard",
]
