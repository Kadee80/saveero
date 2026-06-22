"""
portfolio/portfolio_analytics.py

Per-property + portfolio-level analytics. Mirrors sheet 3
(`Portfolio_Analytics`) of the workbook.

For each active existing property we compute:
  - Equity = value - mortgage_balance
  - LTV   = mortgage_balance / value
  - PITIA = monthly_pi + monthly_taxes_ins_hoa
  - Monthly Cash Flow = rent - PITIA - operating_expenses
  - DSCR = rent / PITIA  (0 if PITIA is 0)
  - HELOC Accessible Equity         = MAX(0, value * heloc_max_cltv - balance)
  - Cash-Out Accessible Equity      = MAX(0, value * conv_cash_out_ltv - balance)
  - DSCR / No-Ratio Accessible Equity:
        - investment properties     -> use dscr_cash_out_max_ltv
        - primary residence         -> use no_ratio_max_ltv
        (Both default to 0.75, so the math is the same today; keep the
         distinction so the rule sets can diverge later.)

Portfolio totals are straight sums.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from .inputs import ExistingProperty
from .product_rules import DEFAULT_PRODUCT_RULES, ProductRules


# ---------------------------------------------------------------------------
# Per-property analytics row
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class PropertyAnalytics:
    """Computed metrics for one ExistingProperty."""

    property_type: str
    value: float
    mortgage_balance: float
    equity: float
    ltv: float
    monthly_pi: float
    pitia: float
    rent: float
    operating_expenses: float
    monthly_cash_flow: float
    dscr: float
    heloc_accessible_equity: float
    cash_out_accessible_equity: float
    dscr_no_ratio_accessible_equity: float


# ---------------------------------------------------------------------------
# Portfolio-level totals
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class PortfolioSummary:
    total_property_value: float
    total_mortgage_balance: float
    total_equity: float
    total_monthly_rent: float
    total_monthly_pitia: float
    total_monthly_cash_flow: float
    total_heloc_accessible_equity: float
    total_cash_out_accessible_equity: float
    total_dscr_no_ratio_accessible_equity: float


# ---------------------------------------------------------------------------
# Wrapper that the engine consumes
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class PortfolioAnalytics:
    properties: tuple[PropertyAnalytics, ...]
    summary: PortfolioSummary


# ---------------------------------------------------------------------------
# Calculation helpers
# ---------------------------------------------------------------------------

def _ltv(balance: float, value: float) -> float:
    if value <= 0:
        return 0.0
    return balance / value


def _dscr(rent: float, pitia: float) -> float:
    if pitia <= 0:
        return 0.0
    return rent / pitia


def _accessible_equity(value: float, balance: float, max_ltv: float) -> float:
    """MAX(0, value * max_ltv - balance) — workbook pattern."""
    return max(0.0, value * max_ltv - balance)


def _no_ratio_or_dscr_ltv(use_status: str, rules: ProductRules) -> float:
    """
    Pick the right max LTV for the "DSCR / No-Ratio" accessible-equity
    column based on whether the existing property is owner-occupied or
    being rented. Both defaults are 0.75 so this is a no-op today, but
    the workbook treats them as distinct rules so we keep them split.
    """
    if use_status == "Owner-Occupied":
        return rules.no_ratio_max_ltv
    return rules.dscr_cash_out_max_ltv


def compute_one_property(
    prop: ExistingProperty,
    rules: ProductRules = DEFAULT_PRODUCT_RULES,
) -> PropertyAnalytics:
    pitia = prop.monthly_pi + prop.monthly_taxes_ins_hoa
    monthly_cash_flow = prop.monthly_rent - pitia - prop.monthly_operating_expenses
    return PropertyAnalytics(
        property_type=prop.property_type,
        value=prop.current_value,
        mortgage_balance=prop.mortgage_balance,
        equity=prop.current_value - prop.mortgage_balance,
        ltv=_ltv(prop.mortgage_balance, prop.current_value),
        monthly_pi=prop.monthly_pi,
        pitia=pitia,
        rent=prop.monthly_rent,
        operating_expenses=prop.monthly_operating_expenses,
        monthly_cash_flow=monthly_cash_flow,
        dscr=_dscr(prop.monthly_rent, pitia),
        heloc_accessible_equity=_accessible_equity(
            prop.current_value, prop.mortgage_balance, rules.heloc_max_cltv,
        ),
        cash_out_accessible_equity=_accessible_equity(
            prop.current_value, prop.mortgage_balance, rules.conventional_cash_out_max_ltv,
        ),
        dscr_no_ratio_accessible_equity=_accessible_equity(
            prop.current_value, prop.mortgage_balance,
            _no_ratio_or_dscr_ltv(prop.use_status, rules),
        ),
    )


def compute_portfolio_analytics(
    properties: Iterable[ExistingProperty],
    rules: ProductRules = DEFAULT_PRODUCT_RULES,
) -> PortfolioAnalytics:
    rows = tuple(
        compute_one_property(p, rules)
        for p in properties
        if p.is_active()
    )
    summary = PortfolioSummary(
        total_property_value=sum(r.value for r in rows),
        total_mortgage_balance=sum(r.mortgage_balance for r in rows),
        total_equity=sum(r.equity for r in rows),
        total_monthly_rent=sum(r.rent for r in rows),
        total_monthly_pitia=sum(r.pitia for r in rows),
        total_monthly_cash_flow=sum(r.monthly_cash_flow for r in rows),
        total_heloc_accessible_equity=sum(r.heloc_accessible_equity for r in rows),
        total_cash_out_accessible_equity=sum(r.cash_out_accessible_equity for r in rows),
        total_dscr_no_ratio_accessible_equity=sum(
            r.dscr_no_ratio_accessible_equity for r in rows
        ),
    )
    return PortfolioAnalytics(properties=rows, summary=summary)
