"""
portfolio/schemas.py

Pydantic request + response models for the Portfolio Strategy Engine
API. Keeps the FastAPI layer thin (just translate dataclass <-> Pydantic).

V1 ships only the single `POST /api/portfolio/run` endpoint; persist /
save endpoints will follow the FTHB / mortgage pattern.
"""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Request
# ---------------------------------------------------------------------------

class ExistingPropertyIn(BaseModel):
    property_type: str
    use_status: str
    current_value: float
    mortgage_balance: float
    current_rate: float = 0.0
    monthly_pi: float = 0.0
    monthly_taxes_ins_hoa: float = 0.0
    monthly_rent: float = 0.0
    monthly_operating_expenses: float = 0.0
    notes: str = ""


class PortfolioProfileIn(BaseModel):
    credit_score_bucket: str = "700-739"
    income_profile: str = "Self-Employed"
    available_cash: float = 75_000.0
    investor_goal: str = "Build Wealth"
    risk_tolerance: str = "Moderate"
    time_horizon: str = "5 Years"
    expected_annual_appreciation: float = 0.03
    estimated_acquisition_closing_costs_pct: float = 0.03
    target_down_payment_pct: float = 0.25


class TargetPropertyIn(BaseModel):
    target_property_type: str = "Long-Term Rental"
    target_purchase_price: float = 500_000.0
    expected_monthly_rent_or_revenue: float = 3_800.0
    expected_monthly_taxes_ins_hoa: float = 750.0
    expected_operating_expenses: float = 500.0
    estimated_interest_rate: float = 0.075
    amortization_years: int = 30
    rehab_budget: float = 0.0
    holding_costs: float = 0.0
    arv: float = 0.0
    sale_costs_pct: float = 0.06


class RunPortfolioRequest(BaseModel):
    profile: PortfolioProfileIn = Field(default_factory=PortfolioProfileIn)
    existing_properties: List[ExistingPropertyIn] = Field(default_factory=list)
    target_property: TargetPropertyIn = Field(default_factory=TargetPropertyIn)


# ---------------------------------------------------------------------------
# Response
# ---------------------------------------------------------------------------

class PropertyAnalyticsOut(BaseModel):
    property_type: str
    value: float
    mortgage_balance: float
    equity: float
    ltv: float
    monthly_pi: float
    pitia: float
    rent: float
    operating_expenses: float
    monthly_cash_flow: float
    dscr: float
    heloc_accessible_equity: float
    cash_out_accessible_equity: float
    dscr_no_ratio_accessible_equity: float


class PortfolioSummaryOut(BaseModel):
    total_property_value: float
    total_mortgage_balance: float
    total_equity: float
    total_monthly_rent: float
    total_monthly_pitia: float
    total_monthly_cash_flow: float
    total_heloc_accessible_equity: float
    total_cash_out_accessible_equity: float
    total_dscr_no_ratio_accessible_equity: float


class PortfolioAnalyticsOut(BaseModel):
    properties: List[PropertyAnalyticsOut]
    summary: PortfolioSummaryOut


class TargetMetricsOut(BaseModel):
    down_payment_pct: float
    down_payment_needed: float
    closing_costs_needed: float
    total_capital_needed: float
    loan_amount: float
    monthly_pi: float
    pitia: float
    dscr: float
    monthly_cash_flow: float
    projected_flip_profit: float
    projected_flip_gross_roi: float
    property_type_fit_score: float
    dscr_relevant: bool
    bridge_hard_money_relevant: bool
    preferred_financing_theme: str
    property_type_logic_note: str


class ScoredStrategyOut(BaseModel):
    """
    Mirrors strategy_scoring.ScoredStrategy. Factor names are
    canonical (Van's matrix); changing them requires touching
    portfolioApi.ts + PortfolioBuilder.tsx in lockstep.
    """
    key: str
    name: str
    # Capital math (context, not weighted directly)
    capital_available: float
    capital_needed: float
    capital_coverage_pct: float
    # Seven scoring dimensions
    capital_availability: float
    credit_fit: float
    liquidity_preservation: float
    cash_flow_impact: float
    long_term_wealth_impact: float
    complexity: float
    risk: float
    # Final
    weighted_score: float
    rank: int
    # Consumer language
    consumer_output: str
    capital_check: str
    key_tradeoff: str
    recommendation_type: str
    property_type_note: str
    product_logic_fit: str


class DashboardOutSchema(BaseModel):
    target_property_type: str
    property_type_logic: str
    total_equity: float
    estimated_accessible_equity: float
    portfolio_monthly_cash_flow: float
    target_property_dscr: float
    capital_needed: float
    target_monthly_cash_flow_or_flip_profit: float
    recommended_path: str
    recommended_score: float
    alternative_path: Optional[str]
    alternative_score: Optional[float]
    consumer_explanation: str
    primary_tradeoff: str
    property_type_note: str
    suggested_next_step: str


class RunPortfolioResponse(BaseModel):
    portfolio: PortfolioAnalyticsOut
    target_metrics: TargetMetricsOut
    strategies: List[ScoredStrategyOut]
    dashboard: DashboardOutSchema
