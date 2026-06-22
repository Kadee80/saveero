"""
portfolio/inputs.py

Input dataclasses for the Portfolio Strategy Engine.

Mirrors three sheets in `Portfolio Builder Engine.xlsx`:
  * Sheet 1 (Inputs)            -> PortfolioProfile
  * Sheet 2 (Current Portfolio) -> ExistingProperty list (up to 10 rows;
                                   workbook caps at 10 but the engine
                                   doesn't enforce — backend can grow)
  * Sheet 4 (Target Property)   -> TargetProperty

V1 property types (per Van's email 2026-05-15 scoping decision):
  Single-Family Rental / Long-Term Rental
  Short-Term Rental
  Residential Multifamily (2-4 Units)
  Commercial Multifamily (5+ Units)
  Vacation Home
  Fix & Flip
Deferred: Other Commercial Property (retail / office / industrial /
mixed-use). The engine's TargetPropertyType Literal explicitly excludes
that case for V1; add it back when commercial scope expands.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


# ---------------------------------------------------------------------------
# Enum types — match the dropdowns in the workbook's Inputs / Target sheets.
# ---------------------------------------------------------------------------

CreditBucket = Literal["740+", "700-739", "660-699", "<660"]
IncomeProfile = Literal["W-2", "Self-Employed", "Mixed", "Retired", "Other"]

#: Investor's stated objective. V1 maps each to a fixed weighting profile
#: (see goal_profiles.py). Email 2026-05-15 ruled out user-editable
#: weights for V1.
GoalObjective = Literal[
    "Build Wealth",
    "Generate Passive Income",
    "Preserve Liquidity",
    "Minimize Risk",
]

RiskTolerance = Literal["Conservative", "Moderate", "Aggressive"]

#: Free-form time horizon — workbook uses a string ("5 Years") so we
#: mirror that. Engine treats horizon as advisory metadata, not a numeric
#: input today; revisit when wealth projections come back in scope.
TimeHorizon = Literal["1-2 Years", "3-4 Years", "5 Years", "5-7 Years", "10+ Years"]

#: Target acquisition type. V1 scope (commercial-other intentionally
#: omitted; add when scope expands).
TargetPropertyType = Literal[
    "Long-Term Rental",
    "Short-Term Rental",
    "Residential Multifamily (2-4 Units)",
    "Commercial Multifamily (5+ Units)",
    "Vacation Home",
    "Fix & Flip",
]

#: How the existing property is being used. Drives accessible-equity
#: rules (HELOC vs cash-out vs DSCR) downstream.
PropertyUse = Literal[
    "Owner-Occupied",
    "Rented",
    "Vacant",
    "Second Home",
    "Other",
]


# ---------------------------------------------------------------------------
# Sheet 1 — Inputs (consumer profile + market assumptions)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class PortfolioProfile:
    """User's profile + goal + market assumptions (Inputs sheet)."""

    credit_score_bucket: CreditBucket = "700-739"
    income_profile: IncomeProfile = "Self-Employed"
    available_cash: float = 75_000.0  # B6
    investor_goal: GoalObjective = "Build Wealth"
    risk_tolerance: RiskTolerance = "Moderate"
    time_horizon: TimeHorizon = "5 Years"

    # System assumptions (B9-B11)
    expected_annual_appreciation: float = 0.03
    estimated_acquisition_closing_costs_pct: float = 0.03
    target_down_payment_pct: float = 0.25


# ---------------------------------------------------------------------------
# Sheet 2 — Current Portfolio (per-property inventory)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ExistingProperty:
    """One row of the Current Portfolio sheet."""

    property_type: str  # "Primary Residence" / "Investment Property" / "Vacation Home" / ...
    use_status: PropertyUse
    current_value: float
    mortgage_balance: float
    current_rate: float            # decimal (e.g. 0.0625)
    monthly_pi: float              # principal + interest only
    monthly_taxes_ins_hoa: float   # all carry costs except P&I + opex
    monthly_rent: float = 0.0
    monthly_operating_expenses: float = 0.0
    notes: str = ""

    def is_active(self) -> bool:
        """Empty rows on the workbook carry zeros across the board. Skip them."""
        return self.current_value > 0 or self.mortgage_balance > 0


# ---------------------------------------------------------------------------
# Sheet 4 — Target Property
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class TargetProperty:
    """Property the user is trying to acquire (Target Property sheet)."""

    target_property_type: TargetPropertyType = "Long-Term Rental"
    target_purchase_price: float = 500_000.0
    expected_monthly_rent_or_revenue: float = 3_800.0
    expected_monthly_taxes_ins_hoa: float = 750.0
    expected_operating_expenses: float = 500.0
    estimated_interest_rate: float = 0.075
    amortization_years: int = 30

    # Fix & Flip inputs — ignored for non-flip property types.
    rehab_budget: float = 0.0
    holding_costs: float = 0.0
    arv: float = 0.0
    sale_costs_pct: float = 0.06


# ---------------------------------------------------------------------------
# Combined input bundle — what the API endpoint accepts
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class PortfolioInputs:
    """All inputs the engine needs for one run."""

    profile: PortfolioProfile = field(default_factory=PortfolioProfile)
    existing_properties: tuple[ExistingProperty, ...] = field(default_factory=tuple)
    target_property: TargetProperty = field(default_factory=TargetProperty)

    def active_properties(self) -> tuple[ExistingProperty, ...]:
        return tuple(p for p in self.existing_properties if p.is_active())

    def validate(self) -> None:
        """Raise ValueError if any input is out of domain. Caught at the API."""
        if self.profile.available_cash < 0:
            raise ValueError("available_cash must be >= 0")
        if self.target_property.target_purchase_price <= 0:
            raise ValueError("target_purchase_price must be > 0")
        if not (0 <= self.target_property.estimated_interest_rate <= 1):
            raise ValueError("estimated_interest_rate must be a decimal (0-1)")
        if self.target_property.amortization_years <= 0:
            raise ValueError("amortization_years must be > 0")
        for p in self.existing_properties:
            if p.current_value < 0 or p.mortgage_balance < 0:
                raise ValueError("property values and balances must be >= 0")
            if p.current_value > 0 and p.mortgage_balance > p.current_value:
                # Underwater is possible IRL but the engine's accessible-
                # equity math returns 0; flag it as user-data smell.
                # Don't raise — let the engine handle it gracefully.
                pass
