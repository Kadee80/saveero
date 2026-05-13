"""
scenarios/fthb/schemas.py

Pydantic request/response models for the FTHB engine API. Same shape
philosophy as scenarios/schemas.py — every dataclass has a Pydantic
mirror with a `from_result()` classmethod, and the FTHBInputs
dataclass has a matching request model.

The wire format is intentionally consumable by an AI interpretation
layer down the road (per Van's "financially optimal vs optimal-for-
this-household" framing) — the comparison rows + recommendation
snapshot give an LLM enough structure to weight the financial answer
against soft factors (family size, school, commute, etc.) without
re-running the engine.
"""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from ._buy_common import BuyScenarioResult
from .audit import AuditCheck, AuditReport
from .decision_map import (
    DecisionMap,
    RecommendationSnapshot,
    ScenarioComparisonRow,
)
from .delay import DelayResult
from .engine import EngineResult
from .inputs import FTHBInputs
from .rent import ContinueRentingResult


# ---------------------------------------------------------------------------
# Request — FTHB inputs
# ---------------------------------------------------------------------------

class FTHBInputsRequest(BaseModel):
    """All FTHB inputs the Excel sheet exposes. Every field has a default
    matching column B of the spreadsheet."""

    # Financial Profile
    annual_household_income: float = Field(185_000.0, ge=0)
    monthly_debt_obligations: float = Field(850.0, ge=0)
    available_cash_for_purchase: float = Field(90_000.0, ge=0)
    universal_down_payment: float = Field(65_000.0, ge=0)
    estimated_credit_score: int = Field(735, ge=300, le=850)

    # Home Goals
    current_monthly_rent: float = Field(3_500.0, ge=0)
    starter_home_price: float = Field(550_000.0, gt=0)
    preferred_home_price: float = Field(700_000.0, gt=0)
    horizon_years: float = Field(7.0, gt=0)

    # System Assumptions
    mortgage_rate: float = Field(0.0575, ge=0, le=1)
    mortgage_term_months: int = Field(360, gt=0)
    purchase_closing_cost_pct: float = Field(0.03, ge=0, le=1)
    property_tax_annual_pct: float = Field(0.01, ge=0, le=1)
    insurance_annual_pct: float = Field(0.0025, ge=0, le=1)
    monthly_hoa: float = Field(75.0, ge=0)
    maintenance_annual_pct: float = Field(0.01, ge=0, le=1)
    annual_home_appreciation: float = Field(0.03, ge=-0.5, le=1)
    annual_rent_inflation: float = Field(0.035, ge=-0.5, le=1)
    return_on_unspent_cash: float = Field(0.03, ge=-0.5, le=1)
    max_dti: float = Field(0.45, ge=0, le=1)
    post_close_cushion_pct: float = Field(0.10, ge=0, le=1)
    min_post_close_cushion: float = Field(5_000.0, ge=0)
    available_dpa: float = Field(15_000.0, ge=0)
    delay_monthly_savings: float = Field(1_500.0, ge=0)
    take_home_pct: float = Field(0.70, ge=0, le=1)

    def to_inputs(self) -> FTHBInputs:
        return FTHBInputs(**self.model_dump())


# ---------------------------------------------------------------------------
# Per-scenario response models
# ---------------------------------------------------------------------------

class ContinueRentingOut(BaseModel):
    current_monthly_rent: float
    annual_rent_inflation: float
    horizon_years: float
    cumulative_rent_paid: float
    future_value_of_available_cash: float
    total_net_position: float
    monthly_housing_cost_today: float
    cash_required_now: float
    cash_remaining_now: float
    feasibility_status: str
    risk_level: str
    residual_monthly_savings: float
    projected_savings_accumulation: float

    @classmethod
    def from_result(cls, r: ContinueRentingResult) -> "ContinueRentingOut":
        return cls(**r.__dict__)


