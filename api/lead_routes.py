"""
api/lead_routes.py

FastAPI router for the Saveero CRM leads feature.

Mount on the main app:
    from api.lead_routes import router as lead_router
    app.include_router(lead_router, prefix="/api")

Endpoints:
    POST   /api/leads        — create-or-upsert the current user's lead row
                                (called from the frontend signup flow after
                                Supabase signUp succeeds; supplies the name
                                captured on the signup form)
    GET    /api/leads/me     — read the current user's own lead row
    PUT    /api/leads/me     — partial update of the current user's row
                                (post-signup wizard, in-app enrichment)
    POST   /api/leads/me/activity — append an entry to the activity_log
                                (called from in-app actions: ran a tool,
                                clicked a Contact button, etc.)
    GET    /api/leads        — admin-only — list all leads (drives /admin/crm)

Scoping:
- Everything except `GET /api/leads` (the admin list) is owned by the
  current user; the leads RLS policy lets them read/write their own row.
- `GET /api/leads` requires `public.is_admin(auth.uid())` which the RLS
  policy enforces at the database layer.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.auth import CurrentUser
from core.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Leads"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

LeadRole = str       # 'homeowner' | 'pro' | 'unknown'
LeadIntent = str     # 'considering_move' | 'refinance' | 'rental_explore' | 'curious' | 'unknown'
LeadStatus = str     # 'new' | 'enriched' | 'active' | 'engaged' | 'converted' | 'lost'


class CreateLeadRequest(BaseModel):
    """Payload from the frontend signup form."""
    name: Optional[str] = None


class UpdateLeadRequest(BaseModel):
    """Partial update — any subset of these fields can be patched.

    Used by the post-signup wizard (sets role + intent) and any future
    enrichment surfaces. Server-side status transitions are computed
    automatically, not patched directly from the client.
    """
    name: Optional[str] = None
    role: Optional[LeadRole] = None
    intent: Optional[LeadIntent] = None
    pipeline: Optional[str] = None


class ActivityEntry(BaseModel):
    """Body of POST /api/leads/me/activity."""
    kind: str = Field(..., description="Event slug, e.g. 'ran_decision_map'")
    data: Optional[dict] = None


class LeadOut(BaseModel):
    id: str
    user_id: str
    name: Optional[str] = None
    role: LeadRole
    intent: LeadIntent
    pipeline: Optional[str] = None
    status: LeadStatus
    activity_log: List[dict]
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_user_row(user_id: str, email: str) -> None:
    """
    Mirror the helper in mortgage_routes — make sure there's a row in
    public.users for this auth user before inserting anything that FKs to
    it. The leads table references users(id).
    """
    db = get_db()
    existing = db.table("users").select("id").eq("id", user_id).execute()
    if not existing.data:
        db.table("users").insert({
            "id": user_id,
            "email": email or "",
            "role": "seller",
        }).execute()


def _fetch_lead(user_id: str) -> Optional[dict]:
    """Return the lead row for a given user, or None if it doesn't exist."""
    db = get_db()
    result = db.table("leads").select("*").eq("user_id", user_id).execute()
    rows = result.data or []
    return rows[0] if rows else None


def _append_activity(row: dict, kind: str, data: Optional[dict] = None) -> list:
    """Return a new activity_log list with one entry appended."""
    log = list(row.get("activity_log") or [])
    log.append({
        "at": datetime.now(timezone.utc).isoformat(),
        "kind": kind,
        "data": data or {},
    })
    return log


# ---------------------------------------------------------------------------
# POST /api/leads — create-or-upsert the current user's lead row
# ---------------------------------------------------------------------------

@router.post("/leads", response_model=LeadOut)
def create_lead(body: CreateLeadRequest, user: CurrentUser) -> dict:
    """
    Called from the signup form right after Supabase signUp succeeds.

    Idempotent: if a lead row already exists for this user (e.g. the user
    re-signed-up after their first attempt failed), update the existing
    row with whatever new fields the client supplied rather than erroring.
    Either way, we append a 'signed_up' entry to the activity log so the
    admin view can see when the account was created.
    """
    db = get_db()
    user_id: str = user["sub"]
    email: str = user.get("email", "")
    _ensure_user_row(user_id, email)

    existing = _fetch_lead(user_id)

    if existing is None:
        new_row = {
            "user_id": user_id,
            "name": body.name,
            "status": "new",
            "activity_log": [{
                "at": datetime.now(timezone.utc).isoformat(),
                "kind": "signed_up",
                "data": {"source": "signup_form"},
            }],
        }
        result = db.table("leads").insert(new_row).execute()
        if not result.data:
            raise HTTPException(500, "Failed to create lead")
        return result.data[0]

    # Lead already exists — patch in the name if the client supplied one
    # and the row didn't have it. Don't overwrite a previously-set name.
    updates: dict[str, Any] = {}
    if body.name and not existing.get("name"):
        updates["name"] = body.name
    if updates:
        result = (
            db.table("leads")
            .update(updates)
            .eq("user_id", user_id)
            .execute()
        )
        if result.data:
            return result.data[0]
    return existing


