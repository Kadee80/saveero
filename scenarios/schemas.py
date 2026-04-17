"""
scenarios/schemas.py

Pydantic request/response models for the scenario engine API.

Every dataclass in this module has a matching Pydantic model here, and
a `from_result(...)` classmethod that converts cleanly. This keeps the
pure-math layer free of HTTP concerns while giving the API layer a
crisp wire format.
"""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field

from .audit import AuditCheck, AuditReport
from .decision_map import (
    ComparisonRow,
    DecisionMap,
    FeasibilityFlags,
    PriorityRankings,
    RecommendationSnapshot,
    RentDriverBreakdown,
)
from .engine import EngineResult
from .inputs import MasterInputs
from .refinance import RefinanceResult
from .rent import RentMonthlyFlow, RentResult, RentTaxView
from .rent_out_buy import RentOutBuyResult
from .sell_buy import SellBuyResult
from .stay import StayResult


# ---------------------------------------------------------------------------
# Request — master inputs
# ---------------------------------------------------------------------------

class MasterInputsRequest(BaseModel):
    """All 45 inputs the Excel sheet exposes. Every field has a default."""
    hold_years: float = Field(5.0, gt=0, description="Analysis hold period in years")
    current_home_value: float = Field(750_000.0, gt=0)
    current_mortgage_balance: float = Field(400_000.0, ge=0)
    current_mortgage_rate: float = Field(0.067, ge=0, le=1, description="Decimal, e.g. 0.067 for 6.7%")
    remaining_term_months: int = Field(300, ge=0)
    monthly_property_tax: float = Field(750.0, ge=0)
    monthly_insurance: float = Field(150.0, ge=0)
    monthly_hoa: float = Field(150.0, ge=0)
    monthly_maintenance: float = Field(250.0, ge=0)

    annual_appreciation: float = Field(0.03, ge=-0.5, le=1)
    selling_cost_pct: float = Field(0.07, ge=0, le=1)
    marginal_tax_rate: float = Field(0.35, ge=0, le=1)
    land_value_pct: float = Field(0.20, ge=0, lt=1)

    refinance_rate: float = Field(0.0575, ge=0, le=1)
    refinance_term_months: int = Field(360, gt=0)
    refinance_closing_cost_pct: float = Field(0.025, ge=0, le=1)
    refinance_closing_costs_financed: bool = Field(True)

    target_new_home_value: float = Field(900_000.0, gt=0)
    new_down_payment_pct: float = Field(0.20, ge=0, le=1)
    new_mortgage_rate: float = Field(0.06, ge=0, le=1)
    new_mortgage_term_months: int = Field(360, gt=0)
    purchase_closing_cost_pct: float = Field(0.02, ge=0, le=1)
    moving_cost: float = Field(15_000.0, ge=0)
    cash_reserve_held_back: float = Field(25_000.0, ge=0)

    gross_monthly_rent: float = Field(3_800.0, ge=0)
    vacancy_rate: float = Field(0.05, ge=0, le=1)
    management_fee_pct: float = Field(0.08, ge=0, le=1)
    maintenance_reserve_pct: float = Field(0.08, ge=0, le=1)
    other_rental_expense_monthly: float = Field(150.0, ge=0)
    make_ready_cost: float = Field(2_500.0, ge=0)

    new_home_monthly_property_tax: float = Field(900.0, ge=0)
    new_home_monthly_insurance: float = Field(175.0, ge=0)
    new_home_monthly_hoa: float = Field(150.0, ge=0)
    new_home_monthly_maintenance: float = Field(300.0, ge=0)

    available_cash_for_purchase: float = Field(150_000.0, ge=0)

    def to_inputs(self) -> MasterInputs:
        """Convert to the pure domain dataclass."""
        return MasterInputs(**self.model_dump())


# ---------------------------------------------------------------------------
# Response — individual scenarios
# ---------------------------------------------------------------------------

class StayOut(BaseModel):
    current_monthly_pi: float
    monthly_property_tax: float
    monthly_insurance: float
    monthly_hoa: float
    monthly_maintenance: float
    total_monthly_ownership_cost: float
    future_home_value: float
    future_mortgage_balance: float
    gross_equity: float
    selling_costs_at_horizon: float
    net_equity_at_horizon: float
    total_net_position: float

    @classmethod
    def from_result(cls, r: StayResult) -> "StayOut":
        return cls(**r.__dict__)


