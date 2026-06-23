"""
portfolio/strategy_scoring.py

The engine core: score and rank acquisition strategies for the user's
target property.

V2 (2026-06-23): rewired to Van's seven-factor model from
`Investor_Objective_Weightings.xlsx`. The factor list is canonical —
schemas.py, portfolioApi.ts, and PortfolioBuilder.tsx all use these
exact names.

Strategies are NOT a closed enum — `_STRATEGIES` is a tuple, adding a
new strategy is one append + per-column functions. Van confirmed in
his original email he intends to grow this list over time.

Factor model (changes from V1):
  - capital_availability       (was capital_coverage; folds eligibility in:
                                if you're ineligible, your capital from
                                this source = 0, so availability = 0)
  - credit_fit                 (was credit_score)
  - liquidity_preservation     (was liquidity_score)
  - cash_flow_impact           (was cash_flow_score)
  - long_term_wealth_impact    (NEW; heuristic — see _long_term_wealth_impact)
  - complexity                 (unchanged)
  - risk                       (unchanged shape; absorbs 30% of the old
                                property-type-fit signal via per-type
                                risk adjustments)

The old `property_type_fit` dimension was split: ~70% of its signal
landed in long_term_wealth_impact (strategy×type fit drives long-term
compounding) and ~30% in risk (strategy×type fit also affects risk).

The old `eligibility` dimension was folded into capital_availability
— "is this strategy eligible for you" and "how much capital does this
strategy give you access to" are the same question expressed two ways.

These three modeling calls were made engineer-led and need Van's
ratification — see the email-to-Van follow-up.
"""
from __future__ import annotations

from dataclasses import dataclass
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
# Strategy keys (v1 — open-ended list, not a closed enum)
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
# Output row — one per strategy
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ScoredStrategy:
    key: StrategyKey
    name: str

    # Capital math (for context — not weighted directly into the score)
    capital_available: float
    capital_needed: float
    capital_coverage_pct: float       # 0.0-1.0 (clamped)

    # The seven scoring dimensions — Van's canonical names. All 0-100.
    capital_availability: float
    credit_fit: float
    liquidity_preservation: float
    cash_flow_impact: float
    long_term_wealth_impact: float
    complexity: float
    risk: float

    # Weighted total — sum(dim * weight) / 100. Lives on 0-100.
    weighted_score: float
    rank: int                         # 1 = best

    # Consumer-facing language
    consumer_output: str
    capital_check: str                # "Capital need covered" / "Capital gap remains"
    key_tradeoff: str
    recommendation_type: str          # "Recommended" / "Alternative" / "Stretch" / "Other"
    property_type_note: str
    product_logic_fit: str


# ---------------------------------------------------------------------------
# Credit-bucket lookup — column E formula across all strategies.
# ---------------------------------------------------------------------------

_CREDIT_BUCKET_SCORES: dict[CreditBucket, float] = {
    "740+":    100,
    "700-739":  90,
    "660-699":  75,
    "<660":     50,
}


def _credit_fit(profile: PortfolioProfile) -> float:
    return _CREDIT_BUCKET_SCORES.get(profile.credit_score_bucket, 50)


# ---------------------------------------------------------------------------
# Property-type risk adjustments — absorbs ~30% of the old
# property_type_fit signal. Negative = riskier (lowers the risk score
# which is "higher = lower risk").
# ---------------------------------------------------------------------------

_TYPE_RISK_ADJUST: dict[TargetPropertyType, float] = {
    "Long-Term Rental":                          0,
    "Short-Term Rental":                        -5,
    "Residential Multifamily (2-4 Units)":       0,
    "Commercial Multifamily (5+ Units)":        -3,
    "Vacation Home":                            -7,
    "Fix & Flip":                              -10,
}


