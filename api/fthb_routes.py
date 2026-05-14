"""
api/fthb_routes.py

FastAPI router for the First-Time Homebuyer scenario engine.

Mount on the main app:
    from api.fthb_routes import router as fthb_router
    app.include_router(fthb_router, prefix="/api")

Endpoints:
    POST   /api/fthb/scenarios/run                  — full FTHB engine
    POST   /api/fthb/scenarios/continue-renting     — Continue Renting
    POST   /api/fthb/scenarios/buy-starter          — Buy Starter Home
    POST   /api/fthb/scenarios/buy-preferred        — Buy Preferred Home
    POST   /api/fthb/scenarios/buy-with-assistance  — Buy with DPA
    POST   /api/fthb/scenarios/delay-purchase       — Delay Purchase
    POST   /api/fthb/scenarios/decision-map         — Decision Map only
    POST   /api/fthb/analyses                       — save an analysis for the current user
    GET    /api/fthb/analyses                       — list saved analyses, newest first
    GET    /api/fthb/analyses/{id}                  — fetch one saved analysis
    DELETE /api/fthb/analyses/{id}                  — delete a saved analysis

Parallel to /api/scenarios/* (the homeowner engine). Same shape so the
two engines can be consumed by the same client patterns + the future
AI interpretation layer.

The scenario/* endpoints are public and stateless — pure math on the
supplied inputs. The analyses/* endpoints persist saved analyses and
require auth, matching the anonymous-first flow + the mortgage analyzer
precedent.
"""
from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, HTTPException, Response, status
from postgrest.exceptions import APIError as PostgrestAPIError

from core.auth import CurrentUser
from core.database import get_db
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
    SaveAnalysisRequest,
    SavedAnalysisSummary,
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


# ---------------------------------------------------------------------------
# POST /api/fthb/analyses (persistence — requires auth)
# ---------------------------------------------------------------------------

def _ensure_user_row(user_id: str, email: str) -> None:
    """
    Mirror the pattern used in mortgage_routes / listing_wizard_routes: make
    sure there's a row in public.users for this auth user before inserting
    anything that FKs to it.
    """
    db = get_db()
    existing = db.table("users").select("id").eq("id", user_id).execute()
    if not existing.data:
        db.table("users").insert({
            "id": user_id,
            "email": email or "",
            "role": "seller",
        }).execute()


@router.post("/fthb/analyses")
def save_analysis(body: SaveAnalysisRequest, user: CurrentUser) -> dict:
    """
    Save a computed FTHB analysis for the current user.

    The client sends the inputs (FTHBInputs) and result (RunAllResponse) as
    opaque JSON blobs — we don't re-compute server-side. A few denormalized
    fields are pulled out for lightweight list queries.
    """
    db = get_db()
    user_id: str = user["sub"]
    _ensure_user_row(user_id, user.get("email", ""))

    inputs = body.inputs or {}
    result = body.result or {}
    recommendation = (result.get("decision_map") or {}).get("recommendation") or {}

    row = {
        "user_id": user_id,
        "label": body.label,
        "annual_household_income": inputs.get("annual_household_income"),
        "starter_home_price": inputs.get("starter_home_price"),
        "preferred_home_price": inputs.get("preferred_home_price"),
        "horizon_years": inputs.get("horizon_years"),
        "best_executable_path": recommendation.get("best_executable_path"),
        "best_net_position": recommendation.get("best_net_position"),
        "inputs": inputs,
        "result": result,
    }

    try:
        inserted = db.table("fthb_analyses").insert(row).execute()
    except PostgrestAPIError as exc:
        logger.exception("Failed to insert fthb_analyses row")
        raise HTTPException(
            status_code=500,
            detail=f"Database error saving analysis: {exc.message}",
        )

    if not inserted.data:
        raise HTTPException(status_code=500, detail="Insert returned no data.")

    return {"success": True, "id": inserted.data[0]["id"]}


# ---------------------------------------------------------------------------
# GET /api/fthb/analyses (list)
# ---------------------------------------------------------------------------

@router.get("/fthb/analyses", response_model=List[SavedAnalysisSummary])
def list_analyses(user: CurrentUser) -> List[dict]:
    """Return the current user's saved FTHB analyses, newest first."""
    db = get_db()
    user_id: str = user["sub"]

    result = (
        db.table("fthb_analyses")
        .select(
            "id, label, annual_household_income, starter_home_price, "
            "preferred_home_price, horizon_years, best_executable_path, "
            "best_net_position, created_at"
        )
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


# ---------------------------------------------------------------------------
# GET /api/fthb/analyses/{id}
# ---------------------------------------------------------------------------

@router.get("/fthb/analyses/{analysis_id}")
def get_analysis(analysis_id: str, user: CurrentUser) -> dict:
    """Return a single saved FTHB analysis, including full inputs and result blobs."""
    db = get_db()
    user_id: str = user["sub"]

    try:
        result = (
            db.table("fthb_analyses")
            .select("*")
            .eq("id", analysis_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
    except PostgrestAPIError:
        raise HTTPException(status_code=404, detail="Analysis not found.")

    if not result.data:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    return result.data


# ---------------------------------------------------------------------------
# DELETE /api/fthb/analyses/{id}
# ---------------------------------------------------------------------------

@router.delete(
    "/fthb/analyses/{analysis_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_analysis(analysis_id: str, user: CurrentUser):
    """Delete a saved FTHB analysis. No-op if it doesn't exist (by design)."""
    db = get_db()
    user_id: str = user["sub"]
    db.table("fthb_analyses").delete().eq("id", analysis_id).eq("user_id", user_id).execute()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
