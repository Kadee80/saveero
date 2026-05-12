"""
Seed the Saveero CRM with a representative set of fake leads for demos.

The /admin/crm Kanban only tells a real story when each column has cards
in it. With just one real test account the funnel looks tutorial-grade
on a screen-share. This script writes 10 fake leads spread across every
status — new, enriched, active, engaged, converted, lost — with
realistic activity_log entries and stage-entry timestamps tuned so the
"in stage" indicators land at a mix of "just now", hours, and days.

Idempotent: re-running deletes the previously-seeded demo set first
(matched by a stable email suffix) and re-inserts a fresh copy. Safe
to run before every demo to reset state.

Usage:
    python3 scripts/seed_demo_leads.py            # seed
    python3 scripts/seed_demo_leads.py --clear    # remove demo data only

Real leads (users whose email doesn't end in '@saveero-demo.local') are
never touched.
"""
from __future__ import annotations

import argparse
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

# Resolve the project root and add it to sys.path so we can import
# `core.database` exactly the way the FastAPI app does. Then this
# script works regardless of CWD.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.database import get_db  # noqa: E402

# Stable email suffix — every row this script writes ends with this so
# we can find and delete just the demo set without touching real users.
DEMO_SUFFIX = "@saveero-demo.local"


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(d: datetime) -> str:
    return d.isoformat()


def activity(at: datetime, kind: str, **data: Any) -> dict:
    """One activity_log entry in the same shape the backend writes."""
    return {"at": iso(at), "kind": kind, "data": data}


# ---------------------------------------------------------------------------
# Demo dataset.
#
# Each lead carries:
#   - name + email (email derived from a slug so we can recreate deterministically)
#   - role + intent + pipeline
#   - status  (drives which Kanban column it lands in)
#   - activity entries (timestamps tuned so durationLabel() reads as
#                       "just now" / "Xh" / "Xd" with a mix across the set)
# ---------------------------------------------------------------------------

def demo_leads() -> list[dict]:
    t = now()

    def back(minutes: int = 0, hours: int = 0, days: int = 0) -> datetime:
        return t - timedelta(minutes=minutes, hours=hours, days=days)

    return [
        # ── NEW ──────────────────────────────────────────────────────────
        {
            "slug": "alex-rivera",
            "name": "Alex Rivera",
            "role": "homeowner",
            "intent": "unknown",
            "pipeline": None,
            "status": "new",
            "created_at": back(minutes=20),
            "activity": [
                activity(back(minutes=20), "signed_up", source="signup_form"),
            ],
        },
        {
            "slug": "priya-shah",
            "name": "Priya Shah",
            "role": "homeowner",
            "intent": "unknown",
            "pipeline": None,
            "status": "new",
            "created_at": back(hours=4),
            "activity": [
                activity(back(hours=4), "signed_up", source="signup_form"),
            ],
        },

        # ── ENRICHED ─────────────────────────────────────────────────────
        {
            "slug": "jordan-okafor",
            "name": "Jordan Okafor",
            "role": "homeowner",
            "intent": "refinance",
            "pipeline": None,
            "status": "enriched",
            "created_at": back(days=1, hours=2),
            "activity": [
                activity(back(days=1, hours=2), "signed_up"),
                activity(back(days=1, hours=1), "completed_wizard",
                         role="homeowner", intent="refinance"),
            ],
        },
        {
            "slug": "marcus-li",
            "name": "Marcus Li",
            "role": "pro",
            "intent": "curious",
            "pipeline": None,
            "status": "enriched",
            "created_at": back(days=2),
            "activity": [
                activity(back(days=2), "signed_up"),
                activity(back(hours=18), "completed_wizard",
                         role="pro", intent="curious"),
            ],
        },

        # ── ACTIVE ───────────────────────────────────────────────────────
        {
            "slug": "tasha-bell",
            "name": "Tasha Bell",
            "role": "homeowner",
            "intent": "considering_move",
            "pipeline": None,
            "status": "active",
            "created_at": back(days=3),
            "activity": [
                activity(back(days=3), "signed_up"),
                activity(back(days=3) + timedelta(minutes=4), "completed_wizard",
                         role="homeowner", intent="considering_move"),
                activity(back(hours=5), "ran_decision_map",
                         purchase_price=825_000),
                activity(back(hours=2), "saved_mortgage_analysis",
                         purchase_price=825_000, term_years=30, rate=6.75),
            ],
        },
        {
            "slug": "ben-hartmann",
            "name": "Ben Hartmann",
            "role": "homeowner",
            "intent": "rental_explore",
            "pipeline": None,
            "status": "active",
            "created_at": back(days=5),
            "activity": [
                activity(back(days=5), "signed_up"),
                activity(back(days=5) + timedelta(minutes=2), "completed_wizard",
                         role="homeowner", intent="rental_explore"),
                activity(back(days=2), "ran_compare_scenarios"),
                activity(back(days=1, hours=3), "ran_decision_map"),
            ],
        },

        # ── ENGAGED ──────────────────────────────────────────────────────
        {
            "slug": "elena-vasquez",
            "name": "Elena Vasquez",
            "role": "homeowner",
            "intent": "refinance",
            "pipeline": "mortgage-broker",
            "status": "engaged",
            "created_at": back(days=4),
            "activity": [
                activity(back(days=4), "signed_up"),
                activity(back(days=4) + timedelta(minutes=3), "completed_wizard",
                         role="homeowner", intent="refinance"),
                activity(back(days=2, hours=6), "ran_decision_map"),
                activity(back(days=1), "saved_mortgage_analysis",
                         purchase_price=540_000, term_years=15, rate=6.25),
                activity(back(minutes=45), "clicked_contact_mortgage_broker",
                         pipeline="mortgage-broker"),
            ],
        },
        {
            "slug": "dan-okonkwo",
            "name": "Dan Okonkwo",
            "role": "homeowner",
            "intent": "considering_move",
            "pipeline": "real-estate-agent",
            "status": "engaged",
            "created_at": back(days=6),
            "activity": [
                activity(back(days=6), "signed_up"),
                activity(back(days=6) + timedelta(minutes=5), "completed_wizard",
                         role="homeowner", intent="considering_move"),
                activity(back(days=4), "ran_decision_map"),
                activity(back(days=3), "ran_compare_scenarios"),
                activity(back(hours=8), "clicked_contact_real_estate_agent",
                         pipeline="real-estate-agent"),
            ],
        },

        # ── CONVERTED ────────────────────────────────────────────────────
        {
            "slug": "naomi-cole",
            "name": "Naomi Cole",
            "role": "homeowner",
            "intent": "refinance",
            "pipeline": "mortgage-broker",
            "status": "converted",
            "created_at": back(days=12),
            "activity": [
                activity(back(days=12), "signed_up"),
                activity(back(days=12) + timedelta(minutes=4), "completed_wizard",
                         role="homeowner", intent="refinance"),
                activity(back(days=10), "ran_decision_map"),
                activity(back(days=9), "saved_mortgage_analysis",
                         purchase_price=620_000, term_years=30, rate=6.50),
                activity(back(days=8), "clicked_contact_mortgage_broker",
                         pipeline="mortgage-broker"),
                activity(back(days=2), "admin_marked_converted",
                         note="Closed with FP Smith on 2026-05-09.",
                         previous_status="engaged"),
            ],
        },

        # ── LOST ─────────────────────────────────────────────────────────
        {
            "slug": "ryan-kessler",
            "name": "Ryan Kessler",
            "role": "homeowner",
            "intent": "curious",
            "pipeline": "financial-planner",
            "status": "lost",
            "created_at": back(days=20),
            "activity": [
                activity(back(days=20), "signed_up"),
                activity(back(days=20) + timedelta(minutes=8), "completed_wizard",
                         role="homeowner", intent="curious"),
                activity(back(days=18), "ran_decision_map"),
                activity(back(days=16), "clicked_contact_financial_planner",
                         pipeline="financial-planner"),
                activity(back(days=4), "admin_marked_lost",
                         note="Three weeks no reply — moving on.",
                         previous_status="engaged"),
            ],
        },
    ]