def _risk_score_for_strategy(
    target_type: TargetPropertyType,
    strategy_adjustment: float,
) -> float:
    """
    Base + per-strategy adjustment + per-property-type adjustment.
    Higher = lower risk (i.e. better score on the risk dimension).
    """
    type_baseline = {
        "Long-Term Rental":                       70,
        "Short-Term Rental":                      60,
        "Residential Multifamily (2-4 Units)":    70,
        "Commercial Multifamily (5+ Units)":      55,
        "Vacation Home":                          55,
        "Fix & Flip":                             55,
    }.get(target_type, 65)
    return max(0.0, min(100.0, type_baseline + strategy_adjustment + _TYPE_RISK_ADJUST.get(target_type, 0)))


# ---------------------------------------------------------------------------
# Cash flow impact — same shape as before (rename only)
# ---------------------------------------------------------------------------

def _flip_cash_flow_score(target: TargetProperty, rules: ProductRules) -> float:
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


def _cash_flow_impact(
    target_metrics: TargetPropertyMetrics,
    target: TargetProperty,
    rules: ProductRules,
) -> float:
    if target.target_property_type == "Fix & Flip":
        return _flip_cash_flow_score(target, rules)
    if target_metrics.dscr >= 1.25 and target_metrics.monthly_cash_flow > 0:
        return 85
    if target_metrics.dscr >= rules.minimum_dscr:
        return 65
    return 45


# ---------------------------------------------------------------------------
# Long-Term Wealth Impact — the NEW dimension. Heuristic blend of:
#   - whether the strategy retains the underlying asset(s) (leverage
#     compounds existing equity vs. selling gives up that compounding)
#   - whether the strategy adds leverage to the new acquisition
#   - whether the strategy preserves a favorable existing rate
#   - the target property type's intrinsic long-term wealth profile
#
# Per-strategy LTW base × property-type multiplier × strategy×type fit
# adjustment. Engineer-led — needs Van's ratification.
# ---------------------------------------------------------------------------

_TYPE_LTW_MULTIPLIER: dict[TargetPropertyType, float] = {
    "Long-Term Rental":                       1.00,
    "Short-Term Rental":                      0.90,   # revenue volatility tax
    "Residential Multifamily (2-4 Units)":    1.05,   # forced-appreciation potential
    "Commercial Multifamily (5+ Units)":      1.10,   # NOI growth potential
    "Vacation Home":                          0.80,   # mixed-use drag
    "Fix & Flip":                             0.50,   # not a long-term hold
}


def _long_term_wealth_impact(
    strategy_ltw_base: float,
    strategy_type_fit_adjustment: float,
    target_type: TargetPropertyType,
) -> float:
    """
    LTW = base * type_multiplier + strategy×type adjustment, clamped 0-100.

    Bridge into Fix&Flip = high LTW. Bridge into LTR = terrible LTW
    (you'd have to refi out fast). Captured via the adjustment.
    """
    raw = strategy_ltw_base * _TYPE_LTW_MULTIPLIER.get(target_type, 1.0) + strategy_type_fit_adjustment
    return max(0.0, min(100.0, raw))


# ---------------------------------------------------------------------------
# Strategy definitions — extensible registry.
# Adding a new strategy is one append + per-column functions.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class _StrategyDef:
    key: StrategyKey
    name: str
    capital_available_fn: Callable[
        [PortfolioAnalytics, PortfolioProfile, TargetProperty, ProductRules], float
    ]
    # Long-term wealth base (0-100) — see _long_term_wealth_impact
    ltw_base: float
    liquidity_preservation: float    # 0-100
    complexity: float                # 0-100 (higher = simpler)
    risk_adjustment: float = 0.0     # added to type baseline; negative = riskier
    eligibility_gate: Callable[
        [PortfolioProfile, TargetProperty], bool
    ] | None = None
    """
    Optional gate. If supplied and returns False, capital_available is
    forced to 0 even if the source has equity — folds the old
    eligibility dimension into capital_availability.
    """
    key_tradeoff: str = ""
    product_logic_fit: str = ""
    property_type_note: str = ""


# Capital-available helpers — all take (analytics, profile, target, rules).
def _cash_after_buffer(_a, profile, _t, rules):
    return max(0.0, profile.available_cash - rules.cash_reserve_buffer)


