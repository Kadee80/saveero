"""
core/notifications.py

Outbound CRM notifications. Currently one event: a lead entering the
'engaged' status (they clicked a Contact-a-partner button — the partner
team needs to react fast).

Delivery is a single generic webhook POST to `settings.engaged_lead_webhook_url`.
That URL points at a Zapier "Catch Hook" (or any webhook receiver). Routing
the payload to Slack / email / SMS / a sheet is configured on the Zapier
side, so the channel can change without a code deploy — and the codebase
takes on no Slack/email SDK dependency.

Design rules:
- **Fire-and-forget.** A notification failure must never break the user
  action that triggered it. Every failure is swallowed and logged.
- **No-op when unconfigured.** If the webhook URL isn't set, this module
  does nothing — safe in dev / tests / any env without Zapier wired up.
- **Run off the request path.** Callers should invoke this via FastAPI's
  BackgroundTasks so the HTTP round-trip adds zero latency to the user's
  request.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

# Short ceiling — Zapier catch-hooks ack in well under a second. This
# only bounds the worst case if the receiver is down; since the call
# runs as a background task it never blocks the user either way.
_WEBHOOK_TIMEOUT_SECONDS = 5.0


def _lead_crm_link(lead_id: str) -> str:
    """Best-effort deep link to the lead in the admin CRM."""
    base = (settings.app_base_url or "").rstrip("/")
    # The CRM is a single board (no per-lead route yet) — link to the
    # board; the recipient can find the lead via the filter/table view.
    return f"{base}/admin/crm" if base else "/admin/crm"


def notify_lead_engaged(lead: dict, trigger_kind: Optional[str] = None) -> None:
    """
    Fire the 'lead engaged' webhook for `lead`.

    `lead` is the row dict as stored in `public.leads` (plus an optional
    embedded `email`). `trigger_kind` is the activity slug that caused
    the transition (e.g. 'clicked_contact_mortgage_broker') — handy for
    the Zap to branch on.

    Safe to call unconditionally: if the webhook URL isn't configured,
    this returns immediately. All errors are swallowed — this must never
    raise into the caller.
    """
    url = settings.engaged_lead_webhook_url
    if not url:
        return

    try:
        payload: dict[str, Any] = {
            "event": "lead_engaged",
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "lead": {
                "id": lead.get("id"),
                "name": lead.get("name"),
                "email": lead.get("email"),
                "role": lead.get("role"),
                "intent": lead.get("intent"),
                "pipeline": lead.get("pipeline"),
                "status": lead.get("status"),
            },
            "trigger_kind": trigger_kind,
            "crm_link": _lead_crm_link(str(lead.get("id", ""))),
        }
        resp = httpx.post(url, json=payload, timeout=_WEBHOOK_TIMEOUT_SECONDS)
        # Zapier returns 200 with {"status": "success"}; treat any 2xx as
        # delivered. Non-2xx is logged but not raised.
        if resp.status_code >= 300:
            logger.warning(
                "engaged-lead webhook returned %s for lead %s",
                resp.status_code,
                lead.get("id"),
            )
    except Exception:  # noqa: BLE001 — fire-and-forget by design
        logger.exception(
            "engaged-lead webhook failed for lead %s", lead.get("id")
        )
