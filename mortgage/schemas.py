"""
mortgage/schemas.py

Pydantic request/response models for the mortgage API.

Separating these from the dataclasses in `core.py` / `analyzer.py` keeps
the math pure and lets the API layer own HTTP concerns (field aliases,
validation, JSON-friendly types).
"""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared
# ---------------------------------------------------------------------------

class AmortizationRowOut(BaseModel):
    month: int
    payment: float
    principal: float
    interest: float
    balance: float


# ---------------------------------------------------------------------------
# /api/mortgage/analyze
# ---------------------------------------------------------------------------

class AnalyzeMortgageRequest(BaseModel):
    purchase_price: float = Field(..., gt=0, description="Home purchase price in dollars")
    down_payment: float = Field(..., ge=0, description="Down payment in dollars")
    annual_rate_percent: float = Field(..., ge=0, le=30, description="Annual interest rate in percent (e.g. 6.75)")
    term_years: int = Field(..., gt=0, le=50, description="Loan term in years")
    annual_property_tax_percent: float = Field(1.2, ge=0, le=10)
    annual_insurance_dollars: float = Field(1500.0, ge=0)
    monthly_hoa: float = Field(0.0, ge=0)


class MonthlyBreakdownOut(BaseModel):
    principal: float
    interest: float
    pmi: float
    property_tax: float
    insurance: float
    hoa: float
    total: float


class AnalyzeMortgageResponse(BaseModel):
    loan_amount: float
    ltv: float
    monthly_principal_interest: float
    monthly: MonthlyBreakdownOut
    total_interest_paid: float
    total_cost_of_loan: float
    pmi_required: bool
    pmi_drop_off_month: int
    amortization: List[AmortizationRowOut]


# ---------------------------------------------------------------------------
# /api/mortgage/affordability
# ---------------------------------------------------------------------------

class AffordabilityRequest(BaseModel):
    annual_income: float = Field(..., gt=0)
    monthly_debts: float = Field(0.0, ge=0)
    down_payment_cash: float = Field(0.0, ge=0)
    annual_rate_percent: float = Field(6.75, ge=0, le=30)
    term_years: int = Field(30, gt=0, le=50)
    annual_property_tax_percent: float = Field(1.2, ge=0, le=10)
    annual_insurance_dollars: float = Field(1500.0, ge=0)
    monthly_hoa: float = Field(0.0, ge=0)
    max_front_end_dti: float = Field(0.35, gt=0, le=1)
    max_back_end_dti: float = Field(0.43, gt=0, le=1)


class AffordabilityResponse(BaseModel):
    monthly_income: float
    max_monthly_housing_payment: float
    binding_constraint: Literal["front_end_dti", "back_end_dti", "income_zero"]
    max_loan_amount: float
    max_purchase_price: float
    estimated_monthly_pi: float
    estimated_monthly_tax: float
    estimated_monthly_insurance: float
    estimated_monthly_pmi: float
    estimated_monthly_total: float
    front_end_dti: float
    back_end_dti: float
    pmi_required: bool
    notes: str


# ---------------------------------------------------------------------------
# /api/mortgage/refinance
# ---------------------------------------------------------------------------

class CurrentLoanIn(BaseModel):
    original_principal: float = Field(..., gt=0)
    annual_rate_percent: float = Field(..., ge=0, le=30)
    term_years: int = Field(..., gt=0, le=50)
    elapsed_months: int = Field(0, ge=0)


class RefinanceOfferIn(BaseModel):
    annual_rate_percent: float = Field(..., ge=0, le=30)
    new_term_years: int = Field(..., gt=0, le=50)
    closing_costs: float = Field(0.0, ge=0)
    cash_out: float = Field(0.0, ge=0)
    rolled_in_closing: bool = True


class RefinanceRequest(BaseModel):
    current: CurrentLoanIn
    offer: RefinanceOfferIn


class RefinanceResponse(BaseModel):
    current_balance: float
    current_monthly_pi: float
    current_remaining_months: int
    current_lifetime_remaining_interest: float

    new_loan_amount: float
    new_monthly_pi: float
    new_total_months: int
    new_lifetime_interest: float

    monthly_savings: float
    break_even_month: int
    lifetime_savings: float
    recommendation: Literal["refinance", "hold", "marginal"]
    notes: str


# ---------------------------------------------------------------------------
# /api/mortgage/analyses — persistence
# ---------------------------------------------------------------------------

class SavedAnalysisSummary(BaseModel):
    """Lightweight row for lists."""
    id: str
    label: Optional[str] = None
    analysis_type: Literal["analyze", "affordability", "refinance"]
    purchase_price: Optional[float] = None
    loan_amount: Optional[float] = None
    monthly_total: Optional[float] = None
    annual_rate_percent: Optional[float] = None
    term_years: Optional[int] = None
    created_at: str


class SaveAnalysisRequest(BaseModel):
    label: Optional[str] = Field(None, max_length=120)
    analysis_type: Literal["analyze", "affordability", "refinance"]
    inputs: dict                           # the original request body for replay
    result: dict                           # the computed result (for display without recompute)
    property_id: Optional[str] = None      # link to public.properties if available
