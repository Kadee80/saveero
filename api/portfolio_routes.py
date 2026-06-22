"""
api/portfolio_routes.py

FastAPI router for the Real Estate Portfolio Strategy Engine.

Mount on the main app:
    from api.portfolio_routes import router as portfolio_router
    app.include_router(portfolio_router, prefix="/api")

Endpoints (v1):
    POST /api/portfolio/run — full engine: analytics + target metrics +
                              scored strategies + dashboard payload.

Persistence endpoints (save / list / get / delete) will land in a
follow-up, matching the FTHB pattern.

Stateless. The engine math is pure; no DB needed for the run itself.
"""
from __future__ import annotations

import logging
from dataclasses import asdict

from fastapi import APIRouter, HTTPException

from portfolio import (
    ExistingProperty,
    PortfolioInputs,
    PortfolioProfile,
    TargetProperty,
    run_all,
)
from portfolio.inputs import (
    CreditBucket,
    GoalObjective,
    IncomeProfile,
    PropertyUse,
    RiskTolerance,
    TargetPropertyType,
    TimeHorizon,
)
from portfolio.schemas import (
    DashboardOutSchema,
    PortfolioAnalyticsOut,
    PortfolioSummaryOut,
    PropertyAnalyticsOut,
    RunPortfolioRequest,
    RunPortfolioResponse,
    ScoredStrategyOut,
    TargetMetricsOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Portfolio"])


# ---------------------------------------------------------------------------
# Conversion helpers — Pydantic request -> dataclass inputs
# ---------------------------------------------------------------------------

def _to_dataclass_inputs(req: RunPortfolioRequest) -> PortfolioInputs:
    try:
        profile = PortfolioProfile(
            credit_score_bucket=req.profile.credit_score_bucket,  # type: ignore[arg-type]
            income_profile=req.profile.income_profile,             # type: ignore[arg-type]
            available_cash=req.profile.available_cash,
            investor_goal=req.profile.investor_goal,               # type: ignore[arg-type]
            risk_tolerance=req.profile.risk_tolerance,             # type: ignore[arg-type]
            time_horizon=req.profile.time_horizon,                 # type: ignore[arg-type]
            expected_annual_appreciation=req.profile.expected_annual_appreciation,
            estimated_acquisition_closing_costs_pct=req.profile.estimated_acquisition_closing_costs_pct,
            target_down_payment_pct=req.profile.target_down_payment_pct,
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(400, f"Invalid profile: {exc}")

    properties = tuple(
        ExistingProperty(
            property_type=p.property_type,
            use_status=p.use_status,                                # type: ignore[arg-type]
            current_value=p.current_value,
            mortgage_balance=p.mortgage_balance,
            current_rate=p.current_rate,
            monthly_pi=p.monthly_pi,
            monthly_taxes_ins_hoa=p.monthly_taxes_ins_hoa,
            monthly_rent=p.monthly_rent,
            monthly_operating_expenses=p.monthly_operating_expenses,
            notes=p.notes,
        )
        for p in req.existing_properties
    )

    target = TargetProperty(
        target_property_type=req.target_property.target_property_type,  # type: ignore[arg-type]
        target_purchase_price=req.target_property.target_purchase_price,
        expected_monthly_rent_or_revenue=req.target_property.expected_monthly_rent_or_revenue,
        expected_monthly_taxes_ins_hoa=req.target_property.expected_monthly_taxes_ins_hoa,
        expected_operating_expenses=req.target_property.expected_operating_expenses,
        estimated_interest_rate=req.target_property.estimated_interest_rate,
        amortization_years=req.target_property.amortization_years,
        rehab_budget=req.target_property.rehab_budget,
        holding_costs=req.target_property.holding_costs,
        arv=req.target_property.arv,
        sale_costs_pct=req.target_property.sale_costs_pct,
    )

    return PortfolioInputs(
        profile=profile,
        existing_properties=properties,
        target_property=target,
    )


# ---------------------------------------------------------------------------
# POST /api/portfolio/run
# ---------------------------------------------------------------------------

@router.post("/portfolio/run", response_model=RunPortfolioResponse)
def run_portfolio(req: RunPortfolioRequest) -> RunPortfolioResponse:
    """
    Run the full Portfolio Strategy Engine.

    Stateless. Doesn't require auth. Persistence (save scenarios) is a
    follow-up parallel to the FTHB pattern.
    """
    inputs = _to_dataclass_inputs(req)
    try:
        result = run_all(inputs)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    return RunPortfolioResponse(
        portfolio=PortfolioAnalyticsOut(
            properties=[PropertyAnalyticsOut(**asdict(p)) for p in result.portfolio.properties],
            summary=PortfolioSummaryOut(**asdict(result.portfolio.summary)),
        ),
        target_metrics=TargetMetricsOut(**asdict(result.target_metrics)),
        strategies=[ScoredStrategyOut(**asdict(s)) for s in result.strategies],
        dashboard=DashboardOutSchema(**asdict(result.dashboard)),
    )
