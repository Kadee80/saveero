"""
scenarios/fthb/delay.py

Delay Purchase scenario — wait one year, save extra during the wait,
then evaluate whether the starter purchase becomes feasible (or
already-feasible buyers can hit it with a thicker cushion).

Mirrors the 'Delay Purchase' sheet of FTHB_decision map.xlsx.

Two Excel hardcodes worth flagging:

  1. The delay period is fixed at 12 months (sheet B4 = 12, no formula).
     The "Total net position" formula on B11 then uses
     `(Inputs!$B$14 - 1)` for the post-delay horizon — i.e. it assumes
     1 year of delay regardless of whether B4 changes. Mirroring this
     verbatim keeps the golden tests green; if Van later wants the
     delay to be a tunable input, both spots need to change together.

  2. The starter-cash-required formula on B7 hardcodes the starter
     price (Inputs!B12) — even though Delay is conceptually "the
     scenario you fall back to before any specific purchase", Excel
     measures feasibility against starter only. Preserve.

Total net position = FV(post-delay cash, return_on_cash, horizon - 1)
                   + savings accumulated over the remaining horizon.
"""
from __future__ import annotations

from dataclasses import dataclass

from .core import fv_annuity_monthly, fv_compound_annual
from .inputs import FTHBInputs

# Hardcoded in Excel (Delay Purchase sheet B4 is a literal value, not a
# formula). Surfacing as a constant so the magic number doesn't disappear.
DELAY_PERIOD_MONTHS: int = 12


@dataclass(frozen=True)
class DelayResult:
    # Delay path (B4-B11)
    recommended_delay_months: int
    projected_additional_savings: float
    projected_available_cash_after_delay: float
    starter_cash_required_today: float
    projected_cash_surplus_or_shortfall: float
    expected_future_feasibility: str    # "Feasible" | "Not Feasible"
    risk_level: str                      # "Low" | "Cash Flow Tight" | "High"
    total_net_position: float

    # Savings impact while waiting (B14-B15)
    residual_monthly_savings_while_renting: float
    projected_remaining_period_savings: float


def compute_delay_purchase(inputs: FTHBInputs) -> DelayResult:
    """Compute the Delay Purchase scenario."""
    delay_months = DELAY_PERIOD_MONTHS

    # B5: extra savings = delay_monthly_savings × delay months
    additional_savings = inputs.delay_monthly_savings * delay_months
    # B6: cash after delay
    cash_after_delay = inputs.available_cash_for_purchase + additional_savings
    # B7: cash required today for starter (down + closing on starter price)
    starter_cash_required = (
        inputs.universal_down_payment
        + inputs.starter_home_price * inputs.purchase_closing_cost_pct
    )
    # B8: surplus / shortfall
    surplus = cash_after_delay - starter_cash_required

    # B14: residual monthly savings during the rent period
    residual_savings = (
        inputs.monthly_take_home_income()
        - inputs.monthly_debt_obligations
        - inputs.current_monthly_rent
    )

    # B9: feasibility — needs both surplus >= 0 AND non-negative monthly savings
    if surplus >= 0 and residual_savings >= 0:
        feasibility = "Feasible"
    else:
        feasibility = "Not Feasible"

    # B10: risk
    if feasibility == "Not Feasible":
        risk = "High"
    elif residual_savings < 500:
        risk = "Cash Flow Tight"
    else:
        risk = "Low"

    # B15: savings accumulation over remaining horizon (= horizon_years - 1)
    # Excel hardcodes the "1" — see module docstring.
    remaining_years = inputs.horizon_years - 1
    remaining_months = int(round(remaining_years * 12))
    remaining_period_savings = fv_annuity_monthly(
        residual_savings, inputs.return_on_unspent_cash, remaining_months
    )

    # B11: total net position = FV(post-delay cash, ..., horizon - 1) + remaining savings
    fv_cash = fv_compound_annual(
        cash_after_delay, inputs.return_on_unspent_cash, remaining_years
    )
    total_net = fv_cash + remaining_period_savings

    return DelayResult(
        recommended_delay_months=delay_months,
        projected_additional_savings=additional_savings,
        projected_available_cash_after_delay=cash_after_delay,
        starter_cash_required_today=starter_cash_required,
        projected_cash_surplus_or_shortfall=surplus,
        expected_future_feasibility=feasibility,
        risk_level=risk,
        total_net_position=total_net,
        residual_monthly_savings_while_renting=residual_savings,
        projected_remaining_period_savings=remaining_period_savings,
    )
