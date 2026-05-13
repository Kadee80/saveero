"""
scenarios/fthb/_buy_common.py

Shared computation for the three buy-now scenarios:
    - Buy Starter Home  (default rate, no DPA)
    - Buy Preferred Home (default rate, no DPA, different price)
    - Buy with Assistance (default rate + 0.005 premium, DPA reduces
                           cash-to-close, DPA principal subtracted from
                           equity at horizon)

Lifting the shared logic into one function keeps the per-scenario
modules thin and prevents drift across the three sheets, which in the
Excel are near-duplicates with three small but load-bearing differences:
    1. price source (Inputs!B12 vs B13 vs B12-but-DPA)
    2. effective rate (default vs default + 0.005)
    3. equity adjustment at horizon (none vs none vs minus DPA principal)

The returned dataclass mirrors the canonical row layout used by Buy
Starter Home and Buy Preferred Home (residual savings on row 34, savings
accumulation on row 35). The Assistance sheet shifts those to rows 46
and 47 because of the DPA caveats text — we surface the same logical
fields here regardless.
"""
from __future__ import annotations

from dataclasses import dataclass

from scenarios.core import fv_balance, future_home_value, pmt_monthly

from .core import fv_annuity_monthly, fv_compound_annual
from .inputs import FTHBInputs


@dataclass(frozen=True)
class BuyScenarioResult:
    # Purchase structure (B4-B10)
    target_purchase_price: float
    universal_down_payment: float
    purchase_closing_costs: float
    assistance_benefit: float
    total_cash_required_at_close: float
    cash_remaining_after_close: float
    new_loan_amount: float

    # Monthly affordability (B13-B19)
    monthly_principal_and_interest: float
    monthly_property_tax: float
    monthly_insurance: float
    monthly_hoa: float
    monthly_maintenance: float
    total_monthly_housing_payment: float
    dti: float

    # Projected value / equity at horizon (B22-B26)
    future_home_value: float
    future_loan_balance: float
    net_equity_at_horizon: float
    future_value_of_remaining_cash: float
    total_net_position: float

    # Feasibility (B29-B31)
    liquidity_cushion_threshold: float
    feasibility_status: str       # "Feasible" | "Not Feasible"
    risk_level: str               # "High" | "Thin Liquidity" | "Cash Flow Tight" | "Moderate" | "Higher"

    # Savings impact (B34-B35 / B46-B47 on Assistance)
    residual_monthly_savings: float
    projected_savings_accumulation: float


def compute_buy_scenario(
    inputs: FTHBInputs,
    *,
    target_price: float,
    rate_premium: float = 0.0,
    assistance_benefit: float = 0.0,
    dpa_principal_repaid_at_horizon: float = 0.0,
    cash_flow_tight_label: str = "Moderate",
) -> BuyScenarioResult:
    """
    Run a buy scenario. The three buy sheets only differ via the keyword
    arguments here:

        Starter:    target_price=starter_home_price
        Preferred:  target_price=preferred_home_price,
                    cash_flow_tight_label="Higher"
        Assistance: target_price=starter_home_price,
                    rate_premium=0.005,
                    assistance_benefit=available_dpa,
                    dpa_principal_repaid_at_horizon=available_dpa

    `cash_flow_tight_label` is the last branch of the Excel risk IF
    chain. Starter + Assistance use "Moderate"; Preferred uses "Higher".
    Same value as in Excel — preserved here verbatim so the strings
    match the spec.
    """
    # Effective rate including any DPA premium.
    rate = inputs.mortgage_rate + rate_premium

    # ---- Purchase structure (B4-B10) ----
    closing_costs = target_price * inputs.purchase_closing_cost_pct
    cash_required = max(0.0, inputs.universal_down_payment + closing_costs - assistance_benefit)
    cash_remaining = inputs.available_cash_for_purchase - cash_required
    loan_amount = target_price - inputs.universal_down_payment

    # ---- Monthly affordability (B13-B19) ----
    pi = pmt_monthly(loan_amount, rate, inputs.mortgage_term_months)
    monthly_property_tax = target_price * inputs.property_tax_annual_pct / 12.0
    monthly_insurance = target_price * inputs.insurance_annual_pct / 12.0
    monthly_hoa = inputs.monthly_hoa
    monthly_maintenance = target_price * inputs.maintenance_annual_pct / 12.0
    total_monthly = (
        pi + monthly_property_tax + monthly_insurance + monthly_hoa + monthly_maintenance
    )
    # B19: DTI = (housing payment + monthly debt) / monthly gross income
    monthly_gross_income = inputs.annual_household_income / 12.0
    if monthly_gross_income > 0:
        dti = (total_monthly + inputs.monthly_debt_obligations) / monthly_gross_income
    else:
        dti = 0.0

    # ---- Projected value / equity at horizon (B22-B26) ----
    fhv = future_home_value(target_price, inputs.annual_home_appreciation, inputs.horizon_years)
    horizon_months = int(round(inputs.horizon_years * 12))
    fv_loan = fv_balance(loan_amount, rate, horizon_months, pi)
    net_equity = fhv - fv_loan - dpa_principal_repaid_at_horizon
    fv_remaining_cash = fv_compound_annual(
        cash_remaining, inputs.return_on_unspent_cash, inputs.horizon_years
    )

    # ---- Savings impact (B34-B35 / B46-B47) ----
    residual_savings = (
        inputs.monthly_take_home_income()
        - inputs.monthly_debt_obligations
        - total_monthly
    )
    savings_accumulation = fv_annuity_monthly(
        residual_savings, inputs.return_on_unspent_cash, horizon_months
    )

    # B26: total net position = equity + FV remaining cash + savings accumulation
    total_net_position = net_equity + fv_remaining_cash + savings_accumulation

    # ---- Feasibility (B29-B31) ----
    cushion = max(
        inputs.min_post_close_cushion,
        inputs.available_cash_for_purchase * inputs.post_close_cushion_pct,
    )
    feasible = cash_remaining >= 0 and dti <= inputs.max_dti and residual_savings >= 0
    feasibility = "Feasible" if feasible else "Not Feasible"
    if not feasible:
        risk = "High"
    elif cash_remaining < cushion:
        risk = "Thin Liquidity"
    elif residual_savings < 500:
        risk = "Cash Flow Tight"
    else:
        risk = cash_flow_tight_label

    return BuyScenarioResult(
        target_purchase_price=target_price,
        universal_down_payment=inputs.universal_down_payment,
        purchase_closing_costs=closing_costs,
        assistance_benefit=assistance_benefit,
        total_cash_required_at_close=cash_required,
        cash_remaining_after_close=cash_remaining,
        new_loan_amount=loan_amount,
        monthly_principal_and_interest=pi,
        monthly_property_tax=monthly_property_tax,
        monthly_insurance=monthly_insurance,
        monthly_hoa=monthly_hoa,
        monthly_maintenance=monthly_maintenance,
        total_monthly_housing_payment=total_monthly,
        dti=dti,
        future_home_value=fhv,
        future_loan_balance=fv_loan,
        net_equity_at_horizon=net_equity,
        future_value_of_remaining_cash=fv_remaining_cash,
        total_net_position=total_net_position,
        liquidity_cushion_threshold=cushion,
        feasibility_status=feasibility,
        risk_level=risk,
        residual_monthly_savings=residual_savings,
        projected_savings_accumulation=savings_accumulation,
    )
