"""
scenarios/stay.py

Stay scenario — keep the current home and mortgage unchanged.

Mirrors the 'Stay Scenario' sheet (rows 4–16) in the client's Excel model.
"""
from __future__ import annotations

from dataclasses import dataclass

from .core import fv_balance, future_home_value, pmt_monthly
from .inputs import MasterInputs


@dataclass(frozen=True)
class StayResult:
    # Monthly ownership cost (rows 4–9)
    current_monthly_pi: float
    monthly_property_tax: float
    monthly_insurance: float
    monthly_hoa: float
    monthly_maintenance: float
    total_monthly_ownership_cost: float

    # Projected value / equity at horizon (rows 12–16)
    future_home_value: float
    future_mortgage_balance: float
    gross_equity: float
    selling_costs_at_horizon: float
    net_equity_at_horizon: float

    # Rollup used by the Decision Map (ties to Excel Outputs!B8)
    total_net_position: float


def compute_stay(inputs: MasterInputs) -> StayResult:
    """Compute the Stay scenario from master inputs."""
    pi = pmt_monthly(
        inputs.current_mortgage_balance,
        inputs.current_mortgage_rate,
        inputs.remaining_term_months,
    )

    total_monthly = (
        pi
        + inputs.monthly_property_tax
        + inputs.monthly_insurance
        + inputs.monthly_hoa
        + inputs.monthly_maintenance
    )

    future_value = future_home_value(
        inputs.current_home_value,
        inputs.annual_appreciation,
        inputs.hold_years,
    )

    future_balance = fv_balance(
        inputs.current_mortgage_balance,
        inputs.current_mortgage_rate,
        int(inputs.hold_years * 12),
        pi,
    )

    gross_equity = future_value - future_balance
    selling_costs = future_value * inputs.selling_cost_pct
    net_equity = gross_equity - selling_costs

    # For Stay, total net position = net equity at horizon (Excel Outputs!B8 = 'Stay Scenario'!B16)
    total_net = net_equity

    return StayResult(
        current_monthly_pi=pi,
        monthly_property_tax=inputs.monthly_property_tax,
        monthly_insurance=inputs.monthly_insurance,
        monthly_hoa=inputs.monthly_hoa,
        monthly_maintenance=inputs.monthly_maintenance,
        total_monthly_ownership_cost=total_monthly,
        future_home_value=future_value,
        future_mortgage_balance=future_balance,
        gross_equity=gross_equity,
        selling_costs_at_horizon=selling_costs,
        net_equity_at_horizon=net_equity,
        total_net_position=total_net,
    )
