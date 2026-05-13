"""
api/fthb_routes.py

FastAPI router for the First-Time Homebuyer scenario engine.

Mount on the main app:
    from api.fthb_routes import router as fthb_router
    app.include_router(fthb_router, prefix="/api")

Endpoints:
    POST /api/fthb/scenarios/run                    — full FTHB engine
    POST /api/fthb/scenarios/continue-renting       — Continue Renting
    POST /api/fthb/scenarios/buy-starter            — Buy Starter Home
    POST /api/fthb/scenarios/buy-preferred          — Buy Preferred Home
    POST /api/fthb/scenarios/buy-with-assistance    — Buy with DPA
    POST /api/fthb/scenarios/delay-purchase         — Delay Purchase
    POST /api/fthb/scenarios/decision-map           — Decision Map only

Parallel to /api/scenarios/* (the homeowner engine). Same shape so the
two engines can be consumed by the same client patterns + the future
AI interpretation layer.

All endpoints are public and stateless — pure math on the supplied
inputs. Persistence of saved analyses, if added later, should live in
its own router.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from scenarios.fthb import (
    compute_buy_preferred,
    compute_buy_starter,
    compute_buy_with_assistance,
    compute_continue_renting,
    compute_decision_map,
    compute_delay_purchase,
    run_all,
)
from scenarios.fthb.schemas import (
    BuyScenarioOut,
    ContinueRentingOut,
    DecisionMapOut,
    DelayOut,
    FTHBInputsRequest,
    RunAllResponse,
)


logger = logging.getLogger(__name__)

router = APIRouter(tags=["FTHB"])


# ---------------------------------------------------------------------------
# POST /api/fthb/scenarios/run — full engine
# ---------------------------------------------------------------------------

@router.post("/fthb/scenarios/run", response_model=RunAllResponse)
def run_full_engine(body: FTHBInputsRequest) -> RunAllResponse:
    """
    Run the full FTHB engine against one set of inputs.

    Response payload contains all 5 scenarios, the Decision Map
    (scenario comparison + recommendation snapshot), and the audit report.
    """
    try:
        result = run_all(body.to_inputs())
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    return RunAllResponse.from_result(result)


# ---------------------------------------------------------------------------
# Per-scenario endpoints — useful for drill-down UIs and for callers that
# only need one view. Each takes the full FTHBInputs because the scenarios
# share assumptions.
# ---------------------------------------------------------------------------

def _validate(body: FTHBInputsRequest):
    inputs = body.to_inputs()
    try:
        inputs.validate()
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    return inputs


@router.post("/fthb/scenarios/continue-renting", response_model=ContinueRentingOut)
def run_continue_renting(body: FTHBInputsRequest) -> ContinueRentingOut:
    """Continue Renting scenario only."""
    return ContinueRentingOut.from_result(compute_continue_renting(_validate(body)))


@router.post("/fthb/scenarios/buy-starter", response_model=BuyScenarioOut)
def run_buy_starter(body: FTHBInputsRequest) -> BuyScenarioOut:
    """Buy Starter Home scenario only."""
    return BuyScenarioOut.from_result(compute_buy_starter(_validate(body)))


@router.post("/fthb/scenarios/buy-preferred", response_model=BuyScenarioOut)
def run_buy_preferred(body: FTHBInputsRequest) -> BuyScenarioOut:
    """Buy Preferred Home scenario only."""
    return BuyScenarioOut.from_result(compute_buy_preferred(_validate(body)))


@router.post("/fthb/scenarios/buy-with-assistance", response_model=BuyScenarioOut)
def run_buy_with_assistance(body: FTHBInputsRequest) -> BuyScenarioOut:
    """Buy with Downpayment Assistance scenario only."""
    return BuyScenarioOut.from_result(compute_buy_with_assistance(_validate(body)))


@router.post("/fthb/scenarios/delay-purchase", response_model=DelayOut)
def run_delay_purchase(body: FTHBInputsRequest) -> DelayOut:
    """Delay Purchase scenario only."""
    return DelayOut.from_result(compute_delay_purchase(_validate(body)))


@router.post("/fthb/scenarios/decision-map", response_model=DecisionMapOut)
def run_decision_map(body: FTHBInputsRequest) -> DecisionMapOut:
    """
    Decision Map only — runs all 5 scenarios internally but returns only
    the comparison table + recommendation snapshot.
    """
    inputs = _validate(body)
    rent = compute_continue_renting(inputs)
    starter = compute_buy_starter(inputs)
    preferred = compute_buy_preferred(inputs)
    assistance = compute_buy_with_assistance(inputs)
    delay = compute_delay_purchase(inputs)
    return DecisionMapOut.from_result(
        compute_decision_map(inputs, rent, starter, preferred, assistance, delay)
    )