# ---------------------------------------------------------------------------
# Seed / clear
# ---------------------------------------------------------------------------

def clear_demo_data(db) -> int:
    """
    Delete every user (and the leads cascade) whose email ends in
    DEMO_SUFFIX. Returns the count deleted.
    """
    found = (
        db.table("users")
        .select("id, email")
        .like("email", f"%{DEMO_SUFFIX}")
        .execute()
    )
    ids = [u["id"] for u in (found.data or [])]
    if not ids:
        return 0
    # Leads have ON DELETE CASCADE on user_id, so deleting the users
    # removes their lead rows automatically.
    db.table("users").delete().in_("id", ids).execute()
    return len(ids)


def seed_demo_data(db) -> int:
    """Insert the demo leads. Returns the count inserted."""
    leads = demo_leads()
    for lead in leads:
        user_id = str(uuid.uuid4())
        email = f"{lead['slug']}{DEMO_SUFFIX}"

        db.table("users").insert({
            "id": user_id,
            "email": email,
            "name": lead["name"],
            "role": "seller",
        }).execute()

        # Sort activity entries by 'at' ascending so the timeline reads
        # the same way the backend would have built it.
        activity_log = sorted(lead["activity"], key=lambda a: a["at"])

        db.table("leads").insert({
            "user_id": user_id,
            "name": lead["name"],
            "role": lead["role"],
            "intent": lead["intent"],
            "pipeline": lead["pipeline"],
            "status": lead["status"],
            "activity_log": activity_log,
            "created_at": iso(lead["created_at"]),
        }).execute()

    return len(leads)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Delete demo data and exit (don't re-seed)",
    )
    args = parser.parse_args()

    db = get_db()
    removed = clear_demo_data(db)
    print(f"removed {removed} demo user(s) (and their leads via cascade)")

    if args.clear:
        return

    inserted = seed_demo_data(db)
    print(f"inserted {inserted} demo lead(s) across the funnel")
    print()
    print("done. Open /admin/crm to see the populated Kanban.")


if __name__ == "__main__":
    main()
