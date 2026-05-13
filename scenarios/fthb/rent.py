"""
scenarios/fthb/rent.py

Continue Renting scenario — keep renting, invest the available cash, and
accumulate residual monthly savings over the comparison horizon.

Mirrors the 'Continue Renting' sheet (rows 4-18) of FTHB_decision map.xlsx.

Key relationship (load-bearing for Van's "savings-capacity coupling"):
    total_net_position = future_value_of_cash + savings_accumulation
The renter pays no down payment, so cash and savings both compound for
the full horizon — this is the natural baseline the buy scenarios are
measured against.
"""
from __future__ import annotations

from dataclasses import dataclass

from .core import (
    cumulative_inflated_rent,
    fv_annuity_monthly,
    fv_compound_annual,
)
from .inputs import FTHBInputs


@dataclass(frozen=True)
class ContinueRentingResult:
    # Rent path economics (B4-B12)
    current_monthly_rent: float
    annual_rent_inflation: float
    horizon_years: float
    cumulative_rent_paid: float
    future_value_of_available_cash: float
    total_net_position: float
    monthly_housing_cost_today: float
    cash_required_now: float
    cash_remaining_now: float

    # Status (B13-B14)
    feasibility_status: str       # "Feasible" | "Not Feasible"
    risk_level: str               # "Low" | "Cash Flow Tight" | "High"

    # Savings impact (B17-B18)
    residual_monthly_savings: float
    projected_savings_accumulation: float


def compute_continue_renting(inputs: FTHBInputs) -> ContinueRentingResult:
    """Compute the Continue Renting scenario."""
    monthly_rent = inputs.current_monthly_rent
    rent_inflation = inputs.annual_rent_inflation
    horizon = inputs.horizon_years

    # B7: cumulative rent paid (geometric annual growth)
    cumulative_rent = cumulative_inflated_rent(monthly_rent, rent_inflation, horizon)

    # B8: FV of available cash, annual compounding (Excel uses ^N where N is years)
    fv_cash = fv_compound_annual(
        inputs.available_cash_for_purchase,
        inputs.return_on_unspent_cash,
        horizon,
    )

    # B17: residual monthly savings = take-home - debts - rent
    residual_savings = (
        inputs.monthly_take_home_income()
        - inputs.monthly_debt_obligations
        - monthly_rent
    )

    # B18: projected savings accumulation, monthly compounding over horizon_years*12
    horizon_months = int(round(horizon * 12))
    savings_accumulation = fv_annuity_monthly(
        residual_savings,
        inputs.return_on_unspent_cash,
        horizon_months,
    )

    # B9: total net position = FV cash + savings accumulation
    total_net = fv_cash + savings_accumulation

    # B13/B14: feasibility + risk
    if residual_savings >= 0:
        feasibility = "Feasible"
        # Risk: "Cash Flow Tight" when residual < $500/mo, else "Low"
        risk = "Cash Flow Tight" if residual_savings < 500 else "Low"
    else:
        feasibility = "Not Feasible"
        risk = "High"

    return ContinueRentingResult(
        current_monthly_rent=monthly_rent,
        annual_rent_inflation=rent_inflation,
        horizon_years=horizon,
        cumulative_rent_paid=cumulative_rent,
        future_value_of_available_cash=fv_cash,
        total_net_position=total_net,
        monthly_housing_cost_today=monthly_rent,
        cash_required_now=0.0,
        cash_remaining_now=inputs.available_cash_for_purchase,
        feasibility_status=feasibility,
        risk_level=risk,
        residual_monthly_savings=residual_savings,
        projected_savings_accumulation=savings_accumulation,
    )
