"""
scenarios/rent.py

Rent scenario — keep the current home and rent it out as an investment.

Important caveat (from the client's model):
    This scenario excludes the cost of next housing for the owner — it
    represents the investment economics of the current home only, not a
    full housing comparison. The Rent Out & Buy scenario is the version
    that includes the next residence.

Mirrors 'Rent Scenario' sheet (rows 4–34) in the client's Excel model.
"""
from __future__ import annotations

from dataclasses import dataclass

from .core import fv_balance, future_home_value
from .inputs import MasterInputs


@dataclass(frozen=True)
class RentMonthlyFlow:
    """Monthly cash flow detail — shared by Rent and Rent Out & Buy."""
    gross_monthly_rent: float
    vacancy_allowance: float
    effective_rent_collected: float
    management_fee: float
    maintenance_reserve: float
    other_rental_expense: float
    monthly_property_tax: float
    monthly_insurance: float
    monthly_hoa: float
    total_operating_expenses_before_debt: float
    current_monthly_pi: float
    monthly_cash_flow_before_tax: float


@dataclass(frozen=True)
class RentTaxView:
    """Simple tax-adjusted cash flow view — shared by Rent and Rent Out & Buy."""
    mortgage_balance_after_12_months: float
    first_year_mortgage_interest_deduction: float
    annual_depreciation: float
    annual_taxable_rental_income: float
    annual_tax_benefit: float
    monthly_tax_benefit: float
    monthly_cash_flow_after_tax: float


@dataclass(frozen=True)
class RentResult:
    monthly_flow: RentMonthlyFlow
    tax_view: RentTaxView

    # Projected value / equity at horizon (rows 27–34)
    future_home_value: float
    future_mortgage_balance: float
    gross_equity: float
    selling_costs_at_horizon: float
    net_equity_at_horizon: float
    cumulative_after_tax_rental_cash_flow: float
    make_ready_cost: float
    total_net_position: float


def _compute_monthly_flow(inputs: MasterInputs) -> RentMonthlyFlow:
    """Row 4–15 of the Rent Scenario sheet. Shared with Rent Out & Buy."""
    gross_rent = inputs.gross_monthly_rent
    vacancy = gross_rent * inputs.vacancy_rate
    effective_rent = gross_rent - vacancy
    mgmt_fee = gross_rent * inputs.management_fee_pct
    maint_reserve = gross_rent * inputs.maintenance_reserve_pct
    other_exp = inputs.other_rental_expense_monthly

    prop_tax = inputs.monthly_property_tax
    insurance = inputs.monthly_insurance
    hoa = inputs.monthly_hoa

    # Excel Rent!B13 = SUM(B7:B12) — management fee through HOA, NOT maintenance reserve duplicated
    # The sheet's SUM(B7:B12) covers: mgmt_fee, maint_reserve, other_exp, prop_tax, insurance, hoa
    operating_expenses = mgmt_fee + maint_reserve + other_exp + prop_tax + insurance + hoa

    current_pi = inputs.current_monthly_pi()
    cash_flow_before_tax = effective_rent - operating_expenses - current_pi

    return RentMonthlyFlow(
        gross_monthly_rent=gross_rent,
        vacancy_allowance=vacancy,
        effective_rent_collected=effective_rent,
        management_fee=mgmt_fee,
        maintenance_reserve=maint_reserve,
        other_rental_expense=other_exp,
        monthly_property_tax=prop_tax,
        monthly_insurance=insurance,
        monthly_hoa=hoa,
        total_operating_expenses_before_debt=operating_expenses,
        current_monthly_pi=current_pi,
        monthly_cash_flow_before_tax=cash_flow_before_tax,
    )


def _compute_tax_view(inputs: MasterInputs, cash_flow_before_tax: float) -> RentTaxView:
    """Row 18–24. Shared with Rent Out & Buy."""
    current_pi = inputs.current_monthly_pi()

    # Balance after 12 months of the current mortgage
    bal_after_12 = fv_balance(
        inputs.current_mortgage_balance,
        inputs.current_mortgage_rate,
        12,
        current_pi,
    )

    # Excel Rent!B19 = B9*12 - (B6 - B18)
    # i.e. annual payments - principal paid = first-year interest
    first_year_interest = current_pi * 12 - (inputs.current_mortgage_balance - bal_after_12)

    # Excel Rent!B20 = (B5 * (1 - B18)) / 27.5 — only building value depreciates
    annual_depreciation = (
        inputs.current_home_value * (1 - inputs.land_value_pct)
    ) / 27.5

    # Excel Rent!B21 = B15*12 - B19 - B20
    annual_taxable = cash_flow_before_tax * 12 - first_year_interest - annual_depreciation

    # Excel Rent!B22 = -B21 * marginal_tax_rate
    annual_tax_benefit = -annual_taxable * inputs.marginal_tax_rate
    monthly_tax_benefit = annual_tax_benefit / 12.0
    cash_flow_after_tax = cash_flow_before_tax + monthly_tax_benefit

    return RentTaxView(
        mortgage_balance_after_12_months=bal_after_12,
        first_year_mortgage_interest_deduction=first_year_interest,
        annual_depreciation=annual_depreciation,
        annual_taxable_rental_income=annual_taxable,
        annual_tax_benefit=annual_tax_benefit,
        monthly_tax_benefit=monthly_tax_benefit,
        monthly_cash_flow_after_tax=cash_flow_after_tax,
    )


def compute_rent(inputs: MasterInputs) -> RentResult:
    """Compute the Rent scenario from master inputs."""
    monthly = _compute_monthly_flow(inputs)
    tax = _compute_tax_view(inputs, monthly.monthly_cash_flow_before_tax)

    future_value = future_home_value(
        inputs.current_home_value,
        inputs.annual_appreciation,
        inputs.hold_years,
    )
    future_balance = fv_balance(
        inputs.current_mortgage_balance,
        inputs.current_mortgage_rate,
        int(inputs.hold_years * 12),
        monthly.current_monthly_pi,
    )
    gross_equity = future_value - future_balance
    selling_costs_horizon = future_value * inputs.selling_cost_pct
    net_equity = gross_equity - selling_costs_horizon

    cumulative_cash_flow = tax.monthly_cash_flow_after_tax * 12 * inputs.hold_years

    # Excel Rent!B34 = B31 + B32 - B33 (net_equity + cumulative_cash_flow - make_ready)
    total_net = net_equity + cumulative_cash_flow - inputs.make_ready_cost

    return RentResult(
        monthly_flow=monthly,
        tax_view=tax,
        future_home_value=future_value,
        future_mortgage_balance=future_balance,
        gross_equity=gross_equity,
        selling_costs_at_horizon=selling_costs_horizon,
        net_equity_at_horizon=net_equity,
        cumulative_after_tax_rental_cash_flow=cumulative_cash_flow,
        make_ready_cost=inputs.make_ready_cost,
        total_net_position=total_net,
    )
