"""
scenarios/inputs.py

Master inputs for the Home Decision Model scenario engine.

Mirrors the 45-row `Inputs` sheet in the client's Excel model. All five
scenarios + the Decision Map are computed from a single MasterInputs
instance, which matches the spreadsheet's "edit column B, everything else
recomputes" workflow.

Defaults are the exact values from the shipped spreadsheet — handy for
tests and for giving the UI reasonable placeholders.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class MasterInputs:
    """All inputs needed to compute the five scenarios + Decision Map."""

    # --- Core property assumptions (Inputs rows 4–13) ---
    hold_years: float = 5.0
    current_home_value: float = 750_000.0
    current_mortgage_balance: float = 400_000.0
    current_mortgage_rate: float = 0.067           # decimal, not percent
    remaining_term_months: int = 300               # months
    monthly_property_tax: float = 750.0
    monthly_insurance: float = 150.0
    monthly_hoa: float = 150.0
    monthly_maintenance: float = 250.0

    # --- Market and tax assumptions (rows 15–18) ---
    annual_appreciation: float = 0.03              # decimal
    selling_cost_pct: float = 0.07                 # decimal
    marginal_tax_rate: float = 0.35                # decimal
    land_value_pct: float = 0.20                   # decimal (non-depreciable share)

    # --- Refinance assumptions (rows 20–23) ---
    refinance_rate: float = 0.0575                 # decimal
    refinance_term_months: int = 360               # months
    refinance_closing_cost_pct: float = 0.025      # decimal, applied to balance
    refinance_closing_costs_financed: bool = True  # 1 = yes (rolled into loan)

    # --- Sell + Buy assumptions (rows 25–31) ---
    target_new_home_value: float = 900_000.0
    new_down_payment_pct: float = 0.20             # decimal
    new_mortgage_rate: float = 0.06                # decimal
    new_mortgage_term_months: int = 360            # months
    purchase_closing_cost_pct: float = 0.02        # decimal, applied to price
    moving_cost: float = 15_000.0
    cash_reserve_held_back: float = 25_000.0

    # --- Rental assumptions (rows 33–38) ---
    gross_monthly_rent: float = 3_800.0
    vacancy_rate: float = 0.05                     # decimal
    management_fee_pct: float = 0.08               # decimal (applied to gross rent)
    maintenance_reserve_pct: float = 0.08          # decimal (applied to gross rent)
    other_rental_expense_monthly: float = 150.0
    make_ready_cost: float = 2_500.0

    # --- New home carry assumptions (rows 40–43) ---
    new_home_monthly_property_tax: float = 900.0
    new_home_monthly_insurance: float = 175.0
    new_home_monthly_hoa: float = 150.0
    new_home_monthly_maintenance: float = 300.0

    # --- Liquidity & feasibility (row 45) ---
    available_cash_for_purchase: float = 150_000.0

    # ------------------------------------------------------------------
    # Derived fields (computed once on access, matching Excel's B9)
    # ------------------------------------------------------------------

    def current_monthly_pi(self) -> float:
        """
        Current monthly principal + interest on the existing mortgage.

        Mirrors Excel Inputs!B9 = -PMT(B7/12, B8, B6).
        """
        from .core import pmt_monthly
        return pmt_monthly(
            self.current_mortgage_balance,
            self.current_mortgage_rate,
            self.remaining_term_months,
        )

    def validate(self) -> None:
        """
        Raise ValueError if any input is outside a reasonable domain.

        Caught by the API layer and returned as 400. Keeps the engine
        itself from silently producing nonsensical results.
        """
        if self.hold_years <= 0:
            raise ValueError("hold_years must be > 0")
        if self.current_home_value <= 0:
            raise ValueError("current_home_value must be > 0")
        if self.current_mortgage_balance < 0:
            raise ValueError("current_mortgage_balance must be >= 0")
        if not (0 <= self.current_mortgage_rate <= 1):
            raise ValueError("current_mortgage_rate must be between 0 and 1 (decimal, not percent)")
        if self.remaining_term_months < 0:
            raise ValueError("remaining_term_months must be >= 0")
        if not (0 <= self.selling_cost_pct <= 1):
            raise ValueError("selling_cost_pct must be between 0 and 1")
        if not (0 <= self.land_value_pct < 1):
            raise ValueError("land_value_pct must be between 0 and 1 (exclusive of 1)")
        if self.refinance_term_months <= 0:
            raise ValueError("refinance_term_months must be > 0")
        if self.new_mortgage_term_months <= 0:
            raise ValueError("new_mortgage_term_months must be > 0")
        if not (0 <= self.new_down_payment_pct <= 1):
            raise ValueError("new_down_payment_pct must be between 0 and 1")
        if not (0 <= self.vacancy_rate <= 1):
            raise ValueError("vacancy_rate must be between 0 and 1")
        if self.available_cash_for_purchase < 0:
            raise ValueError("available_cash_for_purchase must be >= 0")
