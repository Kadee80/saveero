"""
scenarios/fthb/core.py

FTHB-specific math primitives. Reuses `pmt_monthly`, `fv_balance`, and
`future_home_value` from `scenarios/core.py` (they apply identically),
and adds the future-value-of-monthly-deposits helper that the FTHB
savings-accumulation rows need but the homeowner engine doesn't.

All helpers match the FTHB Excel exactly:
  * rates as decimals (0.0575, not 5.75)
  * loan terms in months (360)
  * horizons in years (7)
  * appreciation/return on cash compound annually
  * loan amortization compounds monthly
  * savings accumulation compounds monthly
"""
from __future__ import annotations


def fv_annuity_monthly(
    monthly_deposit: float,
    annual_rate: float,
    periods_months: int,
) -> float:
    """
    Future value of a stream of monthly deposits at an annual rate
    compounded monthly.

    Mirrors Excel's -FV(rate/12, n_months, deposit, 0) used on the
    Continue Renting / Buy / Delay sheets to project savings
    accumulation over the comparison horizon.

    Standard ordinary-annuity FV:
        FV = deposit × ((1 + r/12)^n - 1) / (r/12)
    With r == 0 the formula collapses to deposit × n.

    Negative or zero deposits floor at 0 — savings accumulation can't
    contribute negatively in the model (matches the `MAX(B17, 0)` clamp
    Excel applies before passing to FV).
    """
    deposit = max(monthly_deposit, 0.0)
    if periods_months <= 0 or deposit == 0:
        return 0.0
    if annual_rate == 0:
        return deposit * periods_months
    r = annual_rate / 12.0
    return deposit * ((1 + r) ** periods_months - 1) / r


def fv_compound_annual(
    present_value: float,
    annual_rate: float,
    years: float,
) -> float:
    """
    Future value of a lump sum compounded annually.

    Mirrors Excel's `B6 * (1 + r)^years` used for FV-of-cash and
    FV-of-home-value rows. (Note: scenarios/core.py's
    `future_home_value` is the same formula — kept here as well so FTHB
    code reads with the right semantic name for cash growth.)

    Negative present_value clamps to 0 (matches `MAX(B9, 0)` clamp on
    cash-remaining-after-close).
    """
    pv = max(present_value, 0.0)
    if pv == 0 or years <= 0:
        return pv
    return pv * (1 + annual_rate) ** years


def cumulative_inflated_rent(
    monthly_rent_today: float,
    annual_rent_inflation: float,
    horizon_years: float,
) -> float:
    """
    Total rent paid over the horizon, given annual rent inflation.

    Mirrors Excel's:
        =IF(g=0, monthly*12*N, monthly*12*((1+g)^N - 1)/g)

    Geometric growth on year-over-year rent — i.e. each year's rent is
    (1+g) × prior year's. Sum is annual_rent × ((1+g)^N - 1)/g.

    Used only on the Continue Renting sheet (B7) to compute the
    cumulative-rent-paid display. Not part of the savings-impact chain.
    """
    if monthly_rent_today <= 0 or horizon_years <= 0:
        return 0.0
    annual_rent = monthly_rent_today * 12
    if annual_rent_inflation == 0:
        return annual_rent * horizon_years
    g = annual_rent_inflation
    return annual_rent * ((1 + g) ** horizon_years - 1) / g