class RefinanceOut(BaseModel):
    current_monthly_pi: float
    refinance_closing_costs: float
    refinance_closing_costs_financed: float
    new_loan_amount: float
    new_monthly_pi: float
    monthly_payment_change: float
    cash_to_close: float
    break_even_months: Optional[float]
    future_home_value: float
    future_refinance_loan_balance: float
    gross_equity: float
    selling_costs_at_horizon: float
    net_equity_at_horizon: float
    cumulative_payment_savings: float
    total_net_position: float
    monthly_property_tax: float
    monthly_insurance: float
    monthly_hoa: float
    monthly_maintenance: float
    total_monthly_ownership_cost: float

    @classmethod
    def from_result(cls, r: RefinanceResult) -> "RefinanceOut":
        return cls(**r.__dict__)


class SellBuyOut(BaseModel):
    current_home_sale_price: float
    current_home_selling_costs: float
    current_mortgage_payoff: float
    net_sale_proceeds_before_reserve: float
    cash_reserve_held_back: float
    cash_available_for_next_purchase: float
    target_new_home_value: float
    required_down_payment: float
    new_purchase_loan_amount: float
    purchase_closing_costs: float
    moving_cost: float
    cash_remaining_at_close: float
    new_monthly_pi: float
    future_new_home_value: float
    future_new_mortgage_balance: float
    gross_equity: float
    selling_costs_at_horizon: float
    net_equity_at_horizon: float
    total_net_position: float
    new_home_monthly_property_tax: float
    new_home_monthly_insurance: float
    new_home_monthly_hoa: float
    new_home_monthly_maintenance: float
    total_monthly_ownership_cost: float
    monthly_ownership_cost_change_vs_stay: float

    @classmethod
    def from_result(cls, r: SellBuyResult) -> "SellBuyOut":
        return cls(**r.__dict__)


class RentMonthlyFlowOut(BaseModel):
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


class RentTaxViewOut(BaseModel):
    mortgage_balance_after_12_months: float
    first_year_mortgage_interest_deduction: float
    annual_depreciation: float
    annual_taxable_rental_income: float
    annual_tax_benefit: float
    monthly_tax_benefit: float
    monthly_cash_flow_after_tax: float


class RentOut(BaseModel):
    monthly_flow: RentMonthlyFlowOut
    tax_view: RentTaxViewOut
    future_home_value: float
    future_mortgage_balance: float
    gross_equity: float
    selling_costs_at_horizon: float
    net_equity_at_horizon: float
    cumulative_after_tax_rental_cash_flow: float
    make_ready_cost: float
    total_net_position: float

    @classmethod
    def from_result(cls, r: RentResult) -> "RentOut":
        return cls(
            monthly_flow=RentMonthlyFlowOut(**r.monthly_flow.__dict__),
            tax_view=RentTaxViewOut(**r.tax_view.__dict__),
            future_home_value=r.future_home_value,
            future_mortgage_balance=r.future_mortgage_balance,
            gross_equity=r.gross_equity,
            selling_costs_at_horizon=r.selling_costs_at_horizon,
            net_equity_at_horizon=r.net_equity_at_horizon,
            cumulative_after_tax_rental_cash_flow=r.cumulative_after_tax_rental_cash_flow,
            make_ready_cost=r.make_ready_cost,
            total_net_position=r.total_net_position,
        )


class RentOutBuyOut(BaseModel):
    monthly_flow: RentMonthlyFlowOut
    tax_view: RentTaxViewOut
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
    net_monthly_housing_cost_before_tax: float
    net_monthly_housing_cost_after_tax: float
    monthly_housing_cost_change_vs_stay: float
    after_tax_monthly_impact_vs_stay: float
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
    available_cash_for_purchase: float
    cash_surplus_or_shortfall: float
    liquidity_status: Literal["Feasible", "Stretch", "Not viable"]
    execution_note: str

    @classmethod
    def from_result(cls, r: RentOutBuyResult) -> "RentOutBuyOut":
        d = {k: v for k, v in r.__dict__.items() if k not in {"monthly_flow", "tax_view"}}
        return cls(
            monthly_flow=RentMonthlyFlowOut(**r.monthly_flow.__dict__),
            tax_view=RentTaxViewOut(**r.tax_view.__dict__),
            **d,
        )


# ---------------------------------------------------------------------------
# Response — Decision Map
# ---------------------------------------------------------------------------

