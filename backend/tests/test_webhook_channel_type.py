"""Tests for channel_type webhook extension."""
from __future__ import annotations
import json
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.webhook import SUPPORTED_EVENTS, CHANNEL_TYPES


def test_new_events_in_supported_set():
    assert "hedge_run.completed" in SUPPORTED_EVENTS
    assert "journal_entry.posted" in SUPPORTED_EVENTS
    assert "erp_post.failed" in SUPPORTED_EVENTS


def test_channel_types_constant():
    assert "slack" in CHANNEL_TYPES
    assert "teams" in CHANNEL_TYPES
    assert "generic" in CHANNEL_TYPES


@pytest.mark.asyncio
async def test_delivery_generic_includes_ordr_signature_header():
    """Generic channel delivery includes X-ORDR-Signature header."""
    from app.services.webhook_service import deliver_webhook_attempt

    captured_headers = {}

    async def mock_post(url, *, content, headers, **kwargs):
        captured_headers.update(headers)
        resp = MagicMock()
        resp.status_code = 200
        resp.text = "ok"
        return resp

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("app.services.webhook_service.httpx.AsyncClient", return_value=mock_client):
        result = await deliver_webhook_attempt(
            url="https://example.com/hook",
            secret="test-secret",
            payload={"event": "test"},
            channel_type="generic",
        )

    assert "X-ORDR-Signature" in captured_headers
    assert result["status"] == "delivered"


@pytest.mark.asyncio
async def test_delivery_slack_omits_ordr_signature_header():
    """Slack channel delivery omits X-ORDR-Signature header."""
    from app.services.webhook_service import deliver_webhook_attempt

    captured_headers = {}

    async def mock_post(url, *, content, headers, **kwargs):
        captured_headers.update(headers)
        resp = MagicMock()
        resp.status_code = 200
        resp.text = "ok"
        return resp

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("app.services.webhook_service.httpx.AsyncClient", return_value=mock_client):
        result = await deliver_webhook_attempt(
            url="https://hooks.slack.com/T123/B456/abc",
            secret="test-secret",
            payload={"blocks": []},
            channel_type="slack",
        )

    assert "X-ORDR-Signature" not in captured_headers
    assert result["status"] == "delivered"


@pytest.mark.asyncio
async def test_delivery_slack_sends_blocks_not_envelope():
    """Slack delivery sends Block Kit dict, not build_event_payload envelope."""
    from app.services.webhook_service import deliver_webhook_attempt

    captured_body = {}

    async def mock_post(url, *, content, headers, **kwargs):
        captured_body.update(json.loads(content))
        resp = MagicMock()
        resp.status_code = 200
        resp.text = "ok"
        return resp

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    slack_payload = {"blocks": [{"type": "header", "text": {"type": "plain_text", "text": "Test"}}]}

    with patch("app.services.webhook_service.httpx.AsyncClient", return_value=mock_client):
        await deliver_webhook_attempt(
            url="https://hooks.slack.com/T123/B456/abc",
            secret="secret",
            payload=slack_payload,
            channel_type="slack",
        )

    assert "blocks" in captured_body
    assert "event" not in captured_body  # no generic envelope wrapper


@pytest.mark.asyncio
async def test_dispatch_to_company_calls_dispatch_for_matching_endpoint():
    """dispatch_to_company calls dispatch_webhook_event for matching active endpoints."""
    from app.services.webhook_service import dispatch_to_company
    from app.models.webhook import WebhookEndpoint

    company_id = uuid.uuid4()
    mock_ep = MagicMock(spec=WebhookEndpoint)
    mock_ep.id = uuid.uuid4()
    mock_ep.company_id = company_id
    mock_ep.is_active = True
    mock_ep.subscribes_to = MagicMock(return_value=True)

    mock_db = AsyncMock()
    mock_db.__aenter__ = AsyncMock(return_value=mock_db)
    mock_db.__aexit__ = AsyncMock(return_value=False)
    mock_db.execute = AsyncMock(
        return_value=MagicMock(
            scalars=MagicMock(
                return_value=MagicMock(all=MagicMock(return_value=[mock_ep]))
            )
        )
    )

    def session_factory():
        return mock_db

    with patch("app.services.webhook_service.dispatch_webhook_event") as mock_dispatch:
        mock_dispatch.return_value = None
        await dispatch_to_company(session_factory, company_id, "hedge_run.completed", {"run_id": "x"})

    mock_dispatch.assert_called_once()
    call_args = mock_dispatch.call_args
    assert call_args.args[2] == "hedge_run.completed"


@pytest.mark.asyncio
async def test_dispatch_to_company_skips_non_matching_endpoint():
    """dispatch_to_company skips endpoints that don't subscribe to the event."""
    from app.services.webhook_service import dispatch_to_company
    from app.models.webhook import WebhookEndpoint

    company_id = uuid.uuid4()
    mock_ep = MagicMock(spec=WebhookEndpoint)
    mock_ep.id = uuid.uuid4()
    mock_ep.subscribes_to = MagicMock(return_value=False)  # does NOT subscribe

    mock_db = AsyncMock()
    mock_db.__aenter__ = AsyncMock(return_value=mock_db)
    mock_db.__aexit__ = AsyncMock(return_value=False)
    mock_db.execute = AsyncMock(
        return_value=MagicMock(
            scalars=MagicMock(
                return_value=MagicMock(all=MagicMock(return_value=[mock_ep]))
            )
        )
    )

    def session_factory():
        return mock_db

    with patch("app.services.webhook_service.dispatch_webhook_event") as mock_dispatch:
        await dispatch_to_company(session_factory, company_id, "hedge_run.completed", {})

    mock_dispatch.assert_not_called()


@pytest.mark.asyncio
async def test_register_slack_channel_type_stored():
    """POST /v1/webhooks with channel_type=slack stores the value."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    mock_user = MagicMock()
    mock_user.is_superuser = True
    mock_user.company_id = uuid.UUID("11111111-1111-1111-1111-111111111111")

    async def mock_get_user():
        return mock_user

    from app.core.dependencies import get_current_user
    from app.core.db import get_session

    async def mock_session():
        session = AsyncMock()
        session.execute = AsyncMock(return_value=MagicMock(scalar=MagicMock(return_value=0)))
        session.add = MagicMock()
        session.commit = AsyncMock()
        session.refresh = AsyncMock()
        yield session

    app.dependency_overrides[get_current_user] = mock_get_user
    app.dependency_overrides[get_session] = mock_session

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/webhooks",
                json={
                    "url": "https://hooks.slack.com/services/T123/B456/abc",
                    "events": ["hedge_run.completed"],
                    "channel_type": "slack",
                },
            )
        assert resp.status_code == 201
        assert resp.json()["channel_type"] == "slack"
    finally:
        app.dependency_overrides.clear()
