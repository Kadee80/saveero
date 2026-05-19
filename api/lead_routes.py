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

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from core.auth import CurrentUser
from core.database import get_db
from core.notifications import notify_lead_engaged

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

    Used by the post-signup wizard (sets role + intent + pipeline +
    optionally pro_type) and any future enrichment surfaces. Server-side
    status transitions are computed automatically, not patched directly
    from the client.
    """
    name: Optional[str] = None
    role: Optional[LeadRole] = None
    intent: Optional[LeadIntent] = None
    pipeline: Optional[str] = None
    # Only meaningful when role='pro'. Values mirror the pipeline slugs
    # (financial-planner / real-estate-agent / mortgage-broker) — it's
    # what kind of pro the user IS, vs. pipeline which (for consumers) is
    # what kind of pro the user wants to work with.
    pro_type: Optional[str] = None


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
    pro_type: Optional[str] = None
    status: LeadStatus
    activity_log: List[dict]
    created_at: str
    updated_at: str
    # Embedded from public.users via the user_id FK. Optional because the
    # endpoints that return one lead at a time (GET /me, PUT /me, etc.)
    # don't bother joining — we know the caller's email from the JWT.
    # Populated on GET /api/leads (admin list) where the CRM needs it.
    email: Optional[str] = None


def _flatten_user(row: dict) -> dict:
    """
    PostgREST embeds the joined users row as a nested object under the
    relationship name ('users'). Flatten that to a top-level `email`
    field so callers don't have to know about the join shape.
    """
    nested = row.pop("users", None) or {}
    if isinstance(nested, dict):
        row["email"] = nested.get("email")
    return row


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


def _require_admin(user_id: str) -> None:
    """
    Application-layer admin check.

    Important: get_db() uses the Supabase service-role key, which bypasses
    RLS. That means database-layer policies are NOT enforced for backend-
    initiated queries — admin-only endpoints have to check explicitly.
    Looks up the caller's row in public.users and 403s unless role='admin'.
    """
    db = get_db()
    own = db.table("users").select("role").eq("id", user_id).execute()
    role = (own.data or [{}])[0].get("role") if own.data else None
    if role != "admin":
        raise HTTPException(403, "Admin access required")


# ---------------------------------------------------------------------------
# GET /api/me/profile — lightweight self-profile read (used for admin
# detection on App mount). Doesn't belong to /leads conceptually but lives
# here for now since admin detection is the only caller. Move to a
# dedicated user_routes.py when there's a second consumer.
# ---------------------------------------------------------------------------

class MyProfileOut(BaseModel):
    id: str
    email: Optional[str] = None
    role: str
    is_admin: bool


@router.get("/me/profile", response_model=MyProfileOut)
def get_my_profile(user: CurrentUser) -> dict:
    """
    Return the caller's own public.users row + a precomputed is_admin
    flag. Replaces the previous "call listAllLeads and see if it 200s"
    pattern, which was disastrously heavy on cold-start Render dynos:
    listAllLeads returns every lead + their full activity_log, which on
    a single-threaded backend blocked the user's own /leads/me read and
    left the dashboard stuck on Loading… for admin accounts.
    """
    db = get_db()
    user_id: str = user["sub"]
    _ensure_user_row(user_id, user.get("email", ""))
    result = (
        db.table("users")
        .select("id, email, role")
        .eq("id", user_id)
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(404, "User row not found")
    row = rows[0]
    return {
        "id": row["id"],
        "email": row.get("email"),
        "role": row.get("role") or "seller",
        "is_admin": row.get("role") == "admin",
    }


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
    for field in ("name", "role", "intent", "pipeline", "pro_type"):
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
def append_activity(
    body: ActivityEntry,
    user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> dict:
    """
    Append a single event to the current user's activity_log and bump
    status if appropriate:
        - any tool-use event ('ran_*', 'saved_*') -> at least 'active'
        - 'clicked_contact_*' -> at least 'engaged'
    Status never moves backwards, so a fresh run after engagement
    stays at 'engaged'.

    When a lead transitions *into* 'engaged' here, an outbound webhook
    fires (see core.notifications) so the partner team can react fast.
    It runs as a background task — zero added latency to this request —
    and only on the user-driven transition; an admin manually marking a
    lead 'engaged' via the CRM doesn't notify (they already know).
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

    updated = result.data[0]

    # Notify on the new→engaged transition only — `updates["status"]` is
    # set above exactly when the lead moved up the ladder this request.
    if updates.get("status") == "engaged":
        background_tasks.add_task(
            notify_lead_engaged, updated, trigger_kind=body.kind
        )

    return updated