def _heloc_capital(a, _p, _t, _r): return a.summary.total_heloc_accessible_equity
def _cash_out_capital(a, _p, _t, _r): return a.summary.total_cash_out_accessible_equity
def _dscr_capital(a, _p, _t, _r):
    return sum(
        p.dscr_no_ratio_accessible_equity
        for p in a.properties
        if p.property_type != "Primary Residence"
    )
def _no_ratio_capital(a, _p, _t, _r):
    return sum(
        p.dscr_no_ratio_accessible_equity
        for p in a.properties
        if p.property_type == "Primary Residence"
    )
def _sell_capital(a, _p, _t, _r):
    return a.summary.total_equity * 0.93  # net of ~7% selling cost
def _combo_capital(a, _p, _t, _r):
    return a.summary.total_heloc_accessible_equity + (a.summary.total_dscr_no_ratio_accessible_equity * 0.5)
def _bridge_capital(_a, _p, target, rules):
    # Bridge / hard money funds against ARV (when applicable). Outside
    # of Fix & Flip the strategy's eligibility gate will block it, so
    # this just returns 0 for non-flip targets.
    if target.target_property_type == "Fix & Flip" and target.arv > 0:
        return target.arv * rules.bridge_hard_money_advance_pct
    return 0.0


# Strategy×target-type fit adjustments (the residual of the old
# property_type_fit dimension after splitting 70/30 into LTW + risk).
def _strategy_type_fit_adjustment(key: str, t: TargetPropertyType) -> float:
    if key == "dscr_cash_out_on_rental":
        if t in (
            "Long-Term Rental",
            "Short-Term Rental",
            "Residential Multifamily (2-4 Units)",
        ):
            return 10
        return -20
    if key == "bridge_hard_money_private_capital":
        return 40 if t == "Fix & Flip" else -40
    if key == "sell_and_redeploy":
        return -15  # gives up future upside in the sold asset
    return 0


# Per-strategy eligibility gate (returns True if the strategy is
# accessible for this profile + target).
def _gate_credit_ok(profile: PortfolioProfile, _target: TargetProperty) -> bool:
    return _credit_fit(profile) >= 75   # 660-699 or better


def _gate_bridge_eligible(profile: PortfolioProfile, target: TargetProperty) -> bool:
    return (
        target.target_property_type == "Fix & Flip"
        and _credit_fit(profile) >= 75
    )


def _gate_dscr_eligible(profile: PortfolioProfile, target: TargetProperty) -> bool:
    # DSCR is for investment properties; ineligible for owner-occupied
    # primary acquisitions. Vacation home is a coin flip — we let it
    # through but rely on the strategy×type LTW adjustment to penalize.
    return target.target_property_type != "Vacation Home" or _credit_fit(profile) >= 75