class ComparisonRowOut(BaseModel):
    stay: float
    refinance: float
    sell_buy: float
    rent: float
    rent_out_buy: float


class RentDriverBreakdownOut(BaseModel):
    current_net_equity_today: float
    net_appreciation_after_selling_costs: float
    principal_paydown_over_hold_period: float
    cumulative_after_tax_rental_cash_flow: float
    initial_make_ready_cost: float
    total_net_position: float


class RecommendationSnapshotOut(BaseModel):
    best_financial_outcome: str
    best_total_net_position: float
    best_for_monthly_affordability: str
    simplest_path: str
    plain_english_insight: str


class PriorityRankingsOut(BaseModel):
    max_wealth: str
    monthly_affordability: str
    simplicity: str
    move_lifestyle_change: str


class FeasibilityFlagsOut(BaseModel):
    top_ranked_scenario: str
    requires_monthly_subsidy: str
    complexity: Literal["Low", "Medium", "High"]
    monthly_figure_to_watch: float
    rent_out_buy_liquidity_status: str
    rent_out_buy_upfront_cash_required: float
    available_cash_for_new_purchase: float
    cash_surplus_or_shortfall: float


class DecisionMapOut(BaseModel):
    selected_hold_period_years: float
    monthly_all_in_impact_vs_today: ComparisonRowOut
    after_tax_monthly_impact_vs_today: ComparisonRowOut
    net_equity_if_sold_at_horizon: ComparisonRowOut
    total_net_position: ComparisonRowOut
    rent_driver_breakdown: RentDriverBreakdownOut
    recommendation: RecommendationSnapshotOut
    priority_rankings: PriorityRankingsOut
    feasibility_flags: FeasibilityFlagsOut

    @classmethod
    def from_result(cls, r: DecisionMap) -> "DecisionMapOut":
        return cls(
            selected_hold_period_years=r.selected_hold_period_years,
            monthly_all_in_impact_vs_today=ComparisonRowOut(**r.monthly_all_in_impact_vs_today.__dict__),
            after_tax_monthly_impact_vs_today=ComparisonRowOut(**r.after_tax_monthly_impact_vs_today.__dict__),
            net_equity_if_sold_at_horizon=ComparisonRowOut(**r.net_equity_if_sold_at_horizon.__dict__),
            total_net_position=ComparisonRowOut(**r.total_net_position.__dict__),
            rent_driver_breakdown=RentDriverBreakdownOut(**r.rent_driver_breakdown.__dict__),
            recommendation=RecommendationSnapshotOut(**r.recommendation.__dict__),
            priority_rankings=PriorityRankingsOut(**r.priority_rankings.__dict__),
            feasibility_flags=FeasibilityFlagsOut(**r.feasibility_flags.__dict__),
        )


# ---------------------------------------------------------------------------
# Response — Audit
# ---------------------------------------------------------------------------

class AuditCheckOut(BaseModel):
    name: str
    status: Literal["PASS", "CHECK"]
    notes: str


class AuditReportOut(BaseModel):
    checks: List[AuditCheckOut]
    all_passed: bool

    @classmethod
    def from_result(cls, r: AuditReport) -> "AuditReportOut":
        return cls(
            checks=[AuditCheckOut(**c.__dict__) for c in r.checks],
            all_passed=r.all_passed,
        )


# ---------------------------------------------------------------------------
# Response — full engine
# ---------------------------------------------------------------------------

class RunAllResponse(BaseModel):
    """Mirror of the full Excel workbook: 5 scenarios + Decision Map + Audit."""
    stay: StayOut
    refinance: RefinanceOut
    sell_buy: SellBuyOut
    rent: RentOut
    rent_out_buy: RentOutBuyOut
    decision_map: DecisionMapOut
    audit: AuditReportOut

    @classmethod
    def from_result(cls, r: EngineResult) -> "RunAllResponse":
        return cls(
            stay=StayOut.from_result(r.stay),
            refinance=RefinanceOut.from_result(r.refinance),
            sell_buy=SellBuyOut.from_result(r.sell_buy),
            rent=RentOut.from_result(r.rent),
            rent_out_buy=RentOutBuyOut.from_result(r.rent_out_buy),
            decision_map=DecisionMapOut.from_result(r.decision_map),
            audit=AuditReportOut.from_result(r.audit),
        )
