"""Tests for channel_type webhook extension."""
from __future__ import annotations
from app.models.webhook import SUPPORTED_EVENTS, CHANNEL_TYPES


def test_new_events_in_supported_set():
    assert "hedge_run.completed" in SUPPORTED_EVENTS
    assert "journal_entry.posted" in SUPPORTED_EVENTS
    assert "erp_post.failed" in SUPPORTED_EVENTS


def test_channel_types_constant():
    assert "slack" in CHANNEL_TYPES
    assert "teams" in CHANNEL_TYPES
    assert "generic" in CHANNEL_TYPES


import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json


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
