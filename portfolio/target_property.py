"""
portfolio/target_property.py

Target property metrics. Mirrors sheet 4 (`Target_Property`) of the
workbook below the input rows — every "Formula" row from B14 down.

Key derivations:
  - down_payment_pct        — by property type (defaults to profile.target_down_payment_pct;
                              commercial multifamily overrides to product rule)
  - down_payment_needed     — price * down_payment_pct
  - closing_costs_needed    — price * profile.estimated_acquisition_closing_costs_pct
  - total_capital_needed    — down + closing (+ rehab + holding for flips)
  - loan_amount             — price - down
  - monthly_pi              — standard amortization formula on loan amount
  - pitia                   — monthly_pi + taxes_ins_hoa
  - dscr                    — rent / pitia (only meaningful for rentals; 0 for flips)
  - monthly_cash_flow       — rent - pitia - operating_expenses
  - projected_flip_profit   — ARV - purchase - rehab - holding - closing - sale_costs
  - projected_flip_gross_roi
  - property_type_fit       — heuristic 0-100 fit/risk score by property type
  - preferred_financing_theme — plain-English direction (consumer-facing)
  - property_type_logic_note — short paragraph the dashboard surfaces

Heuristic fit scores + financing themes are placeholders calibrated to
the workbook's behavior (LTR=80 in the sample). Tomorrow's discussion
should validate or tune these per property type. They're encoded as a
table at the bottom of this file so swapping values is a one-line edit.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

from .inputs import PortfolioProfile, TargetProperty, TargetPropertyType
from .product_rules import DEFAULT_PRODUCT_RULES, ProductRules


@dataclass(frozen=True)
class TargetPropertyMetrics:
    """Computed metrics + qualitative flags for the target property."""

    # Capital requirements
    down_payment_pct: float
    down_payment_needed: float
    closing_costs_needed: float
    total_capital_needed: float
    loan_amount: float

    # Carrying / cash flow
    monthly_pi: float
    pitia: float
    dscr: float
    monthly_cash_flow: float

    # Fix & Flip outputs (zero for non-flip)
    projected_flip_profit: float
    projected_flip_gross_roi: float

    # Strategy-direction flags
    property_type_fit_score: float       # 0-100
    dscr_relevant: bool
    bridge_hard_money_relevant: bool
    preferred_financing_theme: str
    property_type_logic_note: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _amortized_payment(principal: float, annual_rate: float, term_years: int) -> float:
    """Standard mortgage payment formula. Returns 0 if principal <= 0."""
    if principal <= 0:
        return 0.0
    if annual_rate <= 0:
        # Edge case — interest-free amortization is just straight-line.
        return principal / max(1, term_years * 12)
    n = term_years * 12
    r = annual_rate / 12.0
    return principal * (r * (1 + r) ** n) / ((1 + r) ** n - 1)


# ---------------------------------------------------------------------------
# Property-type lookup table — heuristics, tuned tomorrow with Van.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class _TypeProfile:
    fit_score: float
    dscr_relevant: bool
    bridge_relevant: bool
    financing_theme: str
    logic_note: str


_TYPE_PROFILES: dict[TargetPropertyType, _TypeProfile] = {
    "Long-Term Rental": _TypeProfile(
        fit_score=80,
        dscr_relevant=True,
        bridge_relevant=False,
        financing_theme="DSCR, conventional, HELOC, or equity-access strategies",
        logic_note=(
            "Engine emphasizes DSCR, cash flow and long-term wealth accumulation."
        ),
    ),
    "Short-Term Rental": _TypeProfile(
        fit_score=70,
        dscr_relevant=True,
        bridge_relevant=False,
        financing_theme="STR-friendly DSCR, HELOC, or no-ratio strategies",
        logic_note=(
            "Engine increases the risk score to reflect seasonal revenue volatility; "
            "validate market revenue before relying on this strategy."
        ),
    ),
    "Residential Multifamily (2-4 Units)": _TypeProfile(
        fit_score=75,
        dscr_relevant=True,
        bridge_relevant=False,
        financing_theme="Conventional, DSCR, HELOC, or house-hack strategies",
        logic_note=(
            "Engine treats 2-4 unit multifamily as residential and emphasizes "
            "unit-level rent and aggregate cash flow."
        ),
    ),
    "Commercial Multifamily (5+ Units)": _TypeProfile(
        fit_score=60,
        dscr_relevant=True,
        bridge_relevant=False,
        financing_theme="Commercial multifamily, portfolio, bridge, or agency-style options",
        logic_note=(
            "Engine treats 5+ unit multifamily as commercial — NOI, occupancy, "
            "and cap rate drive the analysis, not residential 1-4 unit logic."
        ),
    ),
    "Vacation Home": _TypeProfile(
        fit_score=60,
        dscr_relevant=False,
        bridge_relevant=False,
        financing_theme="Second-home, STR-oriented, HELOC, or no-ratio options",
        logic_note=(
            "Engine adjusts for personal-use vs rental intent — confirm usage to "
            "tune the recommendation."
        ),
    ),
    "Fix & Flip": _TypeProfile(
        fit_score=50,
        dscr_relevant=False,
        bridge_relevant=True,
        financing_theme="Bridge / hard money, cash, or private capital",
        logic_note=(
            "Engine emphasizes ARV, rehab budget, holding costs, and projected "
            "ROI. DSCR and rental cash flow are not central."
        ),
    ),
}


def _down_payment_pct_for(
    property_type: TargetPropertyType,
    profile: PortfolioProfile,
    rules: ProductRules,
) -> float:
    """
    Default to the profile's target down payment (0.25). Override for
    commercial multifamily per the product rules (0.30). Mirrors the
    workbook's "Formula by property type" note on B11 of Target Property.
    """
    if property_type == "Commercial Multifamily (5+ Units)":
        return rules.commercial_multifamily_default_down_payment_pct
    return profile.target_down_payment_pct


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def compute_target_property(
    target: TargetProperty,
    profile: PortfolioProfile,
    rules: ProductRules = DEFAULT_PRODUCT_RULES,
) -> TargetPropertyMetrics:
    type_profile = _TYPE_PROFILES.get(
        target.target_property_type,
        _TYPE_PROFILES["Long-Term Rental"],
    )

    down_payment_pct = _down_payment_pct_for(target.target_property_type, profile, rules)
    closing_costs_pct = profile.estimated_acquisition_closing_costs_pct

    down_payment_needed = target.target_purchase_price * down_payment_pct
    closing_costs_needed = target.target_purchase_price * closing_costs_pct

    # Flips need rehab + holding capital on top of acquisition.
    is_flip = target.target_property_type == "Fix & Flip"
    flip_capital = target.rehab_budget + target.holding_costs if is_flip else 0.0

    total_capital_needed = down_payment_needed + closing_costs_needed + flip_capital
    loan_amount = target.target_purchase_price - down_payment_needed

    monthly_pi = _amortized_payment(
        principal=loan_amount,
        annual_rate=target.estimated_interest_rate,
        term_years=target.amortization_years,
    )
    pitia = monthly_pi + target.expected_monthly_taxes_ins_hoa

    if pitia > 0 and not is_flip:
        dscr = target.expected_monthly_rent_or_revenue / pitia
    else:
        dscr = 0.0

    monthly_cash_flow = (
        target.expected_monthly_rent_or_revenue
        - pitia
        - target.expected_operating_expenses
    )

    if is_flip:
        sale_costs = target.arv * target.sale_costs_pct
        projected_flip_profit = (
            target.arv
            - target.target_purchase_price
            - target.rehab_budget
            - target.holding_costs
            - closing_costs_needed
            - sale_costs
        )
        projected_flip_gross_roi = (
            projected_flip_profit / total_capital_needed
            if total_capital_needed > 0
            else 0.0
        )
    else:
        projected_flip_profit = 0.0
        projected_flip_gross_roi = 0.0

    return TargetPropertyMetrics(
        down_payment_pct=down_payment_pct,
        down_payment_needed=down_payment_needed,
        closing_costs_needed=closing_costs_needed,
        total_capital_needed=total_capital_needed,
        loan_amount=loan_amount,
        monthly_pi=monthly_pi,
        pitia=pitia,
        dscr=dscr,
        monthly_cash_flow=monthly_cash_flow,
        projected_flip_profit=projected_flip_profit,
        projected_flip_gross_roi=projected_flip_gross_roi,
        property_type_fit_score=type_profile.fit_score,
        dscr_relevant=type_profile.dscr_relevant,
        bridge_hard_money_relevant=type_profile.bridge_relevant,
        preferred_financing_theme=type_profile.financing_theme,
        property_type_logic_note=type_profile.logic_note,
    )