# ---------------------------------------------------------------------------
# GET /api/leads — admin only — full list for the CRM dashboard
# ---------------------------------------------------------------------------

class BulkDeleteLeadsRequest(BaseModel):
    """Body for POST /api/leads/bulk-delete."""
    lead_ids: List[str] = Field(default_factory=list)


@router.post("/leads/bulk-delete")
def bulk_delete_leads(
    body: BulkDeleteLeadsRequest,
    user: CurrentUser,
) -> dict:
    """
    Admin-only — delete one or more leads by id.

    Single endpoint for both "delete a single lead from the drawer" and
    "delete N selected from the Kanban" — the frontend calls this with
    a one-element list in the former case and an N-element list in the
    latter. Only the `leads` row is removed; the corresponding
    `public.users` row stays untouched. If the user comes back to the
    app, App.tsx's seed-on-session effect will create a fresh lead row
    with status='new' — re-entry rather than ban.
    """
    _require_admin(user["sub"])
    if not body.lead_ids:
        return {"deleted": 0}

    db = get_db()
    result = db.table("leads").delete().in_("id", body.lead_ids).execute()
    deleted = len(result.data or [])
    return {"deleted": deleted}


@router.get("/leads", response_model=List[LeadOut])
def list_leads(user: CurrentUser) -> List[dict]:
    """
    List every lead in the system, newest first. Admin only — see the
    note on _require_admin for why this is an application-layer check
    rather than a database RLS one.

    Embeds the public.users.email via the user_id FK so the CRM drawer
    can show + mailto: contact info. PostgREST returns the joined row
    as a nested object; _flatten_user() lifts the email up to a
    top-level field so the response shape stays flat.
    """
    _require_admin(user["sub"])
    db = get_db()
    result = (
        db.table("leads")
        .select("*, users(email)")
        .order("created_at", desc=True)
        .execute()
    )
    rows = result.data or []
    return [_flatten_user(row) for row in rows]


# ---------------------------------------------------------------------------
# PATCH /api/leads/{lead_id} — admin status editing
# ---------------------------------------------------------------------------

class AdminPatchLeadRequest(BaseModel):
    """
    Admin patch payload. Status changes are the primary use case (mark a
    lead as 'converted' when a partner reports the deal closed, 'lost'
    when they go unresponsive, etc.) but we accept other fields too so
    admins can fix typos on a captured name / pipeline without going
    around the API.
    """
    status: Optional[LeadStatus] = None
    note: Optional[str] = None
    name: Optional[str] = None
    role: Optional[LeadRole] = None
    intent: Optional[LeadIntent] = None
    pro_type: Optional[str] = None
    pipeline: Optional[str] = None


@router.patch("/leads/{lead_id}", response_model=LeadOut)
def admin_patch_lead(
    lead_id: str,
    body: AdminPatchLeadRequest,
    user: CurrentUser,
) -> dict:
    """
    Admin-only partial update of an arbitrary lead.

    Status changes bypass the forward-only ladder used by the user-facing
    activity endpoint — an admin reviewing leads needs to be able to walk
    a status back (e.g. mark a 'converted' lead 'engaged' again if the
    partner's deal fell through). Any status change is logged to the
    activity_log as `admin_marked_<status>` with the optional note.
    """
    _require_admin(user["sub"])
    db = get_db()

    existing_result = db.table("leads").select("*").eq("id", lead_id).execute()
    existing_rows = existing_result.data or []
    if not existing_rows:
        raise HTTPException(404, f"Lead {lead_id} not found")
    existing = existing_rows[0]

    updates: dict[str, Any] = {}
    for field in ("name", "role", "intent", "pipeline", "pro_type"):
        v = getattr(body, field)
        if v is not None:
            updates[field] = v

    if body.status is not None:
        updates["status"] = body.status
        # Always append an audit entry on status changes so the timeline
        # makes clear this was an admin action, not a user transition.
        updates["activity_log"] = _append_activity(
            existing,
            f"admin_marked_{body.status}",
            {
                "note": body.note,
                "by_user_id": user["sub"],
                "previous_status": existing.get("status"),
            },
        )

    if not updates:
        return existing

    result = (
        db.table("leads")
        .update(updates)
        .eq("id", lead_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(500, "Failed to update lead")
    return result.data[0]
