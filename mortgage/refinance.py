"""
mortgage/refinance.py

Refinance analysis: should you refi?

Given the user's current loan (rate, term, balance, elapsed months) and
a hypothetical new loan (rate, term, closing costs), compute:
  - New monthly P&I
  - Monthly savings
  - Break-even month (when cumulative savings exceed closing costs)
  - Lifetime interest savings (or loss — refi isn't always a win)

This is decision-grade output. The logic deliberately compares full remaining
cash outflows on both paths, so a 30-year refinanced into another 30-year
doesn't falsely look like a "savings" just because the monthly goes down.
"""
from __future__ import annotations

from dataclasses import dataclass

from mortgage.core import pmt, remaining_balance


@dataclass(frozen=True)
class CurrentLoan:
    """The borrower's existing mortgage."""
    original_principal: float
    annual_rate_percent: float
    term_years: int
    elapsed_months: int = 0  # how many payments already made


@dataclass(frozen=True)
class RefinanceOffer:
    """A proposed new loan to replace the current one."""
    annual_rate_percent: float
    new_term_years: int
    closing_costs: float = 0.0          # lender fees, title, appraisal, etc.
    cash_out: float = 0.0               # extra cash borrowed against equity
    rolled_in_closing: bool = True       # if True, closing costs are added to the new principal


@dataclass(frozen=True)
class RefinanceResult:
    """Output of `analyze_refinance`."""
    current_balance: float
    current_monthly_pi: float
    current_remaining_months: int
    current_lifetime_remaining_interest: float

    new_loan_amount: float
    new_monthly_pi: float
    new_total_months: int
    new_lifetime_interest: float

    monthly_savings: float              # can be negative
    break_even_month: int                # -1 if never breaks even
    lifetime_savings: float              # vs. staying on current loan
    recommendation: str                  # "refinance" | "hold" | "marginal"
    notes: str


def analyze_refinance(current: CurrentLoan, offer: RefinanceOffer) -> RefinanceResult:
    """
    Compare the cost of staying on the current loan vs. refinancing.

    The comparison is done over the LONGER horizon of the two paths so
    we don't short-change a refinance that extends the term.
    """
    if current.original_principal <= 0 or current.term_years <= 0:
        raise ValueError("current loan must have positive principal and term")
    if offer.new_term_years <= 0:
        raise ValueError("new_term_years must be positive")
    if offer.closing_costs < 0:
        raise ValueError("closing_costs cannot be negative")

    # --- Current loan state ---
    current_balance = remaining_balance(
        current.original_principal,
        current.annual_rate_percent,
        current.term_years,
        current.elapsed_months,
    )
    current_monthly_pi = pmt(
        current.original_principal, current.annual_rate_percent, current.term_years
    )
    current_remaining_months = max(0, current.term_years * 12 - current.elapsed_months)
    # Interest still owed if the borrower holds the current loan to maturity:
    current_remaining_interest = max(
        0.0,
        current_monthly_pi * current_remaining_months - current_balance,
    )

    # --- New loan ---
    new_loan = current_balance + max(0.0, offer.cash_out)
    if offer.rolled_in_closing:
        new_loan += offer.closing_costs
    new_monthly_pi = pmt(new_loan, offer.annual_rate_percent, offer.new_term_years)
    new_total_months = offer.new_term_years * 12
    new_lifetime_interest = max(0.0, new_monthly_pi * new_total_months - new_loan)

    # --- Savings ---
    monthly_savings = current_monthly_pi - new_monthly_pi
    upfront_cost = 0.0 if offer.rolled_in_closing else offer.closing_costs

    # Break-even on monthly savings alone (classic refi calculator).
    # If monthly savings are zero or negative, break-even is never.
    break_even_month = -1
    if monthly_savings > 0 and upfront_cost > 0:
        break_even_month = int(upfront_cost / monthly_savings) + 1
    elif monthly_savings > 0 and upfront_cost == 0 and not offer.rolled_in_closing:
        break_even_month = 1
    elif monthly_savings > 0 and offer.rolled_in_closing:
        # Still useful to report: monthly is better immediately since closing
        # is rolled into the loan. Set to 1 so UI can say "immediate".
        break_even_month = 1

    # Full lifetime cost comparison. Hold path = remaining P&I on current loan.
    # Refi path = all P&I on new loan + any upfront closing not rolled in.
    # Subtract cash_out from the refi side because that's money to the borrower.
    hold_total_cost = current_monthly_pi * current_remaining_months
    refi_total_cost = new_monthly_pi * new_total_months + upfront_cost - max(0.0, offer.cash_out)
    lifetime_savings = hold_total_cost - refi_total_cost

    # --- Recommendation heuristic ---
    # These thresholds are deliberately simple; the UI should explain the reasoning.
    notes_parts = []
    if monthly_savings <= 0:
        recommendation = "hold"
        notes_parts.append("New monthly payment is not lower than the current loan.")
    elif break_even_month > 0 and break_even_month > new_total_months:
        recommendation = "hold"
        notes_parts.append(
            f"Break-even ({break_even_month} months) is past the new loan's term."
        )
    elif lifetime_savings < 0:
        recommendation = "marginal"
        notes_parts.append(
            "Monthly payment is lower, but total lifetime cost is higher — "
            "usually because the new term resets the clock."
        )
    elif break_even_month > 60:  # > 5 years to break even
        recommendation = "marginal"
        notes_parts.append(
            f"Break-even of {break_even_month} months is long — "
            "only a win if you plan to stay in the home well past that."
        )
    else:
        recommendation = "refinance"
        notes_parts.append(
            f"Positive monthly savings and break-even in {break_even_month} months."
        )

    if offer.cash_out > 0:
        notes_parts.append(
            f"${offer.cash_out:,.0f} cash-out is included in the new loan."
        )
    if offer.new_term_years > current.term_years - (current.elapsed_months // 12):
        notes_parts.append(
            "New term is longer than the time remaining on the current loan."
        )

    return RefinanceResult(
        current_balance=current_balance,
        current_monthly_pi=current_monthly_pi,
        current_remaining_months=current_remaining_months,
        current_lifetime_remaining_interest=current_remaining_interest,
        new_loan_amount=new_loan,
        new_monthly_pi=new_monthly_pi,
        new_total_months=new_total_months,
        new_lifetime_interest=new_lifetime_interest,
        monthly_savings=monthly_savings,
        break_even_month=break_even_month,
        lifetime_savings=lifetime_savings,
        recommendation=recommendation,
        notes=" ".join(notes_parts),
    )
