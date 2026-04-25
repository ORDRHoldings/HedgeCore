"""
Tests for POST /v1/voice/transcript -- WORM-log voice-session events.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.dependencies import get_current_user
from app.main import app


def _make_user():
    user = MagicMock()
    user.id = "aaaaaaaa-0000-0000-0000-000000000001"
    user.email = "test@example.com"
    user.company_id = "cccccccc-0000-0000-0000-000000000001"
    user.branch_id = None
    user.is_active = True
    user.is_superuser = False
    return user


_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


@pytest.fixture
def authed_client():
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    transport = ASGITransport(app=app)

    class _Ctx:
        async def __aenter__(self):
            self._client = AsyncClient(transport=transport, base_url="http://test")
            return await self._client.__aenter__()

        async def __aexit__(self, *args):
            await self._client.__aexit__(*args)
            app.dependency_overrides.clear()

    return _Ctx()


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


# ── Tests ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_voice_transcript_requires_auth(client: AsyncClient):
    resp = await client.post("/api/v1/voice/transcript", json={})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_voice_transcript_logs_session_start_turns_tool_calls_end(authed_client):
    body = {
        "session_id": "sess-unittest-000001",
        "transport": "openai-realtime",
        "model": "gpt-realtime",
        "session_start": _now_iso(),
        "session_end": _now_iso(),
        "turns": [
            {"role": "user",      "text": "What's the USDMXN rate?",                          "at": _now_iso()},
            {"role": "assistant", "text": "The USDMXN mid is 17.2400 as of 21:24 UTC today.", "at": _now_iso()},
        ],
        "tool_calls": [
            {
                "name": "get_spot_rate",
                "arguments": {"pair": "USDMXN"},
                "result_summary": "mid=17.24 bid=17.23 ask=17.25",
                "status": "ok",
                "at": _now_iso(),
            },
        ],
    }

    with patch("app.api.routes.v1_voice_transcript.emit_audit", new_callable=AsyncMock) as mock_emit:
        async with authed_client as client:
            resp = await client.post("/api/v1/voice/transcript", headers=_BEARER, json=body)

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["session_id"] == "sess-unittest-000001"
    # 1 session_start + 2 turns + 1 tool_call + 1 session_end = 5
    assert data["events_logged"] == 5
    assert mock_emit.await_count == 5

    event_types_emitted = [kwargs["event_type"] for _, kwargs in mock_emit.await_args_list]
    assert event_types_emitted == [
        "VOICE_SESSION_START",
        "VOICE_TURN",
        "VOICE_TURN",
        "VOICE_TOOL_CALL",
        "VOICE_SESSION_END",
    ]


@pytest.mark.asyncio
async def test_voice_transcript_empty_batch_is_200(authed_client):
    """An empty batch (no session markers, no turns) is valid and logs nothing."""
    body = {
        "session_id": "sess-empty-0001",
        "transport": "claude-websocket",
        "model": "claude-3-5-sonnet-20241022",
    }

    with patch("app.api.routes.v1_voice_transcript.emit_audit", new_callable=AsyncMock) as mock_emit:
        async with authed_client as client:
            resp = await client.post("/api/v1/voice/transcript", headers=_BEARER, json=body)

    assert resp.status_code == 200
    assert resp.json()["events_logged"] == 0
    assert mock_emit.await_count == 0


@pytest.mark.asyncio
async def test_voice_transcript_rejects_oversized_turn_batch(authed_client):
    body = {
        "session_id": "sess-oversized-001",
        "transport": "openai-realtime",
        "model": "gpt-realtime",
        "turns": [
            {"role": "user", "text": "x", "at": _now_iso()}
            for _ in range(201)  # _MAX_TURNS_PER_BATCH = 200
        ],
    }

    async with authed_client as client:
        resp = await client.post("/api/v1/voice/transcript", headers=_BEARER, json=body)

    assert resp.status_code == 413
    assert "too many turns" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_voice_transcript_rejects_invalid_role(authed_client):
    body = {
        "session_id": "sess-badrole-001",
        "transport": "openai-realtime",
        "model": "gpt-realtime",
        "turns": [
            {"role": "system", "text": "nope", "at": _now_iso()},  # only user|assistant allowed
        ],
    }

    async with authed_client as client:
        resp = await client.post("/api/v1/voice/transcript", headers=_BEARER, json=body)

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_voice_transcript_disclosure_ack_emits_event(authed_client):
    """disclosure_ack=True emits a VOICE_AI_DISCLOSURE_ACK audit event."""
    body = {
        "session_id": "sess-disclose-001",
        "transport": "openai-realtime",
        "model": "gpt-realtime",
        "disclosure_ack": True,
        "disclosure_text": "ORDR Voice is an AI assistant. Sessions are recorded.",
    }

    with patch("app.api.routes.v1_voice_transcript.emit_audit", new_callable=AsyncMock) as mock_emit:
        async with authed_client as client:
            resp = await client.post("/api/v1/voice/transcript", headers=_BEARER, json=body)

    assert resp.status_code == 200
    assert resp.json()["events_logged"] == 1
    assert mock_emit.await_count == 1
    kwargs = mock_emit.await_args_list[0].kwargs
    assert kwargs["event_type"] == "VOICE_AI_DISCLOSURE_ACK"
    assert kwargs["payload"]["disclosure_text"].startswith("ORDR Voice is an AI")


@pytest.mark.asyncio
async def test_voice_transcript_disclosure_ack_false_no_event(authed_client):
    body = {
        "session_id": "sess-no-disclose-1",
        "transport": "openai-realtime",
        "model": "gpt-realtime",
        "disclosure_ack": False,
    }
    with patch("app.api.routes.v1_voice_transcript.emit_audit", new_callable=AsyncMock) as mock_emit:
        async with authed_client as client:
            resp = await client.post("/api/v1/voice/transcript", headers=_BEARER, json=body)
    assert resp.status_code == 200
    assert resp.json()["events_logged"] == 0
    assert mock_emit.await_count == 0


@pytest.mark.asyncio
async def test_voice_transcript_truncates_oversized_tool_arguments(authed_client):
    """Tool arguments larger than _MAX_TOOL_ARG_BYTES should land in payload as truncated."""
    huge_blob = "A" * 4096  # 4KB
    body = {
        "session_id": "sess-big-args-001",
        "transport": "claude-websocket",
        "model": "claude-3-5-sonnet-20241022",
        "tool_calls": [
            {
                "name": "calculate_hedge",
                "arguments": {"note": huge_blob},
                "result_summary": "contracts=12 cost=42000 coverage=98%",
                "status": "ok",
                "at": _now_iso(),
            },
        ],
    }

    with patch("app.api.routes.v1_voice_transcript.emit_audit", new_callable=AsyncMock) as mock_emit:
        async with authed_client as client:
            resp = await client.post("/api/v1/voice/transcript", headers=_BEARER, json=body)

    assert resp.status_code == 200
    assert mock_emit.await_count == 1
    emitted_payload = mock_emit.await_args_list[0].kwargs["payload"]
    assert emitted_payload["arguments"]["_truncated"] is True
    assert emitted_payload["arguments"]["_size"] > 2048
