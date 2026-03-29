"""Tests for webhook_service: HMAC signing, delivery, retry logic."""
from __future__ import annotations
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def test_generate_webhook_secret_is_64_hex_chars():
    """generate_webhook_secret must return 64 hex characters (32 bytes)."""
    from app.services.webhook_service import generate_webhook_secret
    secret = generate_webhook_secret()
    assert len(secret) == 64
    assert all(c in "0123456789abcdef" for c in secret)


def test_compute_signature_format():
    """compute_signature must return 'sha256=<hex>' format."""
    from app.services.webhook_service import compute_signature
    secret = "deadbeef" * 8
    payload_json = '{"event": "position.created"}'
    sig = compute_signature(secret, payload_json)
    assert sig.startswith("sha256=")
    assert len(sig) == len("sha256=") + 64  # sha256 hex is 64 chars


def test_compute_signature_is_deterministic():
    """Same secret + payload must always produce the same signature."""
    from app.services.webhook_service import compute_signature
    secret = "test-secret"
    payload = '{"event": "test"}'
    sig1 = compute_signature(secret, payload)
    sig2 = compute_signature(secret, payload)
    assert sig1 == sig2


def test_build_event_payload_structure():
    """build_event_payload must include event, timestamp, tenant_id, delivery_id, data."""
    from app.services.webhook_service import build_event_payload
    payload = build_event_payload(
        "position.created",
        "tenant-uuid-123",
        {"position_id": "pos-1"},
    )
    assert payload["event"] == "position.created"
    assert payload["tenant_id"] == "tenant-uuid-123"
    assert "timestamp" in payload
    assert "delivery_id" in payload
    assert payload["data"] == {"position_id": "pos-1"}


def test_retry_schedule_has_correct_delays():
    """RETRY_DELAYS_MINUTES must match spec: [1, 5, 15, 60]."""
    from app.models.webhook import RETRY_DELAYS_MINUTES, MAX_ATTEMPTS
    assert RETRY_DELAYS_MINUTES == [1, 5, 15, 60]
    assert MAX_ATTEMPTS == 5


@pytest.mark.asyncio
async def test_deliver_webhook_attempt_success():
    """deliver_webhook_attempt returns status=delivered for HTTP 200 response."""
    from app.services.webhook_service import deliver_webhook_attempt

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = "OK"

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_response)

    with patch("httpx.AsyncClient", return_value=mock_client):
        result = await deliver_webhook_attempt(
            url="https://example.com/webhook",
            secret="deadbeef" * 8,
            payload={"event": "position.created", "data": {}},
        )

    assert result["status"] == "delivered"
    assert result["response_status"] == 200


@pytest.mark.asyncio
async def test_deliver_webhook_connection_error_returns_failed():
    """Connection error returns status=failed, not raised."""
    import httpx
    from app.services.webhook_service import deliver_webhook_attempt

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=httpx.ConnectError("refused"))

    with patch("httpx.AsyncClient", return_value=mock_client):
        result = await deliver_webhook_attempt(
            url="https://example.com/webhook",
            secret="deadbeef" * 8,
            payload={"event": "position.created", "data": {}},
        )

    assert result["status"] == "failed"
    assert result["response_status"] is None