_STRATEGIES: tuple[_StrategyDef, ...] = (
    _StrategyDef(
        key="use_available_cash",
        name="Use Available Cash",
        capital_available_fn=_cash_after_buffer,
        ltw_base=55,                   # no leverage = lower long-term compounding
        liquidity_preservation=15,     # cash deployment kills liquidity
        complexity=95,
        risk_adjustment=10,            # safest from a financing-risk lens
        key_tradeoff="Reduces liquidity",
        product_logic_fit="Liquidity-driven",
        property_type_note="Cash is simple but reduces liquidity.",
    ),
    _StrategyDef(
        key="heloc_on_existing_equity",
        name="HELOC on Existing Equity",
        capital_available_fn=_heloc_capital,
        ltw_base=90,                   # retains 1st mortgage rate + adds leverage
        liquidity_preservation=80,
        complexity=75,
        risk_adjustment=-5,            # variable-rate exposure
        key_tradeoff="Adds variable-rate debt",
        product_logic_fit="Equity-access",
        property_type_note="HELOC preserves existing first mortgage while accessing equity.",
    ),
    _StrategyDef(
        key="conventional_cash_out",
        name="Conventional Cash-Out",
        capital_available_fn=_cash_out_capital,
        ltw_base=75,                   # replaces existing mortgage (may lose good rate)
        liquidity_preservation=70,
        complexity=65,
        risk_adjustment=-5,
        key_tradeoff="Pricing/eligibility vary by lender",
        product_logic_fit="Full-doc / equity-access",
        property_type_note="Conventional cash-out can access equity but may be income/DTI constrained.",
    ),
    _StrategyDef(
        key="dscr_cash_out_on_rental",
        name="DSCR Cash-Out on Rental",
        capital_available_fn=_dscr_capital,
        ltw_base=80,                   # retain + leverage on investment asset
        liquidity_preservation=75,
        complexity=70,
        eligibility_gate=_gate_dscr_eligible,
        key_tradeoff="Pricing/eligibility vary by lender",
        product_logic_fit="Rental-income / DSCR",
        property_type_note="DSCR is relevant when rental income supports financing.",
    ),
    _StrategyDef(
        key="no_ratio_asset_based_cash_out",
        name="No-Ratio / Asset-Based Cash-Out",
        capital_available_fn=_no_ratio_capital,
        ltw_base=80,
        liquidity_preservation=75,
        complexity=75,
        eligibility_gate=_gate_credit_ok,
        key_tradeoff="Pricing/eligibility vary by lender",
        product_logic_fit="Equity / no-ratio",
        property_type_note="No-ratio may work when income documentation is difficult but equity is strong.",
    ),
    _StrategyDef(
        key="sell_and_redeploy",
        name="Sell & Redeploy",
        capital_available_fn=_sell_capital,
        ltw_base=45,                   # gives up future upside in sold asset
        liquidity_preservation=60,
        complexity=55,
        risk_adjustment=-10,           # redeployment timing risk
        key_tradeoff="Gives up future upside in sold property",
        product_logic_fit="Redeployment",
        property_type_note="Sell creates capital but gives up future ownership upside.",
    ),
    _StrategyDef(
        key="combination_strategy",
        name="Combination Strategy",
        capital_available_fn=_combo_capital,
        ltw_base=85,
        liquidity_preservation=65,
        complexity=60,
        risk_adjustment=-5,
        eligibility_gate=_gate_credit_ok,
        key_tradeoff="Pricing/eligibility vary by lender",
        product_logic_fit="Blended strategy",
        property_type_note="Combination can pair equity access with product-specific acquisition financing.",
    ),
    _StrategyDef(
        key="bridge_hard_money_private_capital",
        name="Bridge / Hard Money / Private Capital",
        capital_available_fn=_bridge_capital,
        ltw_base=35,                   # short-term/high-cost
        liquidity_preservation=55,
        complexity=30,
        risk_adjustment=-30,
        eligibility_gate=_gate_bridge_eligible,
        key_tradeoff="Higher cost / shorter-term project financing",
        product_logic_fit="Project financing",
        property_type_note="Bridge/hard money is usually lower fit unless the target is a project/flip.",
    ),
)


# ---------------------------------------------------------------------------
# Liquidity preservation — special-cased for "Use Available Cash"
# because deploying cash literally reduces liquidity.
# ---------------------------------------------------------------------------

def _liquidity_preservation_use_cash(
    profile: PortfolioProfile, target_metrics: TargetPropertyMetrics,
) -> float:
    cash = profile.available_cash
    needed = target_metrics.total_capital_needed
    if cash <= 0:
        return 0.0
    return max(0.0, min(100.0, 100.0 * (cash - needed) / max(1.0, cash)))


# ---------------------------------------------------------------------------
# Consumer language
# ---------------------------------------------------------------------------

def _recommendation_type(score: float, key: StrategyKey, _target_type: TargetPropertyType) -> str:
    if score >= 80:
        return "Recommended"
    if score >= 65:
        if key in ("no_ratio_asset_based_cash_out", "sell_and_redeploy"):
            return "Alternative"
        if key == "conventional_cash_out":
            return "Stretch"
    return "Other"


