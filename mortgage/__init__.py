"""
mortgage — Saveero's mortgage analysis engine.

Public surface:
    from mortgage import analyze_mortgage, LoanInputs, MortgageSummary
    from mortgage import compute_affordability, AffordabilityInputs
    from mortgage import analyze_refinance, CurrentLoan, RefinanceOffer

Routes at /api/mortgage/* live in api.mortgage_routes.
"""
from mortgage.analyzer import (
    LoanInputs,
    MonthlyBreakdown,
    MortgageSummary,
    analyze_mortgage,
)
from mortgage.affordability import (
    AffordabilityInputs,
    AffordabilityResult,
    compute_affordability,
)
from mortgage.refinance import (
    CurrentLoan,
    RefinanceOffer,
    RefinanceResult,
    analyze_refinance,
)
from mortgage.core import (
    AmortizationRow,
    build_amortization,
    pmt,
    remaining_balance,
)

__all__ = [
    # analyzer
    "LoanInputs",
    "MonthlyBreakdown",
    "MortgageSummary",
    "analyze_mortgage",
    # affordability
    "AffordabilityInputs",
    "AffordabilityResult",
    "compute_affordability",
    # refinance
    "CurrentLoan",
    "RefinanceOffer",
    "RefinanceResult",
    "analyze_refinance",
    # core
    "AmortizationRow",
    "build_amortization",
    "pmt",
    "remaining_balance",
]