# ---------------------------------------------------------------------------
# GET /api/leads/me — read the current user's own lead row
# ---------------------------------------------------------------------------

@router.get("/leads/me", response_model=LeadOut)
def get_my_lead(user: CurrentUser) -> dict:
    user_id: str = user["sub"]
    row = _fetch_lead(user_id)
    if row is None:
        raise HTTPException(404, "No lead row for current user")
    return row


# ---------------------------------------------------------------------------
# PUT /api/leads/me — partial update (wizard / enrichment)
# ---------------------------------------------------------------------------

@router.put("/leads/me", response_model=LeadOut)
def update_my_lead(body: UpdateLeadRequest, user: CurrentUser) -> dict:
    """
    Partial update of the current user's lead. Used by the post-signup
    wizard (sets role + intent) and any future enrichment surface.

    Status transitions:
        - If status is currently 'new' and either role or intent moves
          off 'unknown', bump status to 'enriched'.
    Other status transitions (active when they run a tool, engaged when
    they click a Contact button) happen through the activity endpoint.
    """
    db = get_db()
    user_id: str = user["sub"]
    existing = _fetch_lead(user_id)
    if existing is None:
        raise HTTPException(404, "No lead row for current user — create it via POST /api/leads")

    updates: dict[str, Any] = {}
    for field in ("name", "role", "intent", "pipeline"):
        v = getattr(body, field)
        if v is not None:
            updates[field] = v

    if not updates:
        return existing

    # Compute status bump if appropriate.
    next_role = updates.get("role", existing.get("role"))
    next_intent = updates.get("intent", existing.get("intent"))
    if (
        existing.get("status") == "new"
        and (next_role != "unknown" or next_intent != "unknown")
    ):
        updates["status"] = "enriched"
        # Mark the wizard completion in the activity log alongside the patch.
        updates["activity_log"] = _append_activity(
            existing, "completed_wizard",
            {"role": next_role, "intent": next_intent},
        )

    result = (
        db.table("leads")
        .update(updates)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(500, "Failed to update lead")
    return result.data[0]


# ---------------------------------------------------------------------------
# POST /api/leads/me/activity — append an activity log entry
# ---------------------------------------------------------------------------

@router.post("/leads/me/activity", response_model=LeadOut)
def append_activity(body: ActivityEntry, user: CurrentUser) -> dict:
    """
    Append a single event to the current user's activity_log and bump
    status if appropriate:
        - any tool-use event ('ran_*', 'saved_*') -> at least 'active'
        - 'clicked_contact_*' -> at least 'engaged'
    Status never moves backwards, so a fresh run after engagement
    stays at 'engaged'.
    """
    db = get_db()
    user_id: str = user["sub"]
    existing = _fetch_lead(user_id)
    if existing is None:
        raise HTTPException(404, "No lead row for current user")

    new_log = _append_activity(existing, body.kind, body.data)

    updates: dict[str, Any] = {"activity_log": new_log}

    current_status = existing.get("status") or "new"
    # Simple ladder; only move forward.
    rank = {"new": 0, "enriched": 1, "active": 2, "engaged": 3, "converted": 4, "lost": 4}
    target: Optional[str] = None
    if body.kind.startswith("clicked_contact_"):
        target = "engaged"
    elif body.kind.startswith("ran_") or body.kind.startswith("saved_"):
        target = "active"
    if target and rank.get(target, 0) > rank.get(current_status, 0):
        updates["status"] = target

    result = (
        db.table("leads")
        .update(updates)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(500, "Failed to append activity")
    return result.data[0]


# ---------------------------------------------------------------------------
# GET /api/leads — admin only — full list for the CRM dashboard
# ---------------------------------------------------------------------------

@router.get("/leads", response_model=List[LeadOut])
def list_leads(user: CurrentUser) -> List[dict]:
    """
    List every lead in the system, newest first. The RLS policy on the
    leads table enforces admin-only access via public.is_admin(auth.uid()),
    so a non-admin caller will get back an empty result rather than an
    explicit 403 — which we surface as such here.
    """
    db = get_db()
    result = (
        db.table("leads")
        .select("*")
        .order("created_at", desc=True)
        .execute()
    )
    rows = result.data or []

    # Defensive: if the caller is non-admin and the RLS policy filtered
    # everything out, distinguish that from "the table is empty" by
    # checking the role of the calling user.
    if not rows:
        user_id: str = user["sub"]
        own = db.table("users").select("role").eq("id", user_id).execute()
        role = (own.data or [{}])[0].get("role")
        if role != "admin":
            raise HTTPException(403, "Admin access required")

    return rows
