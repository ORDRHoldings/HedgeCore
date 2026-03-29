"""Tests for WebhookEndpoint and WebhookDeliveryLog models."""
from __future__ import annotations
import uuid
import pytest


def test_webhook_endpoint_importable():
    """WebhookEndpoint model must be importable with correct columns."""
    from app.models.webhook import WebhookEndpoint
    ep = WebhookEndpoint(
        company_id=uuid.uuid4(),
        url="https://example.com/hook",
        secret="deadbeef" * 8,
    )
    assert ep.url == "https://example.com/hook"
    assert ep.is_active is True  # default


def test_webhook_delivery_log_importable():
    """WebhookDeliveryLog model must be importable with correct columns."""
    from app.models.webhook import WebhookDeliveryLog
    log = WebhookDeliveryLog(
        endpoint_id=uuid.uuid4(),
        event_type="position.created",
        payload_json={"event": "position.created"},
        attempt=1,
        status="delivered",
    )
    assert log.event_type == "position.created"
    assert log.attempt == 1


def test_webhook_constants():
    """Module must export required constants."""
    from app.models.webhook import (
        MAX_WEBHOOKS_PER_TENANT,
        SUPPORTED_EVENTS,
        RETRY_DELAYS_MINUTES,
        MAX_ATTEMPTS,
        DELIVERY_LOG_WINDOW,
    )
    assert MAX_WEBHOOKS_PER_TENANT == 5
    assert "position.created" in SUPPORTED_EVENTS
    assert "calculation.completed" in SUPPORTED_EVENTS
    assert "proposal.approved" in SUPPORTED_EVENTS
    assert "proposal.rejected" in SUPPORTED_EVENTS
    assert len(RETRY_DELAYS_MINUTES) == MAX_ATTEMPTS - 1  # delays between attempts
    assert DELIVERY_LOG_WINDOW == 100


def test_webhook_endpoint_subscribes_to():
    """subscribes_to() must return True if event in events list or events is empty."""
    from app.models.webhook import WebhookEndpoint
    # Empty events = subscribe to all
    ep_all = WebhookEndpoint(company_id=uuid.uuid4(), url="https://x.com", secret="s")
    ep_all.events = ""
    assert ep_all.subscribes_to("position.created") is True

    # Specific subscription
    ep_specific = WebhookEndpoint(company_id=uuid.uuid4(), url="https://x.com", secret="s")
    ep_specific.events = "position.created,calculation.completed"
    assert ep_specific.subscribes_to("position.created") is True
    assert ep_specific.subscribes_to("proposal.approved") is False


def test_webhook_endpoint_get_events():
    """get_events() must return sorted list of subscribed event names."""
    from app.models.webhook import WebhookEndpoint
    ep = WebhookEndpoint(company_id=uuid.uuid4(), url="https://x.com", secret="s")
    ep.events = "proposal.approved,position.created"
    result = ep.get_events()
    assert result == ["position.created", "proposal.approved"]

    ep_all = WebhookEndpoint(company_id=uuid.uuid4(), url="https://x.com", secret="s")
    ep_all.events = ""
    # Empty events = all supported events
    from app.models.webhook import SUPPORTED_EVENTS
    assert set(ep_all.get_events()) == SUPPORTED_EVENTS


def test_migration_file_exists():
    """Alembic migration for webhooks table must exist."""
    import os
    versions_dir = os.path.join(
        os.path.dirname(__file__), "..", "migrations", "versions"
    )
    files = os.listdir(versions_dir)
    webhook_migrations = [f for f in files if "webhook" in f.lower()]
    assert len(webhook_migrations) >= 1, f"No webhook migration found in {versions_dir}"
