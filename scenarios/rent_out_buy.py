"""
scenarios/rent_out_buy.py

Rent Out & Buy scenario — keep the current home as a rental AND
purchase a new primary residence. Requires liquidity screening because
the owner must self-fund the new purchase (no current-home sale proceeds).

Mirrors 'Rent Out & Buy Scenario' sheet (rows 4–63) in the client's
Excel model.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .core import fv_balance, future_home_value, pmt_monthly
from .inputs import MasterInputs
from .rent import (
    RentMonthlyFlow,
    RentTaxView,
    _compute_monthly_flow,
    _compute_tax_view,
)


LiquidityStatus = Literal["Feasible", "Stretch", "Not viable"]


@dataclass(frozen=True)
class RentOutBuyResult:
    # Rental side (rows 4–24) — identical structure to the Rent scenario
    monthly_flow: RentMonthlyFlow
    tax_view: RentTaxView

    # New home purchase + monthly carry (rows 27–38)
    target_new_home_value: float
    required_down_payment: float
    new_purchase_loan_amount: float
    purchase_closing_costs: float
    moving_cost: float
    total_upfront_cash_needed: float
    new_monthly_pi: float
    new_home_monthly_property_tax: float
    new_home_monthly_insurance: float
    new_home_monthly_hoa: float
    new_home_monthly_maintenance: float
    total_new_home_monthly_ownership_cost: float

    # Combined monthly cost (rows 39–42)
    net_monthly_housing_cost_before_tax: float
    net_monthly_housing_cost_after_tax: float
    monthly_housing_cost_change_vs_stay: float     # positive = lower than stay (pre-tax)
    after_tax_monthly_impact_vs_stay: float        # positive = lower than stay (after-tax)

    # Projected value / equity at horizon (rows 45–57)
    future_current_home_value: float
    future_current_mortgage_balance: float
    current_home_gross_equity: float
    current_home_selling_costs_at_horizon: float
    current_home_net_equity_at_horizon: float
    future_new_home_value: float
    future_new_mortgage_balance: float
    new_home_gross_equity: float
    new_home_selling_costs_at_horizon: float
    new_home_net_equity_at_horizon: float
    cumulative_after_tax_rental_cash_flow: float
    make_ready_cost: float
    total_net_position: float

    # Liquidity & feasibility (rows 60–63)
    available_cash_for_purchase: float
    cash_surplus_or_shortfall: float
    liquidity_status: LiquidityStatus
    execution_note: str


def compute_rent_out_buy(
    inputs: MasterInputs,
    stay_total_monthly: float,
) -> RentOutBuyResult:
    """
    Compute the Rent Out & Buy scenario.

    Args:
        inputs: Master inputs.
        stay_total_monthly: Stay scenario's total_monthly_ownership_cost.
            Passed in because Excel rows 41–42 reference 'Stay Scenario'!B9.
    """
    # --- Rental side (same as Rent) ---
    monthly = _compute_monthly_flow(inputs)
    tax = _compute_tax_view(inputs, monthly.monthly_cash_flow_before_tax)

    # --- New home purchase ---
    target = inputs.target_new_home_value
    down_payment = target * inputs.new_down_payment_pct
    new_loan = target - down_payment
    purchase_closing = target * inputs.purchase_closing_cost_pct
    moving = inputs.moving_cost

    # Excel B32 = B28 + B30 + B31 (down + closing + moving) — NOT the new_loan
    upfront_cash_needed = down_payment + purchase_closing + moving

    new_pi = pmt_monthly(new_loan, inputs.new_mortgage_rate, inputs.new_mortgage_term_months)

    nh_tax = inputs.new_home_monthly_property_tax
    nh_ins = inputs.new_home_monthly_insurance
    nh_hoa = inputs.new_home_monthly_hoa
    nh_maint = inputs.new_home_monthly_maintenance
    new_home_total_monthly = new_pi + nh_tax + nh_ins + nh_hoa + nh_maint

    # Excel B39 = B38 - B15 (new home carry minus rental pre-tax cash flow)
    net_monthly_before_tax = new_home_total_monthly - monthly.monthly_cash_flow_before_tax
    # Excel B40 = B38 - B24
    net_monthly_after_tax = new_home_total_monthly - tax.monthly_cash_flow_after_tax

    change_vs_stay_pretax = stay_total_monthly - net_monthly_before_tax
    change_vs_stay_aftertax = stay_total_monthly - net_monthly_after_tax

    # --- Projected value / equity at horizon ---
    future_current = future_home_value(
        inputs.current_home_value,
        inputs.annual_appreciation,
        inputs.hold_years,
    )
    future_current_bal = fv_balance(
        inputs.current_mortgage_balance,
        inputs.current_mortgage_rate,
        int(inputs.hold_years * 12),
        monthly.current_monthly_pi,
    )
    current_gross = future_current - future_current_bal
    current_selling = future_current * inputs.selling_cost_pct
    current_net = current_gross - current_selling

    future_new = future_home_value(target, inputs.annual_appreciation, inputs.hold_years)
    future_new_bal = fv_balance(
        new_loan,
        inputs.new_mortgage_rate,
        int(inputs.hold_years * 12),
        new_pi,
    )
    new_gross = future_new - future_new_bal
    new_selling = future_new * inputs.selling_cost_pct
    new_net = new_gross - new_selling

    cumulative_cash_flow = tax.monthly_cash_flow_after_tax * 12 * inputs.hold_years

    # Excel B57 = B49 + B54 + B55 - B56 - B32
    total_net = (
        current_net + new_net + cumulative_cash_flow
        - inputs.make_ready_cost - upfront_cash_needed
    )

    # --- Liquidity & feasibility ---
    available = inputs.available_cash_for_purchase
    surplus = available - upfront_cash_needed

    # Excel B62 = IF(surplus<0,"Not viable",
    #              IF(surplus<MAX(10000, available*0.10),"Stretch","Feasible"))
    stretch_threshold = max(10_000.0, available * 0.10)
    if surplus < 0:
        status: LiquidityStatus = "Not viable"
        note = "Insufficient available cash."
    elif surplus < stretch_threshold:
        status = "Stretch"
        note = "Passes cash screen."
    else:
        status = "Feasible"
        note = "Passes cash screen."

    return RentOutBuyResult(
        monthly_flow=monthly,
        tax_view=tax,
        target_new_home_value=target,
        required_down_payment=down_payment,
        new_purchase_loan_amount=new_loan,
        purchase_closing_costs=purchase_closing,
        moving_cost=moving,
        total_upfront_cash_needed=upfront_cash_needed,
        new_monthly_pi=new_pi,
        new_home_monthly_property_tax=nh_tax,
        new_home_monthly_insurance=nh_ins,
        new_home_monthly_hoa=nh_hoa,
        new_home_monthly_maintenance=nh_maint,
        total_new_home_monthly_ownership_cost=new_home_total_monthly,
        net_monthly_housing_cost_before_tax=net_monthly_before_tax,
        net_monthly_housing_cost_after_tax=net_monthly_after_tax,
        monthly_housing_cost_change_vs_stay=change_vs_stay_pretax,
        after_tax_monthly_impact_vs_stay=change_vs_stay_aftertax,
        future_current_home_value=future_current,
        future_current_mortgage_balance=future_current_bal,
        current_home_gross_equity=current_gross,
        current_home_selling_costs_at_horizon=current_selling,
        current_home_net_equity_at_horizon=current_net,
        future_new_home_value=future_new,
        future_new_mortgage_balance=future_new_bal,
        new_home_gross_equity=new_gross,
        new_home_selling_costs_at_horizon=new_selling,
        new_home_net_equity_at_horizon=new_net,
        cumulative_after_tax_rental_cash_flow=cumulative_cash_flow,
        make_ready_cost=inputs.make_ready_cost,
        total_net_position=total_net,
        available_cash_for_purchase=available,
        cash_surplus_or_shortfall=surplus,
        liquidity_status=status,
        execution_note=note,
    )
