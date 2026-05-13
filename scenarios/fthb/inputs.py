"""
scenarios/fthb/inputs.py

Inputs for the First-Time Homebuyer Decision Engine.

Mirrors the `Inputs` sheet (rows 4-32) of the client's
`FTHB_decision map.xlsx` exactly. Defaults are the Column-B values from
the shipped spreadsheet — this is what the golden tests pin against.

Three sections in the source sheet, kept as a comment grouping below for
clarity:
  - Financial Profile (income, debts, cash, down payment, credit)
  - Home Goals (rent, prices, horizon)
  - System Assumptions (rates, fees, growth assumptions, DPA, delay,
    DTI cap, cushion thresholds)
"""
from __future__ import annotations

from dataclasses import dataclass


# Excel hardcodes a 0.50% rate premium on DPA loans (Buy with Assistance!B13
# uses `Inputs!$B$17 + 0.005`). Surface as a named constant so the magic
# number doesn't disappear into the engine.
DPA_RATE_PREMIUM: float = 0.005


@dataclass(frozen=True)
class FTHBInputs:
    """All inputs needed to compute the five FTHB scenarios + decision map."""

    # --- Financial Profile (Inputs B4-B8) ---
    annual_household_income: float = 185_000.0          # B4
    monthly_debt_obligations: float = 850.0             # B5
    available_cash_for_purchase: float = 90_000.0       # B6
    universal_down_payment: float = 65_000.0            # B7  (single value used by every buy scenario)
    estimated_credit_score: int = 735                   # B8  (display only in v1; not consumed by any formula)

    # --- Home Goals (Inputs B11-B14) ---
    current_monthly_rent: float = 3_500.0               # B11
    starter_home_price: float = 550_000.0               # B12
    preferred_home_price: float = 700_000.0             # B13
    horizon_years: float = 7.0                          # B14  (comparison horizon used across scenarios)

    # --- System Assumptions / Admin Defaults (Inputs B17-B32) ---
    mortgage_rate: float = 0.0575                       # B17  (decimal)
    mortgage_term_months: int = 360                     # B18
    purchase_closing_cost_pct: float = 0.03             # B19
    property_tax_annual_pct: float = 0.01               # B20
    insurance_annual_pct: float = 0.0025                # B21
    monthly_hoa: float = 75.0                           # B22
    maintenance_annual_pct: float = 0.01                # B23
    annual_home_appreciation: float = 0.03              # B24
    annual_rent_inflation: float = 0.035                # B25
    return_on_unspent_cash: float = 0.03                # B26
    max_dti: float = 0.45                               # B27
    post_close_cushion_pct: float = 0.10                # B28
    min_post_close_cushion: float = 5_000.0             # B29
    available_dpa: float = 15_000.0                     # B30  (assumed repayable amount)
    delay_monthly_savings: float = 1_500.0              # B31  (assumed monthly saving rate during the 12mo delay)
    take_home_pct: float = 0.70                         # B32  (gross-to-take-home haircut)

    # ------------------------------------------------------------------
    # Derived field — Excel B34: =B4/12*B32
    # Used by every scenario to compute residual monthly savings capacity.
    # ------------------------------------------------------------------

    def monthly_take_home_income(self) -> float:
        """
        Estimated monthly take-home income.

        Mirrors Excel Inputs!B34 = annual_income / 12 × take_home_pct.
        """
        return self.annual_household_income / 12.0 * self.take_home_pct

    def validate(self) -> None:
        """
        Raise ValueError if any input is outside a reasonable domain.

        Caught at the API layer and surfaced as a 400. The engine itself
        assumes inputs are valid.
        """
        if self.annual_household_income < 0:
            raise ValueError("annual_household_income must be >= 0")
        if self.monthly_debt_obligations < 0:
            raise ValueError("monthly_debt_obligations must be >= 0")
        if self.available_cash_for_purchase < 0:
            raise ValueError("available_cash_for_purchase must be >= 0")
        if self.universal_down_payment < 0:
            raise ValueError("universal_down_payment must be >= 0")
        if self.current_monthly_rent < 0:
            raise ValueError("current_monthly_rent must be >= 0")
        if self.starter_home_price <= 0:
            raise ValueError("starter_home_price must be > 0")
        if self.preferred_home_price <= 0:
            raise ValueError("preferred_home_price must be > 0")
        if self.horizon_years <= 0:
            raise ValueError("horizon_years must be > 0")
        if not (0 <= self.mortgage_rate <= 1):
            raise ValueError("mortgage_rate must be a decimal between 0 and 1 (e.g. 0.0575)")
        if self.mortgage_term_months <= 0:
            raise ValueError("mortgage_term_months must be > 0")
        for pct_field in (
            "purchase_closing_cost_pct",
            "property_tax_annual_pct",
            "insurance_annual_pct",
            "maintenance_annual_pct",
            "post_close_cushion_pct",
            "max_dti",
            "take_home_pct",
        ):
            v = getattr(self, pct_field)
            if not (0 <= v <= 1):
                raise ValueError(f"{pct_field} must be a decimal between 0 and 1")
        if self.monthly_hoa < 0:
            raise ValueError("monthly_hoa must be >= 0")
        if self.available_dpa < 0:
            raise ValueError("available_dpa must be >= 0")
        if self.delay_monthly_savings < 0:
            raise ValueError("delay_monthly_savings must be >= 0")