class BuyScenarioOut(BaseModel):
    """Shared response shape used by Starter, Preferred, and Assistance."""
    target_purchase_price: float
    universal_down_payment: float
    purchase_closing_costs: float
    assistance_benefit: float
    total_cash_required_at_close: float
    cash_remaining_after_close: float
    new_loan_amount: float
    monthly_principal_and_interest: float
    monthly_property_tax: float
    monthly_insurance: float
    monthly_hoa: float
    monthly_maintenance: float
    total_monthly_housing_payment: float
    dti: float
    future_home_value: float
    future_loan_balance: float
    net_equity_at_horizon: float
    future_value_of_remaining_cash: float
    total_net_position: float
    liquidity_cushion_threshold: float
    feasibility_status: str
    risk_level: str
    residual_monthly_savings: float
    projected_savings_accumulation: float

    @classmethod
    def from_result(cls, r: BuyScenarioResult) -> "BuyScenarioOut":
        return cls(**r.__dict__)


class DelayOut(BaseModel):
    recommended_delay_months: int
    projected_additional_savings: float
    projected_available_cash_after_delay: float
    starter_cash_required_today: float
    projected_cash_surplus_or_shortfall: float
    expected_future_feasibility: str
    risk_level: str
    total_net_position: float
    residual_monthly_savings_while_renting: float
    projected_remaining_period_savings: float

    @classmethod
    def from_result(cls, r: DelayResult) -> "DelayOut":
        return cls(**r.__dict__)


# ---------------------------------------------------------------------------
# Decision Map
# ---------------------------------------------------------------------------

class ScenarioComparisonRowOut(BaseModel):
    scenario: str
    net_position: float
    monthly_cost: Optional[float]
    residual_monthly_savings: float
    savings_accumulation: float
    cash_required: float
    cash_remaining: float
    dti: Optional[float]
    equity_at_horizon: float
    feasibility: str
    risk: str

    @classmethod
    def from_result(cls, r: ScenarioComparisonRow) -> "ScenarioComparisonRowOut":
        return cls(**r.__dict__)


class RecommendationSnapshotOut(BaseModel):
    best_executable_path: str
    best_net_position: float
    best_monthly_affordability: str
    best_savings_capacity: str
    lowest_cash_required: str
    actionable_insight: str

    @classmethod
    def from_result(cls, r: RecommendationSnapshot) -> "RecommendationSnapshotOut":
        return cls(**r.__dict__)


class DecisionMapOut(BaseModel):
    comparison: List[ScenarioComparisonRowOut]
    recommendation: RecommendationSnapshotOut

    @classmethod
    def from_result(cls, r: DecisionMap) -> "DecisionMapOut":
        return cls(
            comparison=[ScenarioComparisonRowOut.from_result(row) for row in r.comparison],
            recommendation=RecommendationSnapshotOut.from_result(r.recommendation),
        )


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

class AuditCheckOut(BaseModel):
    name: str
    status: Literal["PASS", "CHECK"]
    notes: str

    @classmethod
    def from_result(cls, c: AuditCheck) -> "AuditCheckOut":
        return cls(**c.__dict__)


class AuditReportOut(BaseModel):
    checks: List[AuditCheckOut]
    all_passed: bool

    @classmethod
    def from_result(cls, r: AuditReport) -> "AuditReportOut":
        return cls(
            checks=[AuditCheckOut.from_result(c) for c in r.checks],
            all_passed=r.all_passed,
        )


# ---------------------------------------------------------------------------
# Full engine response
# ---------------------------------------------------------------------------

class RunAllResponse(BaseModel):
    """Mirror of the full FTHB workbook: 5 scenarios + Decision Map + Audit."""
    continue_renting: ContinueRentingOut
    buy_starter: BuyScenarioOut
    buy_preferred: BuyScenarioOut
    buy_with_assistance: BuyScenarioOut
    delay_purchase: DelayOut
    decision_map: DecisionMapOut
    audit: AuditReportOut

    @classmethod
    def from_result(cls, r: EngineResult) -> "RunAllResponse":
        return cls(
            continue_renting=ContinueRentingOut.from_result(r.continue_renting),
            buy_starter=BuyScenarioOut.from_result(r.buy_starter),
            buy_preferred=BuyScenarioOut.from_result(r.buy_preferred),
            buy_with_assistance=BuyScenarioOut.from_result(r.buy_with_assistance),
            delay_purchase=DelayOut.from_result(r.delay_purchase),
            decision_map=DecisionMapOut.from_result(r.decision_map),
            audit=AuditReportOut.from_result(r.audit),
        )
