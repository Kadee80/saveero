"""
mortgage/analyzer.py

High-level mortgage analyzer — takes user loan parameters and returns a
comprehensive summary. This is the backend equivalent of the frontend's
`lib/mortgage.ts#analyzeMortgage`; results should match to the cent.

Design notes:
- Pure function — no DB writes, no external calls. Callers (the FastAPI route)
  handle persistence.
- Returns a dataclass so routes can serialize with model_dump or asdict.
- The monthly breakdown uses MONTH 1 principal/interest split so callers
  can display a realistic snapshot. (The JS implementation had a bug here;
  this version is correct.)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from mortgage.core import (
    PMI_ANNUAL_RATE,
    PMI_LTV_THRESHOLD,
    AmortizationRow,
    build_amortization,
    months_until_ltv_threshold,
    monthly_rate,
    pmt,
)


# ---------------------------------------------------------------------------
# Input / output types
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class LoanInputs:
    """Inputs for analyze_mortgage. All monetary fields in dollars."""
    purchase_price: float
    down_payment: float
    annual_rate_percent: float
    term_years: int
    annual_property_tax_percent: float = 0.0  # e.g. 1.2 means 1.2% of purchase price per year
    annual_insurance_dollars: float = 0.0
    monthly_hoa: float = 0.0


@dataclass(frozen=True)
class MonthlyBreakdown:
    """Per-month payment components. Reflects month 1 for P&I split."""
    principal: float
    interest: float
    pmi: float
    property_tax: float
    insurance: float
    hoa: float
    total: float


@dataclass(frozen=True)
class MortgageSummary:
    """Complete analysis for a single loan."""
    loan_amount: float
    ltv: float  # percent (0-100)
    monthly_principal_interest: float
    monthly: MonthlyBreakdown
    total_interest_paid: float
    total_cost_of_loan: float
    amortization: List[AmortizationRow] = field(default_factory=list)
    pmi_required: bool = False
    pmi_drop_off_month: int = 0


# ---------------------------------------------------------------------------
# Analyzer
# ---------------------------------------------------------------------------

def analyze_mortgage(inputs: LoanInputs) -> MortgageSummary:
    """
    Compute full mortgage summary.

    Raises:
        ValueError: If purchase_price <= 0, down_payment > purchase_price, or
        term_years not positive. The route layer should translate these to 400s.
    """
    if inputs.purchase_price <= 0:
        raise ValueError("purchase_price must be positive")
    if inputs.down_payment < 0:
        raise ValueError("down_payment cannot be negative")
    if inputs.down_payment > inputs.purchase_price:
        raise ValueError("down_payment cannot exceed purchase_price")
    if inputs.term_years <= 0:
        raise ValueError("term_years must be positive")
    if inputs.annual_rate_percent < 0:
        raise ValueError("annual_rate_percent cannot be negative")

    loan_amount = inputs.purchase_price - inputs.down_payment
    ltv_fraction = loan_amount / inputs.purchase_price if inputs.purchase_price > 0 else 0
    ltv_percent = ltv_fraction * 100
    pmi_required = ltv_fraction > PMI_LTV_THRESHOLD

    monthly_pi = pmt(loan_amount, inputs.annual_rate_percent, inputs.term_years)
    monthly_tax = inputs.purchase_price * (inputs.annual_property_tax_percent / 100.0) / 12.0
    monthly_insurance = inputs.annual_insurance_dollars / 12.0
    monthly_pmi = (loan_amount * PMI_ANNUAL_RATE / 12.0) if pmi_required else 0.0

    amortization = build_amortization(
        loan_amount, inputs.annual_rate_percent, inputs.term_years
    )

    # Month 1 interest/principal split (interest is biggest in month 1;
    # this is what users want to see in "right now" views).
    first_month_interest = loan_amount * monthly_rate(inputs.annual_rate_percent)
    first_month_principal = max(0.0, monthly_pi - first_month_interest)

    # When PMI drops off
    pmi_drop_off_month = 0
    if pmi_required:
        pmi_drop_off_month = months_until_ltv_threshold(
            inputs.purchase_price, loan_amount,
            inputs.annual_rate_percent, inputs.term_years,
        )

    total_interest = sum(row.interest for row in amortization)

    total_months = inputs.term_years * 12
    total_cost = (
        monthly_pi * total_months
        + monthly_tax * total_months
        + monthly_insurance * total_months
        + inputs.monthly_hoa * total_months
        + monthly_pmi * (pmi_drop_off_month or 0)
    )

    monthly = MonthlyBreakdown(
        principal=first_month_principal,
        interest=first_month_interest,
        pmi=monthly_pmi,
        property_tax=monthly_tax,
        insurance=monthly_insurance,
        hoa=inputs.monthly_hoa,
        total=monthly_pi + monthly_tax + monthly_insurance + monthly_pmi + inputs.monthly_hoa,
    )

    return MortgageSummary(
        loan_amount=loan_amount,
        ltv=ltv_percent,
        monthly_principal_interest=monthly_pi,
        monthly=monthly,
        total_interest_paid=total_interest,
        total_cost_of_loan=total_cost,
        amortization=amortization,
        pmi_required=pmi_required,
        pmi_drop_off_month=pmi_drop_off_month,
    )
