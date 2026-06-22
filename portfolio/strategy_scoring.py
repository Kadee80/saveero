"""
portfolio/strategy_scoring.py

The engine core: score and rank acquisition strategies for the user's
target property.

Mirrors sheet 7 (`Strategy_Scoring`) of the workbook. Eight strategies
in v1 — but strategies are NOT a closed enum (Van email 2026-05-15:
"will prob add additional strategies and strategy combinations over
time"). The scoring loop iterates over a list of `Strategy` dataclasses;
adding a strategy is a single append plus a column-formula function.

Per-strategy formulas come from the workbook's columns B-J + R (sheet
7). Each strategy has its own way of computing each factor — they're
not uniform — so we encode them as small per-strategy methods rather
than a generic table. Re-reads cleanly against the spreadsheet next to
each other.

Outputs:
    ScoredStrategy — one row per strategy with all factors + final score
                     + rank + consumer-facing language
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Literal

from .goal_profiles import GoalWeights
from .inputs import (
    CreditBucket,
    PortfolioProfile,
    TargetProperty,
    TargetPropertyType,
)
from .portfolio_analytics import PortfolioAnalytics
from .product_rules import DEFAULT_PRODUCT_RULES, ProductRules
from .target_property import TargetPropertyMetrics


# ---------------------------------------------------------------------------
# Stable string keys for the eight v1 strategies.
# Keeping these as Literal so the frontend/types layer benefits but
# leaving the actual strategy list open to extension via append.
# ---------------------------------------------------------------------------

StrategyKey = Literal[
    "use_available_cash",
    "heloc_on_existing_equity",
    "conventional_cash_out",
    "dscr_cash_out_on_rental",
    "no_ratio_asset_based_cash_out",
    "sell_and_redeploy",
    "combination_strategy",
    "bridge_hard_money_private_capital",
]


# ---------------------------------------------------------------------------
# The output row
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ScoredStrategy:
    key: StrategyKey
    name: str

    # Capital math
    capital_available: float
    capital_needed: float
    capital_coverage: float       # 0-1 (clamped)

    # Per-factor scores (all 0-100)
    credit_score: float
    liquidity_score: float
    cash_flow_score: float
    eligibility_score: float
    complexity_score: float
    risk_score: float
    property_fit: float

    # Final weighted score (0-100ish; technically 0-110 with the
    # workbook's quirky scaling, but functionally compared relatively).
    weighted_score: float
    rank: int                     # 1 = best

    # Consumer-facing language (mirrors columns M, N, P, Q, S, T)
    consumer_output: str
    formula_check: str            # "Capital need covered" / "Capital gap remains"
    key_tradeoff: str
    recommendation_type: str      # "Recommended" / "Alternative" / "Stretch" / "Other"
    property_type_note: str
    product_logic_fit: str


# ---------------------------------------------------------------------------
# Credit-bucket lookup — column E formula across all strategies.
# ---------------------------------------------------------------------------

_CREDIT_BUCKET_SCORES: dict[CreditBucket, float] = {
    "740+": 100,
    "700-739": 90,
    "660-699": 75,
    "<660": 50,
}


def _credit_score(profile: PortfolioProfile) -> float:
    return _CREDIT_BUCKET_SCORES.get(profile.credit_score_bucket, 50)


# ---------------------------------------------------------------------------
# Per-property-type risk + cash-flow score helpers (replicates the
# conditional branches in sheet 7).
# ---------------------------------------------------------------------------

def _flip_cash_flow_score(target: TargetProperty, rules: ProductRules) -> float:
    """For Fix & Flip: high score if projected gross ROI exceeds target."""
    # Recompute projected ROI inline rather than threading target_metrics
    # since the workbook does it independently per strategy column.
    profit = (
        target.arv
        - target.target_purchase_price
        - target.rehab_budget
        - target.holding_costs
    )
    capital = max(1.0, target.target_purchase_price * 0.25 + target.target_purchase_price * 0.03)
    roi = profit / capital if capital > 0 else 0
    if roi >= rules.target_flip_minimum_gross_roi:
        return 90
    return 60


def _cash_flow_score(target_metrics: TargetPropertyMetrics, target: TargetProperty, rules: ProductRules) -> float:
    """
    Generic across most strategies. Workbook column G formula —
    Fix & Flip uses the ROI threshold; everything else compares
    DSCR + monthly cash flow against thresholds.
    """
    if target.target_property_type == "Fix & Flip":
        return _flip_cash_flow_score(target, rules)
    if target_metrics.dscr >= 1.25 and target_metrics.monthly_cash_flow > 0:
        return 85
    if target_metrics.dscr >= rules.minimum_dscr:
        return 65
    return 45


def _risk_score_by_type(target_type: TargetPropertyType) -> float:
    """
    Workbook column J — risk score by target property type.
    Higher = lower risk. Numbers tuned to the LTR=70 baseline shown in
    the sheet 7 sample; revisit with Van for the matrix.
    """
    return {
        "Long-Term Rental":                       70,
        "Short-Term Rental":                      60,
        "Residential Multifamily (2-4 Units)":    70,
        "Commercial Multifamily (5+ Units)":      55,
        "Vacation Home":                          55,
        "Fix & Flip":                             55,
    }.get(target_type, 65)


# ---------------------------------------------------------------------------
# Strategy definitions — each describes how to compute its column values.
# Adding a new strategy is a single append at the bottom of build_strategies.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class _StrategyDef:
    key: StrategyKey
    name: str
    capital_available_fn: Callable[
        [PortfolioAnalytics, PortfolioProfile, ProductRules], float
    ]
    liquidity_score: float
    complexity_score: float
    risk_score_adjustment: float = 0.0
    """
    Adjustment vs. the property-type baseline (e.g. Bridge takes -45,
    Combination takes -10). Replicates the per-strategy risk delta
    visible in sheet 7's J column.
    """
    eligibility_strong: bool = True
    """
    Used by the eligibility column — Bridge/Hard Money tanks unless the
    target is a flip. We let strategy defs encode their own override.
    """
    key_tradeoff: str = ""
    product_logic_fit: str = ""
    property_type_note: str = ""


# Capital-available helpers
def _cash_after_buffer(_a, profile, rules):
    return max(0.0, profile.available_cash - rules.cash_reserve_buffer)


def _heloc_capital(a, _p, _r): return a.summary.total_heloc_accessible_equity
def _cash_out_capital(a, _p, _r): return a.summary.total_cash_out_accessible_equity
def _dscr_capital(a, _p, _r):
    # DSCR cash-out only applies to investment properties. Approximation:
    # subtract the primary residence's contribution from the total. The
    # workbook does this implicitly by selecting only investment rows.
    inv = sum(
        p.dscr_no_ratio_accessible_equity
        for p in a.properties
        if p.property_type != "Primary Residence"
    )
    return inv
def _no_ratio_capital(a, _p, _r):
    # Mirror image of _dscr_capital — primary residence only.
    return sum(
        p.dscr_no_ratio_accessible_equity
        for p in a.properties
        if p.property_type == "Primary Residence"
    )
def _sell_capital(a, profile, _r):
    # Selling unlocks all equity (minus closing costs); approximate as
    # total equity + the available cash already on hand.
    return a.summary.total_equity * 0.93 + profile.available_cash * 0  # closing ~7%; cash counted separately
def _combo_capital(a, _p, _r):
    # HELOC + DSCR / no-ratio — what the workbook pairs in the
    # "Combination" row.
    return a.summary.total_heloc_accessible_equity + (a.summary.total_dscr_no_ratio_accessible_equity * 0.5)
def _bridge_capital(_a, _p, _r):
    # Bridge / hard money funded externally — workbook treats this as
    # zero "available" relative to the user's own balance sheet. The
    # eligibility scoring is what gates this strategy.
    return 0.0


_STRATEGIES: tuple[_StrategyDef, ...] = (
    _StrategyDef(
        key="use_available_cash",
        name="Use Available Cash",
        capital_available_fn=_cash_after_buffer,
        liquidity_score=0,
        complexity_score=95,
        risk_score_adjustment=20,
        key_tradeoff="Reduces liquidity",
        product_logic_fit="Liquidity-driven",
        property_type_note="Cash is simple but reduces liquidity.",
    ),
    _StrategyDef(
        key="heloc_on_existing_equity",
        name="HELOC on Existing Equity",
        capital_available_fn=_heloc_capital,
        liquidity_score=80,
        complexity_score=75,
        risk_score_adjustment=0,
        key_tradeoff="Adds variable-rate debt",
        product_logic_fit="Equity-access",
        property_type_note="HELOC preserves existing first mortgage while accessing equity.",
    ),
    _StrategyDef(
        key="conventional_cash_out",
        name="Conventional Cash-Out",
        capital_available_fn=_cash_out_capital,
        liquidity_score=70,
        complexity_score=65,
        risk_score_adjustment=-5,
        key_tradeoff="Pricing/eligibility vary by lender",
        product_logic_fit="Full-doc / equity-access",
        property_type_note="Conventional cash-out can access equity but may be income/DTI constrained.",
    ),
    _StrategyDef(
        key="dscr_cash_out_on_rental",
        name="DSCR Cash-Out on Rental",
        capital_available_fn=_dscr_capital,
        liquidity_score=75,
        complexity_score=70,
        risk_score_adjustment=0,
        key_tradeoff="Pricing/eligibility vary by lender",
        product_logic_fit="Rental-income / DSCR",
        property_type_note="DSCR is relevant when rental income supports financing.",
    ),
    _StrategyDef(
        key="no_ratio_asset_based_cash_out",
        name="No-Ratio / Asset-Based Cash-Out",
        capital_available_fn=_no_ratio_capital,
        liquidity_score=75,
        complexity_score=75,
        risk_score_adjustment=0,
        key_tradeoff="Pricing/eligibility vary by lender",
        product_logic_fit="Equity / no-ratio",
        property_type_note="No-ratio may work when income documentation is difficult but equity is strong.",
    ),
    _StrategyDef(
        key="sell_and_redeploy",
        name="Sell & Redeploy",
        capital_available_fn=_sell_capital,
        liquidity_score=60,
        complexity_score=55,
        risk_score_adjustment=-15,
        key_tradeoff="Gives up future upside in sold property",
        product_logic_fit="Redeployment",
        property_type_note="Sell creates capital but gives up future ownership upside.",
    ),
    _StrategyDef(
        key="combination_strategy",
        name="Combination Strategy",
        capital_available_fn=_combo_capital,
        liquidity_score=65,
        complexity_score=60,
        risk_score_adjustment=-10,
        key_tradeoff="Pricing/eligibility vary by lender",
        product_logic_fit="Blended strategy",
        property_type_note="Combination can pair equity access with product-specific acquisition financing.",
    ),
    _StrategyDef(
        key="bridge_hard_money_private_capital",
        name="Bridge / Hard Money / Private Capital",
        capital_available_fn=_bridge_capital,
        liquidity_score=55,
        complexity_score=30,
        risk_score_adjustment=-50,
        eligibility_strong=False,
        key_tradeoff="Higher cost / shorter-term project financing",
        product_logic_fit="Project financing",
        property_type_note="Bridge/hard money is usually lower fit unless the target is a project/flip.",
    ),
)


# ---------------------------------------------------------------------------
# Per-strategy column formulas — eligibility + property_fit have
# strategy-specific quirks. Encoded here so scoring stays declarative.
# ---------------------------------------------------------------------------

def _liquidity_score_use_cash(profile: PortfolioProfile, target_metrics: TargetPropertyMetrics) -> float:
    """
    Workbook column F formula for the Use Cash row:
    100 * (cash - needed) / cash, clamped 0-100.
    """
    cash = profile.available_cash
    needed = target_metrics.total_capital_needed
    if cash <= 0:
        return 0.0
    return max(0.0, min(100.0, 100.0 * (cash - needed) / max(1.0, cash)))


def _eligibility(
    strat: _StrategyDef,
    coverage: float,
    profile: PortfolioProfile,
    target: TargetProperty,
) -> float:
    """
    Workbook column H. Each strategy has its own formula but the shape is
    "if you can cover capital and meet credit, you're eligible."
    """
    credit_ok = _credit_score(profile) >= 75  # 660-699 or better
    if strat.key == "use_available_cash":
        return 90 if coverage >= 1.0 else 50
    if strat.key == "bridge_hard_money_private_capital":
        # Bridge is high-eligibility only when target is a flip.
        if target.target_property_type == "Fix & Flip":
            return 80 if credit_ok else 60
        return 25
    if strat.key == "dscr_cash_out_on_rental":
        # DSCR depends on existing rental DSCR. Approximation: if any
        # capital flows through, it means we found qualifying inv equity.
        if coverage > 0 and credit_ok:
            return 90 if target.target_property_type != "Fix & Flip" else 75
        return 35
    # Generic equity-access strategies (HELOC, cash-out, no-ratio, combo)
    if coverage >= 1.0 and credit_ok:
        return 85
    if coverage > 0 and credit_ok:
        return 70
    return 40


def _property_fit_for_strategy(
    strat: _StrategyDef,
    base_fit: float,
    target_type: TargetPropertyType,
) -> float:
    """
    Workbook column R. Most strategies just use the type's base fit;
    some are penalized for type mismatch (e.g. DSCR on a Fix & Flip).
    """
    if strat.key == "dscr_cash_out_on_rental":
        return base_fit + 10 if target_type in (
            "Long-Term Rental",
            "Short-Term Rental",
            "Residential Multifamily (2-4 Units)",
        ) else max(0, base_fit - 20)
    if strat.key == "bridge_hard_money_private_capital":
        return 95 if target_type == "Fix & Flip" else 25
    if strat.key == "sell_and_redeploy":
        return max(0, base_fit - 15)
    return base_fit


def _recommendation_type(score: float, key: StrategyKey, target_type: TargetPropertyType) -> str:
    """
    Workbook column Q. Top-scoring path is "Recommended"; runners-up
    get labeled based on their character.
    """
    if score >= 85:
        return "Recommended"
    if key == "bridge_hard_money_private_capital":
        return "Other"
    if key in ("no_ratio_asset_based_cash_out", "sell_and_redeploy"):
        return "Alternative"
    if key == "conventional_cash_out":
        return "Stretch"
    return "Other"


def _consumer_output(name: str, score: float, target_type: TargetPropertyType) -> str:
    """Workbook column M — the user-visible explanation."""
    if score >= 85:
        verdict = "strong"
    elif score >= 70:
        verdict = "possible"
    else:
        verdict = "lower-fit"
    return (
        f"{name} appears to be a {verdict} path for a {target_type} based on "
        f"the information provided."
    )


# ---------------------------------------------------------------------------
# Top-level entry point
# ---------------------------------------------------------------------------

def score_strategies(
    portfolio: PortfolioAnalytics,
    target: TargetProperty,
    target_metrics: TargetPropertyMetrics,
    profile: PortfolioProfile,
    weights: GoalWeights,
    rules: ProductRules = DEFAULT_PRODUCT_RULES,
) -> list[ScoredStrategy]:
    rows: list[ScoredStrategy] = []
    credit = _credit_score(profile)

    for strat in _STRATEGIES:
        capital_available = strat.capital_available_fn(portfolio, profile, rules)
        capital_needed = target_metrics.total_capital_needed
        coverage = (
            min(1.0, capital_available / capital_needed)
            if capital_needed > 0
            else 0.0
        )

        if strat.key == "use_available_cash":
            liquidity = _liquidity_score_use_cash(profile, target_metrics)
        else:
            liquidity = strat.liquidity_score

        cash_flow = _cash_flow_score(target_metrics, target, rules)
        eligibility = _eligibility(strat, coverage, profile, target)
        complexity = strat.complexity_score
        base_risk = _risk_score_by_type(target.target_property_type)
        risk = max(0.0, base_risk + strat.risk_score_adjustment)
        property_fit = _property_fit_for_strategy(
            strat, target_metrics.property_type_fit_score, target.target_property_type
        )

        raw_score = (
            coverage * weights.capital_coverage_weight
            + credit * weights.credit_score_weight
            + liquidity * weights.liquidity_score_weight
            + cash_flow * weights.cash_flow_score_weight
            + eligibility * weights.eligibility_score_weight
            + complexity * weights.complexity_score_weight
            + risk * weights.risk_score_weight
            + property_fit * weights.property_fit_weight
        )
        weighted_score = round(raw_score)

        rows.append(
            ScoredStrategy(
                key=strat.key,
                name=strat.name,
                capital_available=capital_available,
                capital_needed=capital_needed,
                capital_coverage=coverage,
                credit_score=credit,
                liquidity_score=liquidity,
                cash_flow_score=cash_flow,
                eligibility_score=eligibility,
                complexity_score=complexity,
                risk_score=risk,
                property_fit=property_fit,
                weighted_score=weighted_score,
                rank=0,  # set below
                consumer_output=_consumer_output(strat.name, weighted_score, target.target_property_type),
                formula_check=(
                    "Capital need covered" if coverage >= 1.0 else "Capital gap remains"
                ),
                key_tradeoff=strat.key_tradeoff,
                recommendation_type=_recommendation_type(weighted_score, strat.key, target.target_property_type),
                property_type_note=strat.property_type_note,
                product_logic_fit=strat.product_logic_fit,
            )
        )

    # Rank — 1 = highest score. Stable on ties (workbook uses RANK +
    # COUNTIF trick to break ties; here we just take row order).
    ranked = sorted(rows, key=lambda r: r.weighted_score, reverse=True)
    rank_by_key: dict[str, int] = {}
    for i, row in enumerate(ranked, start=1):
        rank_by_key[row.key] = i

    # Re-emit rows with rank attached (frozen dataclass = rebuild).
    return [
        ScoredStrategy(
            key=r.key, name=r.name,
            capital_available=r.capital_available, capital_needed=r.capital_needed,
            capital_coverage=r.capital_coverage,
            credit_score=r.credit_score, liquidity_score=r.liquidity_score,
            cash_flow_score=r.cash_flow_score, eligibility_score=r.eligibility_score,
            complexity_score=r.complexity_score, risk_score=r.risk_score,
            property_fit=r.property_fit, weighted_score=r.weighted_score,
            rank=rank_by_key[r.key],
            consumer_output=r.consumer_output,
            formula_check=r.formula_check,
            key_tradeoff=r.key_tradeoff,
            recommendation_type=r.recommendation_type,
            property_type_note=r.property_type_note,
            product_logic_fit=r.product_logic_fit,
        )
        for r in rows
    ]
