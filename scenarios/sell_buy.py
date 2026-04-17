"""
scenarios/sell_buy.py

Sell + Buy scenario — sell the current home and purchase a replacement.

Mirrors 'Sell+Buy Scenario' sheet (rows 4–34) in the client's Excel model.
"""
from __future__ import annotations

from dataclasses import dataclass

from .core import fv_balance, future_home_value, pmt_monthly
from .inputs import MasterInputs


@dataclass(frozen=True)
class SellBuyResult:
    # Current home sale proceeds (rows 4–9)
    current_home_sale_price: float
    current_home_selling_costs: float
    current_mortgage_payoff: float
    net_sale_proceeds_before_reserve: float
    cash_reserve_held_back: float
    cash_available_for_next_purchase: float

    # Replacement home purchase (rows 12–18)
    target_new_home_value: float
    required_down_payment: float
    new_purchase_loan_amount: float
    purchase_closing_costs: float
    moving_cost: float
    cash_remaining_at_close: float                 # positive = excess cash
    new_monthly_pi: float

    # Projected value / equity at horizon (rows 21–26)
    future_new_home_value: float
    future_new_mortgage_balance: float
    gross_equity: float
    selling_costs_at_horizon: float
    net_equity_at_horizon: float
    total_net_position: float

    # Monthly ownership cost on replacement home (rows 29–34)
    new_home_monthly_property_tax: float
    new_home_monthly_insurance: float
    new_home_monthly_hoa: float
    new_home_monthly_maintenance: float
    total_monthly_ownership_cost: float
    monthly_ownership_cost_change_vs_stay: float   # positive = lower than stay


def compute_sell_buy(inputs: MasterInputs, stay_total_monthly: float) -> SellBuyResult:
    """
    Compute the Sell + Buy scenario.

    Args:
        inputs: Master inputs.
        stay_total_monthly: Stay scenario's total_monthly_ownership_cost.
            Passed in because the sheet's row 34 references 'Stay Scenario'!B9
            directly. Keeps the scenarios decoupled except through explicit
            scalars.
    """
    # --- Current home sale proceeds ---
    sale_price = inputs.current_home_value
    current_selling_costs = sale_price * inputs.selling_cost_pct
    payoff = inputs.current_mortgage_balance
    net_proceeds_before_reserve = sale_price - current_selling_costs - payoff
    reserve = inputs.cash_reserve_held_back
    cash_available = net_proceeds_before_reserve - reserve

    # --- Replacement home purchase ---
    target = inputs.target_new_home_value
    down_payment = target * inputs.new_down_payment_pct
    new_loan = target - down_payment
    purchase_closing = target * inputs.purchase_closing_cost_pct
    moving = inputs.moving_cost
    cash_remaining = cash_available - down_payment - purchase_closing - moving

    new_pi = pmt_monthly(new_loan, inputs.new_mortgage_rate, inputs.new_mortgage_term_months)

    # --- Projected value / equity at horizon ---
    future_value = future_home_value(target, inputs.annual_appreciation, inputs.hold_years)
    future_balance = fv_balance(
        new_loan,
        inputs.new_mortgage_rate,
        int(inputs.hold_years * 12),
        new_pi,
    )
    gross_equity = future_value - future_balance
    selling_costs_horizon = future_value * inputs.selling_cost_pct
    net_equity = gross_equity - selling_costs_horizon

    # Excel Sell+Buy!B26 = B25 + B17 (net_equity + cash_remaining_at_close)
    total_net = net_equity + cash_remaining

    # --- Monthly ownership cost on replacement home ---
    total_monthly = (
        new_pi
        + inputs.new_home_monthly_property_tax
        + inputs.new_home_monthly_insurance
        + inputs.new_home_monthly_hoa
        + inputs.new_home_monthly_maintenance
    )
    change_vs_stay = stay_total_monthly - total_monthly

    return SellBuyResult(
        current_home_sale_price=sale_price,
        current_home_selling_costs=current_selling_costs,
        current_mortgage_payoff=payoff,
        net_sale_proceeds_before_reserve=net_proceeds_before_reserve,
        cash_reserve_held_back=reserve,
        cash_available_for_next_purchase=cash_available,
        target_new_home_value=target,
        required_down_payment=down_payment,
        new_purchase_loan_amount=new_loan,
        purchase_closing_costs=purchase_closing,
        moving_cost=moving,
        cash_remaining_at_close=cash_remaining,
        new_monthly_pi=new_pi,
        future_new_home_value=future_value,
        future_new_mortgage_balance=future_balance,
        gross_equity=gross_equity,
        selling_costs_at_horizon=selling_costs_horizon,
        net_equity_at_horizon=net_equity,
        total_net_position=total_net,
        new_home_monthly_property_tax=inputs.new_home_monthly_property_tax,
        new_home_monthly_insurance=inputs.new_home_monthly_insurance,
        new_home_monthly_hoa=inputs.new_home_monthly_hoa,
        new_home_monthly_maintenance=inputs.new_home_monthly_maintenance,
        total_monthly_ownership_cost=total_monthly,
        monthly_ownership_cost_change_vs_stay=change_vs_stay,
    )