def _consumer_output(name: str, score: float, target_type: TargetPropertyType) -> str:
    verdict = "strong" if score >= 80 else "possible" if score >= 65 else "lower-fit"
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
    credit = _credit_fit(profile)

    for strat in _STRATEGIES:
        # Eligibility-gated capital — folds the old eligibility dimension in.
        eligible = (
            strat.eligibility_gate(profile, target)
            if strat.eligibility_gate
            else True
        )
        capital_available = (
            strat.capital_available_fn(portfolio, profile, target, rules) if eligible else 0.0
        )
        capital_needed = target_metrics.total_capital_needed
        coverage = (
            min(1.0, capital_available / capital_needed)
            if capital_needed > 0
            else 0.0
        )

        # Capital availability (0-100) = coverage × 100, gated by eligibility.
        capital_availability = round(coverage * 100.0, 2)

        # Liquidity preservation — use-cash gets a dynamic value, everyone
        # else uses the strategy's static profile.
        if strat.key == "use_available_cash":
            liquidity = _liquidity_preservation_use_cash(profile, target_metrics)
        else:
            liquidity = strat.liquidity_preservation

        cash_flow = _cash_flow_impact(target_metrics, target, rules)

        # Long-term wealth impact — strategy × type
        ltw = _long_term_wealth_impact(
            strategy_ltw_base=strat.ltw_base,
            strategy_type_fit_adjustment=_strategy_type_fit_adjustment(
                strat.key, target.target_property_type,
            ),
            target_type=target.target_property_type,
        )

        complexity = strat.complexity
        risk = _risk_score_for_strategy(target.target_property_type, strat.risk_adjustment)

        # Final weighted score — weights sum to 100, divide by 100 to land 0-100.
        raw = (
            capital_availability * weights.capital_availability
            + credit * weights.credit_fit
            + liquidity * weights.liquidity_preservation
            + cash_flow * weights.cash_flow_impact
            + ltw * weights.long_term_wealth_impact
            + complexity * weights.complexity
            + risk * weights.risk
        ) / 100.0
        weighted_score = round(raw, 0)

        rows.append(
            ScoredStrategy(
                key=strat.key,
                name=strat.name,
                capital_available=capital_available,
                capital_needed=capital_needed,
                capital_coverage_pct=coverage,
                capital_availability=capital_availability,
                credit_fit=credit,
                liquidity_preservation=liquidity,
                cash_flow_impact=cash_flow,
                long_term_wealth_impact=ltw,
                complexity=complexity,
                risk=risk,
                weighted_score=weighted_score,
                rank=0,
                consumer_output=_consumer_output(strat.name, weighted_score, target.target_property_type),
                capital_check=(
                    "Capital need covered" if coverage >= 1.0 else "Capital gap remains"
                ),
                key_tradeoff=strat.key_tradeoff,
                recommendation_type=_recommendation_type(weighted_score, strat.key, target.target_property_type),
                property_type_note=strat.property_type_note,
                product_logic_fit=strat.product_logic_fit,
            )
        )

    # Rank — 1 = highest score. Ties broken by row order (stable).
    ranked = sorted(rows, key=lambda r: r.weighted_score, reverse=True)
    rank_by_key: dict[str, int] = {r.key: i for i, r in enumerate(ranked, start=1)}

    return [
        ScoredStrategy(
            key=r.key, name=r.name,
            capital_available=r.capital_available, capital_needed=r.capital_needed,
            capital_coverage_pct=r.capital_coverage_pct,
            capital_availability=r.capital_availability,
            credit_fit=r.credit_fit,
            liquidity_preservation=r.liquidity_preservation,
            cash_flow_impact=r.cash_flow_impact,
            long_term_wealth_impact=r.long_term_wealth_impact,
            complexity=r.complexity, risk=r.risk,
            weighted_score=r.weighted_score,
            rank=rank_by_key[r.key],
            consumer_output=r.consumer_output,
            capital_check=r.capital_check,
            key_tradeoff=r.key_tradeoff,
            recommendation_type=r.recommendation_type,
            property_type_note=r.property_type_note,
            product_logic_fit=r.product_logic_fit,
        )
        for r in rows
    ]
