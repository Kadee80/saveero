"""
tests/test_notifications.py

Unit tests for core.notifications — the engaged-lead webhook.

The webhook is fire-and-forget by design, so the contract under test is:
  1. No-op (no HTTP call) when the webhook URL isn't configured.
  2. Posts a well-formed payload when it is configured.
  3. Never raises into the caller — a receiver error is swallowed.
"""
from __future__ import annotations

import core.notifications as notifications
from core.notifications import notify_lead_engaged


_SAMPLE_LEAD = {
    "id": "lead-123",
    "name": "Jane Buyer",
    "email": "jane@example.com",
    "role": "first_time_buyer",
    "intent": "considering_move",
    "pipeline": "mortgage-broker",
    "status": "engaged",
}


class _FakeResponse:
    def __init__(self, status_code: int = 200) -> None:
        self.status_code = status_code


def test_noop_when_webhook_unconfigured(monkeypatch):
    """No URL set → no HTTP call at all."""
    monkeypatch.setattr(notifications.settings, "engaged_lead_webhook_url", None)
    called = False

    def _fail_post(*args, **kwargs):  # noqa: ANN002, ANN003
        nonlocal called
        called = True
        raise AssertionError("httpx.post must not be called when URL is unset")

    monkeypatch.setattr(notifications.httpx, "post", _fail_post)
    notify_lead_engaged(_SAMPLE_LEAD, trigger_kind="clicked_contact_mortgage_broker")
    assert called is False


def test_posts_well_formed_payload(monkeypatch):
    """Configured URL → one POST with the expected payload shape."""
    monkeypatch.setattr(
        notifications.settings,
        "engaged_lead_webhook_url",
        "https://hooks.zapier.com/hooks/catch/test/abc",
    )
    monkeypatch.setattr(notifications.settings, "app_base_url", "https://app.saveero.test")

    captured: dict = {}

    def _fake_post(url, json=None, timeout=None):  # noqa: ANN001
        captured["url"] = url
        captured["json"] = json
        captured["timeout"] = timeout
        return _FakeResponse(200)

    monkeypatch.setattr(notifications.httpx, "post", _fake_post)

    notify_lead_engaged(_SAMPLE_LEAD, trigger_kind="clicked_contact_mortgage_broker")

    assert captured["url"] == "https://hooks.zapier.com/hooks/catch/test/abc"
    payload = captured["json"]
    assert payload["event"] == "lead_engaged"
    assert payload["trigger_kind"] == "clicked_contact_mortgage_broker"
    assert payload["lead"]["id"] == "lead-123"
    assert payload["lead"]["email"] == "jane@example.com"
    assert payload["lead"]["pipeline"] == "mortgage-broker"
    assert payload["crm_link"] == "https://app.saveero.test/admin/crm"
    assert "occurred_at" in payload


def test_swallows_receiver_errors(monkeypatch):
    """A raising/erroring receiver must not propagate into the caller."""
    monkeypatch.setattr(
        notifications.settings,
        "engaged_lead_webhook_url",
        "https://hooks.zapier.com/hooks/catch/test/abc",
    )

    def _boom(*args, **kwargs):  # noqa: ANN002, ANN003
        raise RuntimeError("zapier is down")

    monkeypatch.setattr(notifications.httpx, "post", _boom)

    # Must not raise.
    notify_lead_engaged(_SAMPLE_LEAD, trigger_kind="clicked_contact_financial_planner")


def test_non_2xx_response_does_not_raise(monkeypatch):
    """A non-2xx status is logged, not raised."""
    monkeypatch.setattr(
        notifications.settings,
        "engaged_lead_webhook_url",
        "https://hooks.zapier.com/hooks/catch/test/abc",
    )
    monkeypatch.setattr(
        notifications.httpx, "post", lambda *a, **k: _FakeResponse(500)
    )
    # Must not raise.
    notify_lead_engaged(_SAMPLE_LEAD)
