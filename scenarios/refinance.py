"""
scenarios/refinance.py

Refinance scenario — pay off the current loan with a new one at the
refinance rate. Closing costs may be financed (rolled into the new
balance) or paid cash at close.

Mirrors 'Refinance Scenario' sheet (rows 4–27) in the client's Excel model.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .core import fv_balance, future_home_value, pmt_monthly
from .inputs import MasterInputs


@dataclass(frozen=True)
class RefinanceResult:
    # New refinance structure (rows 4–11)
    current_monthly_pi: float
    refinance_closing_costs: float
    refinance_closing_costs_financed: float
    new_loan_amount: float
    new_monthly_pi: float
    monthly_payment_change: float                 # positive = savings
    cash_to_close: float
    break_even_months: Optional[float]            # None if savings ≤ 0

    # Projected value / equity at horizon (rows 14–20)
    future_home_value: float
    future_refinance_loan_balance: float
    gross_equity: float
    selling_costs_at_horizon: float
    net_equity_at_horizon: float
    cumulative_payment_savings: float
    total_net_position: float

    # Monthly ownership cost after refinance (rows 23–27)
    monthly_property_tax: float
    monthly_insurance: float
    monthly_hoa: float
    monthly_maintenance: float
    total_monthly_ownership_cost: float


def compute_refinance(inputs: MasterInputs) -> RefinanceResult:
    """Compute the Refinance scenario from master inputs."""
    current_pi = inputs.current_monthly_pi()

    closing_costs = inputs.current_mortgage_balance * inputs.refinance_closing_cost_pct
    financed_flag = 1.0 if inputs.refinance_closing_costs_financed else 0.0
    financed_amount = closing_costs * financed_flag
    new_loan = inputs.current_mortgage_balance + financed_amount

    new_pi = pmt_monthly(new_loan, inputs.refinance_rate, inputs.refinance_term_months)
    payment_change = current_pi - new_pi  # positive = savings
    cash_to_close = closing_costs - financed_amount

    # Excel: =IF(B9>0, B5 / B9, "N/A") — break-even is only defined when saving
    if payment_change > 0:
        break_even: Optional[float] = closing_costs / payment_change
    else:
        break_even = None

    future_value = future_home_value(
        inputs.current_home_value,
        inputs.annual_appreciation,
        inputs.hold_years,
    )

    future_balance = fv_balance(
        new_loan,
        inputs.refinance_rate,
        int(inputs.hold_years * 12),
        new_pi,
    )

    gross_equity = future_value - future_balance
    selling_costs = future_value * inputs.selling_cost_pct
    net_equity = gross_equity - selling_costs

    cumulative_savings = payment_change * 12 * inputs.hold_years

    # Excel Refinance!B20 = B18 + B19 - B10 (net_equity + savings - cash_to_close)
    total_net = net_equity + cumulative_savings - cash_to_close

    total_monthly = (
        new_pi
        + inputs.monthly_property_tax
        + inputs.monthly_insurance
        + inputs.monthly_hoa
        + inputs.monthly_maintenance
    )

    return RefinanceResult(
        current_monthly_pi=current_pi,
        refinance_closing_costs=closing_costs,
        refinance_closing_costs_financed=financed_amount,
        new_loan_amount=new_loan,
        new_monthly_pi=new_pi,
        monthly_payment_change=payment_change,
        cash_to_close=cash_to_close,
        break_even_months=break_even,
        future_home_value=future_value,
        future_refinance_loan_balance=future_balance,
        gross_equity=gross_equity,
        selling_costs_at_horizon=selling_costs,
        net_equity_at_horizon=net_equity,
        cumulative_payment_savings=cumulative_savings,
        total_net_position=total_net,
        monthly_property_tax=inputs.monthly_property_tax,
        monthly_insurance=inputs.monthly_insurance,
        monthly_hoa=inputs.monthly_hoa,
        monthly_maintenance=inputs.monthly_maintenance,
        total_monthly_ownership_cost=total_monthly,
    )
