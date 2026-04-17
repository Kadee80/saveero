"""
scenarios/core.py

Excel-conventions math primitives for the scenario engine.

Unlike `mortgage/core.py`, which takes rates as percent (6.75) and terms in
years, these helpers match the client's Home Decision Model spreadsheet
exactly:
  * rates are passed as decimals (0.0675)
  * loan terms are passed in months (360)
  * hold periods are passed in years (5)

Reference formulas (from FINAL_V1_Protected_Home Decision_Model in Excel):
    P&I:                   -PMT(rate/12, term_months, principal)
    Remaining balance:     -FV(rate/12, k_months, -pmt, principal)
    Future home value:     V * (1 + g) ^ hold_years     (annual compounding)

All functions are pure, deterministic, and hand-testable against Excel.
"""
from __future__ import annotations


def pmt_monthly(principal: float, annual_rate: float, term_months: int) -> float:
    """
    Monthly principal + interest payment.

    Equivalent to Excel's -PMT(rate/12, term_months, principal).

    Args:
        principal: Loan amount in dollars.
        annual_rate: Annual rate as a decimal (0.0675, not 6.75).
        term_months: Amortization term in months.

    Returns:
        Positive monthly payment in dollars. Returns 0 if principal or term
        is non-positive.
    """
    if principal <= 0 or term_months <= 0:
        return 0.0
    r = annual_rate / 12.0
    if r == 0:
        return principal / term_months
    factor = (1 + r) ** term_months
    return principal * r * factor / (factor - 1)


def fv_balance(
    principal: float,
    annual_rate: float,
    periods_months: int,
    payment: float,
) -> float:
    """
    Remaining loan balance after `periods_months` payments of `payment`.

    Equivalent to Excel's -FV(rate/12, periods_months, -payment, principal).

    The formula is:
        B_k = P * (1 + r)^k  -  M * ((1 + r)^k - 1) / r

    Clamped to zero if the loan is overpaid (e.g. when periods exceeds term).
    """
    if periods_months <= 0 or principal <= 0:
        return principal
    r = annual_rate / 12.0
    if r == 0:
        balance = principal - payment * periods_months
    else:
        factor = (1 + r) ** periods_months
        balance = principal * factor - payment * (factor - 1) / r
    return max(0.0, balance)


def future_home_value(
    current_value: float,
    annual_appreciation: float,
    hold_years: float,
) -> float:
    """
    V * (1 + g) ^ hold_years — annual (not monthly) compounding.

    The client's model uses annual compounding for home appreciation, which
    is standard in real-estate analysis. Note that the mortgage balance uses
    monthly compounding via `fv_balance`.
    """
    if current_value <= 0:
        return 0.0
    return current_value * (1 + annual_appreciation) ** hold_years
