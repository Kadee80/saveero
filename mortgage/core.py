"""
mortgage/core.py

Pure mortgage math — no side effects, no I/O, no database.
Every function is deterministic and hand-testable against a spec.

Convention: US fixed-rate mortgages, monthly compounding, 30/360 day count.
All dollar amounts are floats; callers are responsible for rounding for display.

Formula reference:
    Monthly P&I:  M = P * r*(1+r)^n / ((1+r)^n - 1)
        P = principal, r = monthly rate, n = months
    Remaining balance after k payments:
        B_k = P*(1+r)^k  -  M*((1+r)^k - 1)/r
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Annual PMI rate as a fraction of the original loan (industry rough average).
#: Real PMI varies with credit score and LTV; this is a reasonable estimate
#: that mirrors the frontend calculator for parity.
PMI_ANNUAL_RATE = 0.005  # 0.5%

#: LTV threshold (as a fraction) at or below which PMI automatically drops.
#: Federal law actually allows borrower-requested cancellation at 80% LTV and
#: automatic termination at 78% LTV, but 80% is the common industry quote.
PMI_LTV_THRESHOLD = 0.80

#: Maximum front-end DTI (housing payment / gross monthly income) considered
#: affordable by default. The MVP plan specifies 35%; conservative lenders
#: prefer 28%. Callers may override.
DEFAULT_MAX_FRONT_END_DTI = 0.35

#: Maximum back-end DTI (all monthly debts / gross monthly income) — 43% is
#: the QM (Qualified Mortgage) rule threshold.
DEFAULT_MAX_BACK_END_DTI = 0.43


# ---------------------------------------------------------------------------
# Primitive math
# ---------------------------------------------------------------------------

def monthly_rate(annual_rate_percent: float) -> float:
    """Convert an annual rate in percent (e.g. 6.75) to a monthly rate (0.005625)."""
    return annual_rate_percent / 100.0 / 12.0


def pmt(principal: float, annual_rate_percent: float, term_years: int) -> float:
    """
    Monthly principal + interest payment for a fully amortizing fixed loan.

    Args:
        principal: Initial loan amount (dollars).
        annual_rate_percent: Annual interest rate in percent (6.75, not 0.0675).
        term_years: Loan term in years.

    Returns:
        Monthly P&I payment in dollars. If principal is 0, returns 0.
        If rate is 0, returns straight-line amortization.
    """
    if principal <= 0 or term_years <= 0:
        return 0.0
    r = monthly_rate(annual_rate_percent)
    n = term_years * 12
    if r == 0:
        return principal / n
    return principal * r * (1 + r) ** n / ((1 + r) ** n - 1)


def remaining_balance(
    principal: float,
    annual_rate_percent: float,
    term_years: int,
    elapsed_months: int,
) -> float:
    """
    Closed-form remaining balance after `elapsed_months` payments on a fixed loan.

    Useful for "what's my payoff after 5 years?" without iterating the schedule.
    """
    if elapsed_months <= 0 or principal <= 0:
        return principal
    n = term_years * 12
    if elapsed_months >= n:
        return 0.0
    r = monthly_rate(annual_rate_percent)
    if r == 0:
        return max(0.0, principal - (principal / n) * elapsed_months)
    m = pmt(principal, annual_rate_percent, term_years)
    balance = principal * (1 + r) ** elapsed_months - m * ((1 + r) ** elapsed_months - 1) / r
    return max(0.0, balance)


# ---------------------------------------------------------------------------
# Amortization schedule
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class AmortizationRow:
    """One month in the amortization schedule."""
    month: int
    payment: float
    principal: float
    interest: float
    balance: float


def build_amortization(
    principal: float,
    annual_rate_percent: float,
    term_years: int,
) -> List[AmortizationRow]:
    """
    Build the full month-by-month amortization schedule.

    The last row's balance may be a few cents above or below zero due to
    floating-point rounding; display code should treat anything under $1 as paid off.
    """
    if principal <= 0 or term_years <= 0:
        return []
    r = monthly_rate(annual_rate_percent)
    n = term_years * 12
    payment = pmt(principal, annual_rate_percent, term_years)
    balance = principal

    rows: List[AmortizationRow] = []
    for month in range(1, n + 1):
        interest_portion = balance * r
        principal_portion = payment - interest_portion
        balance = max(0.0, balance - principal_portion)
        rows.append(AmortizationRow(
            month=month,
            payment=payment,
            principal=principal_portion,
            interest=interest_portion,
            balance=balance,
        ))
    return rows


def months_until_ltv_threshold(
    purchase_price: float,
    loan_amount: float,
    annual_rate_percent: float,
    term_years: int,
    ltv_threshold: float = PMI_LTV_THRESHOLD,
) -> int:
    """
    Number of months until the loan balance drops to `ltv_threshold * purchase_price`.
    Used to estimate when PMI falls off.

    Returns the full term in months if the threshold is never reached
    (e.g. if the user already has enough equity, returns 0).
    """
    if purchase_price <= 0:
        return 0
    target_balance = purchase_price * ltv_threshold
    if loan_amount <= target_balance:
        return 0
    schedule = build_amortization(loan_amount, annual_rate_percent, term_years)
    for row in schedule:
        if row.balance <= target_balance:
            return row.month
    return term_years * 12


# ---------------------------------------------------------------------------
# Housing affordability helpers
# ---------------------------------------------------------------------------

def max_housing_payment(
    annual_income: float,
    max_front_end_dti: float = DEFAULT_MAX_FRONT_END_DTI,
) -> float:
    """
    Maximum monthly housing payment (PITI) the borrower can support based on
    front-end DTI. Does not account for other debts; see `max_housing_payment_backend`.
    """
    if annual_income <= 0:
        return 0.0
    return (annual_income / 12.0) * max_front_end_dti


def max_housing_payment_backend(
    annual_income: float,
    monthly_debts: float,
    max_back_end_dti: float = DEFAULT_MAX_BACK_END_DTI,
) -> float:
    """
    Maximum monthly housing payment that keeps total debt load (housing + other
    monthly debts) within `max_back_end_dti`.
    """
    if annual_income <= 0:
        return 0.0
    allowed_total = (annual_income / 12.0) * max_back_end_dti
    return max(0.0, allowed_total - max(0.0, monthly_debts))


def principal_for_payment(
    monthly_payment: float,
    annual_rate_percent: float,
    term_years: int,
) -> float:
    """
    Inverse of `pmt`: given a target monthly P&I payment, return the principal
    that payment can support.

    Used by the affordability analyzer to convert "max monthly payment" back
    into "max loan amount, therefore max home price".
    """
    if monthly_payment <= 0 or term_years <= 0:
        return 0.0
    r = monthly_rate(annual_rate_percent)
    n = term_years * 12
    if r == 0:
        return monthly_payment * n
    return monthly_payment * ((1 + r) ** n - 1) / (r * (1 + r) ** n)
