"""
api/scenario_routes.py

FastAPI router for the Home Decision Model scenario engine.

Mount on the main app:
    from api.scenario_routes import router as scenario_router
    app.include_router(scenario_router, prefix="/api")

Endpoints:
    POST /api/scenarios/run                 — full engine (5 scenarios + Decision Map + Audit)
    POST /api/scenarios/stay                — Stay scenario only
    POST /api/scenarios/refinance           — Refinance scenario only
    POST /api/scenarios/sell-buy            — Sell + Buy scenario only
    POST /api/scenarios/rent                — Rent (investment view) only
    POST /api/scenarios/rent-out-buy        — Rent Out & Buy scenario only
    POST /api/scenarios/decision-map        — Decision Map only (runs all 5 internally)

All endpoints are public and stateless — they run pure math on the supplied
inputs. Persistence of saved analyses, if needed, should live in a
separate `saved_scenarios` router analogous to the mortgage persistence
endpoints.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from scenarios import (
    compute_decision_map,
    compute_refinance,
    compute_rent,
    compute_rent_out_buy,
    compute_sell_buy,
    compute_stay,
    run_all,
)
from scenarios.schemas import (
    DecisionMapOut,
    MasterInputsRequest,
    RefinanceOut,
    RentOut,
    RentOutBuyOut,
    RunAllResponse,
    SellBuyOut,
    StayOut,
)


logger = logging.getLogger(__name__)

router = APIRouter(tags=["Scenarios"])


# ---------------------------------------------------------------------------
# POST /api/scenarios/run — full engine
# ---------------------------------------------------------------------------

@router.post("/scenarios/run", response_model=RunAllResponse)
def run_full_engine(body: MasterInputsRequest) -> RunAllResponse:
    """
    Run the full Home Decision Model against one set of master inputs.

    Response payload contains all 5 scenarios, the Decision Map
    (recommendation + rankings + feasibility flags), and the audit report.

    Mirrors the workflow of the client's Excel model: edit column B,
    everything else recomputes.
    """
    try:
        result = run_all(body.to_inputs())
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    return RunAllResponse.from_result(result)


# ---------------------------------------------------------------------------
# Per-scenario endpoints — useful for drill-down UIs and for callers that
# only need one view. Each takes the full MasterInputs because the scenarios
# share assumptions (appreciation rate, hold period, selling cost %, etc.).
# ---------------------------------------------------------------------------

@router.post("/scenarios/stay", response_model=StayOut)
def run_stay(body: MasterInputsRequest) -> StayOut:
    """Stay scenario only — keep the current home and mortgage unchanged."""
    inputs = body.to_inputs()
    try:
        inputs.validate()
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    return StayOut.from_result(compute_stay(inputs))


@router.post("/scenarios/refinance", response_model=RefinanceOut)
def run_refinance(body: MasterInputsRequest) -> RefinanceOut:
    """Refinance scenario only — pay off current loan with a new one."""
    inputs = body.to_inputs()
    try:
        inputs.validate()
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    return RefinanceOut.from_result(compute_refinance(inputs))


@router.post("/scenarios/sell-buy", response_model=SellBuyOut)
def run_sell_buy(body: MasterInputsRequest) -> SellBuyOut:
    """Sell + Buy scenario only — sell current and purchase replacement."""
    inputs = body.to_inputs()
    try:
        inputs.validate()
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    stay = compute_stay(inputs)
    return SellBuyOut.from_result(
        compute_sell_buy(inputs, stay.total_monthly_ownership_cost)
    )


@router.post("/scenarios/rent", response_model=RentOut)
def run_rent(body: MasterInputsRequest) -> RentOut:
    """Rent scenario (investment view) only — excludes next-housing cost."""
    inputs = body.to_inputs()
    try:
        inputs.validate()
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    return RentOut.from_result(compute_rent(inputs))


@router.post("/scenarios/rent-out-buy", response_model=RentOutBuyOut)
def run_rent_out_buy(body: MasterInputsRequest) -> RentOutBuyOut:
    """Rent Out & Buy scenario only — keep current as rental, buy new primary."""
    inputs = body.to_inputs()
    try:
        inputs.validate()
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    stay = compute_stay(inputs)
    return RentOutBuyOut.from_result(
        compute_rent_out_buy(inputs, stay.total_monthly_ownership_cost)
    )


@router.post("/scenarios/decision-map", response_model=DecisionMapOut)
def run_decision_map(body: MasterInputsRequest) -> DecisionMapOut:
    """
    Decision Map only — runs all 5 scenarios internally but returns only
    the cross-scenario comparison, rankings, and feasibility flags.

    Use this when the UI wants the recommendation payload without the
    per-scenario detail cards.
    """
    inputs = body.to_inputs()
    try:
        inputs.validate()
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    stay = compute_stay(inputs)
    refi = compute_refinance(inputs)
    sb = compute_sell_buy(inputs, stay.total_monthly_ownership_cost)
    rent = compute_rent(inputs)
    rob = compute_rent_out_buy(inputs, stay.total_monthly_ownership_cost)
    return DecisionMapOut.from_result(
        compute_decision_map(inputs, stay, refi, sb, rent, rob)
    )
