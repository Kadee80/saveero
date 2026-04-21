"""
api/mortgage_routes.py

FastAPI router for the mortgage analyzer.

Mount on the main app:
    from api.mortgage_routes import router as mortgage_router
    app.include_router(mortgage_router, prefix="/api")

Endpoints:
    POST /api/mortgage/analyze          — full mortgage analysis (stateless)
    POST /api/mortgage/affordability    — "how much house can I afford?"
    POST /api/mortgage/refinance        — refinance break-even / lifetime comparison
    POST /api/mortgage/analyses         — save an analysis for the current user
    GET  /api/mortgage/analyses         — list saved analyses, newest first
    GET  /api/mortgage/analyses/{id}    — fetch one saved analysis
    DELETE /api/mortgage/analyses/{id}  — delete a saved analysis

Compute endpoints are public (anonymous users can run numbers without signing
in). Persistence endpoints require auth, matching the anonymous-first flow
described in the MVP plan.
"""
from __future__ import annotations

import logging
from dataclasses import asdict
from typing import List

from fastapi import APIRouter, HTTPException, Response, status
from postgrest.exceptions import APIError as PostgrestAPIError

from core.auth import CurrentUser
from core.database import get_db
from mortgage import (
    AffordabilityInputs,
    CurrentLoan,
    LoanInputs,
    RefinanceOffer,
    analyze_mortgage,
    analyze_refinance,
    compute_affordability,
)
from mortgage.schemas import (
    AffordabilityRequest,
    AffordabilityResponse,
    AmortizationRowOut,
    AnalyzeMortgageRequest,
    AnalyzeMortgageResponse,
    MonthlyBreakdownOut,
    RefinanceRequest,
    RefinanceResponse,
    SaveAnalysisRequest,
    SavedAnalysisSummary,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Mortgage"])


# ---------------------------------------------------------------------------
# POST /api/mortgage/analyze
# ---------------------------------------------------------------------------

@router.post("/mortgage/analyze", response_model=AnalyzeMortgageResponse)
def analyze(body: AnalyzeMortgageRequest) -> AnalyzeMortgageResponse:
    """
    Run the full mortgage analyzer on the supplied loan inputs.

    Stateless — does not require auth. Results are not persisted; call
    /api/mortgage/analyses to save a result the user cares about.
    """
    try:
        summary = analyze_mortgage(LoanInputs(
            purchase_price=body.purchase_price,
            down_payment=body.down_payment,
            annual_rate_percent=body.annual_rate_percent,
            term_years=body.term_years,
            annual_property_tax_percent=body.annual_property_tax_percent,
            annual_insurance_dollars=body.annual_insurance_dollars,
            monthly_hoa=body.monthly_hoa,
        ))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return AnalyzeMortgageResponse(
        loan_amount=summary.loan_amount,
        ltv=summary.ltv,
        monthly_principal_interest=summary.monthly_principal_interest,
        monthly=MonthlyBreakdownOut(**asdict(summary.monthly)),
        total_interest_paid=summary.total_interest_paid,
        total_cost_of_loan=summary.total_cost_of_loan,
        pmi_required=summary.pmi_required,
        pmi_drop_off_month=summary.pmi_drop_off_month,
        amortization=[AmortizationRowOut(**asdict(r)) for r in summary.amortization],
    )


# ---------------------------------------------------------------------------
# POST /api/mortgage/affordability
# ---------------------------------------------------------------------------

@router.post("/mortgage/affordability", response_model=AffordabilityResponse)
def affordability(body: AffordabilityRequest) -> AffordabilityResponse:
    """
    Compute maximum affordable home price given income, debts, cash, and rate.
    Stateless.
    """
    result = compute_affordability(AffordabilityInputs(
        annual_income=body.annual_income,
        monthly_debts=body.monthly_debts,
        down_payment_cash=body.down_payment_cash,
        annual_rate_percent=body.annual_rate_percent,
        term_years=body.term_years,
        annual_property_tax_percent=body.annual_property_tax_percent,
        annual_insurance_dollars=body.annual_insurance_dollars,
        monthly_hoa=body.monthly_hoa,
        max_front_end_dti=body.max_front_end_dti,
        max_back_end_dti=body.max_back_end_dti,
    ))
    return AffordabilityResponse(**asdict(result))


# ---------------------------------------------------------------------------
# POST /api/mortgage/refinance
# ---------------------------------------------------------------------------

@router.post("/mortgage/refinance", response_model=RefinanceResponse)
def refinance(body: RefinanceRequest) -> RefinanceResponse:
    """
    Compare staying on the current loan vs. refinancing to the supplied offer.
    Stateless.
    """
    try:
        result = analyze_refinance(
            CurrentLoan(
                original_principal=body.current.original_principal,
                annual_rate_percent=body.current.annual_rate_percent,
                term_years=body.current.term_years,
                elapsed_months=body.current.elapsed_months,
            ),
            RefinanceOffer(
                annual_rate_percent=body.offer.annual_rate_percent,
                new_term_years=body.offer.new_term_years,
                closing_costs=body.offer.closing_costs,
                cash_out=body.offer.cash_out,
                rolled_in_closing=body.offer.rolled_in_closing,
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return RefinanceResponse(**asdict(result))


# ---------------------------------------------------------------------------
# POST /api/mortgage/analyses (persistence — requires auth)
# ---------------------------------------------------------------------------

def _ensure_user_row(user_id: str, email: str) -> None:
    """
    Mirror the pattern used in listing_wizard_routes: make sure there's a row
    in public.users for this auth user before inserting anything that FKs to it.
    """
    db = get_db()
    existing = db.table("users").select("id").eq("id", user_id).execute()
    if not existing.data:
        db.table("users").insert({
            "id": user_id,
            "email": email or "",
            "role": "seller",
        }).execute()


@router.post("/mortgage/analyses")
def save_analysis(body: SaveAnalysisRequest, user: CurrentUser) -> dict:
    """
    Save a computed mortgage analysis for the current user.

    The client sends the inputs and result as opaque JSON blobs — we don't
    re-compute server-side because the client may have applied user-specific
    tweaks (e.g. 'adjusted home value' from Instant Insight).
    """
    db = get_db()
    user_id: str = user["sub"]
    _ensure_user_row(user_id, user.get("email", ""))

    # Pull a few denormalized fields from inputs/result for lightweight list queries.
    inputs = body.inputs or {}
    result = body.result or {}

    row = {
        "user_id": user_id,
        "label": body.label,
        "analysis_type": body.analysis_type,
        "property_id": body.property_id,
        "purchase_price": inputs.get("purchase_price"),
        "loan_amount": result.get("loan_amount") or result.get("max_loan_amount")
                       or result.get("new_loan_amount"),
        "monthly_total": (
            (result.get("monthly") or {}).get("total")
            or result.get("estimated_monthly_total")
            or result.get("new_monthly_pi")
        ),
        "annual_rate_percent": inputs.get("annual_rate_percent"),
        "term_years": inputs.get("term_years"),
        "inputs": inputs,
        "result": result,
    }

    try:
        inserted = db.table("mortgage_analyses").insert(row).execute()
    except PostgrestAPIError as exc:
        logger.exception("Failed to insert mortgage_analyses row")
        raise HTTPException(
            status_code=500,
            detail=f"Database error saving analysis: {exc.message}",
        )

    if not inserted.data:
        raise HTTPException(status_code=500, detail="Insert returned no data.")

    return {"success": True, "id": inserted.data[0]["id"]}


# ---------------------------------------------------------------------------
# GET /api/mortgage/analyses (list)
# ---------------------------------------------------------------------------

@router.get("/mortgage/analyses", response_model=List[SavedAnalysisSummary])
def list_analyses(user: CurrentUser) -> List[dict]:
    """Return the current user's saved analyses, newest first."""
    db = get_db()
    user_id: str = user["sub"]

    result = (
        db.table("mortgage_analyses")
        .select(
            "id, label, analysis_type, purchase_price, loan_amount, monthly_total, "
            "annual_rate_percent, term_years, created_at"
        )
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


# ---------------------------------------------------------------------------
# GET /api/mortgage/analyses/{id}
# ---------------------------------------------------------------------------

@router.get("/mortgage/analyses/{analysis_id}")
def get_analysis(analysis_id: str, user: CurrentUser) -> dict:
    """Return a single saved analysis, including full inputs and result blobs."""
    db = get_db()
    user_id: str = user["sub"]

    try:
        result = (
            db.table("mortgage_analyses")
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
# DELETE /api/mortgage/analyses/{id}
# ---------------------------------------------------------------------------

@router.delete("/mortgage/analyses/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_analysis(analysis_id: str, user: CurrentUser):
    """Delete a saved analysis. No-op if it doesn't exist (by design)."""
    db = get_db()
    user_id: str = user["sub"]
    db.table("mortgage_analyses").delete().eq("id", analysis_id).eq("user_id", user_id).execute()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
