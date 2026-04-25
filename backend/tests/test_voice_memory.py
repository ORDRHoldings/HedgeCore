"""
Tests for GET /v1/voice/memory/recent — recall recent voice sessions.

The endpoint queries audit_events via SQLAlchemy. We mock the AsyncSession at
the app boundary and feed it a constructed event stream (DESC order) so the
grouping/folding logic is exercised independently of any real DB.
"""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.db import get_session
from app.core.dependencies import get_current_user
from app.main import app


# ── Fixtures ─────────────────────────────────────────────────────────────────

def _make_user():
    user = MagicMock()
    user.id = "aaaaaaaa-0000-0000-0000-000000000001"
    user.email = "test@example.com"
    user.company_id = "cccccccc-0000-0000-0000-000000000001"
    user.is_active = True
    user.is_superuser = False
    return user


_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


def _evt(event_type: str, session_id: str, payload: dict, ts: datetime):
    """Build a minimal AuditEvent-like object for the mocked query result."""
    return SimpleNamespace(
        event_type=event_type,
        entity_id=session_id,
        payload=payload,
        created_at=ts,
    )


def _build_events_for_two_sessions():
    """
    Return events in DESC order — the order the SQL query would actually yield.
    Two sessions, the most recent ("sess-2") fully wraps the older one ("sess-1").
    """
    base = datetime(2026, 4, 25, 12, 0, tzinfo=UTC)

    # sess-2 — most recent. Has start, two turns (user + assistant), one tool call, end.
    s2_start = base + timedelta(minutes=10)
    s2_user = s2_start + timedelta(seconds=5)
    s2_asst = s2_user + timedelta(seconds=10)
    s2_tool = s2_asst + timedelta(seconds=2)
    s2_end = s2_tool + timedelta(seconds=20)

    # sess-1 — older.
    s1_start = base
    s1_user = s1_start + timedelta(seconds=3)
    s1_asst = s1_user + timedelta(seconds=8)
    s1_end = s1_asst + timedelta(seconds=15)

    # DESC order:
    return [
        _evt("VOICE_SESSION_END", "sess-2", {"at": s2_end.isoformat()}, s2_end),
        _evt(
            "VOICE_TOOL_CALL",
            "sess-2",
            {"tool": "get_spot_rate", "status": "ok"},
            s2_tool,
        ),
        _evt(
            "VOICE_TURN",
            "sess-2",
            {"role": "assistant", "text": "USDMXN mid is 17.24."},
            s2_asst,
        ),
        _evt(
            "VOICE_TURN",
            "sess-2",
            {"role": "user", "text": "What's the spot on USDMXN?"},
            s2_user,
        ),
        _evt(
            "VOICE_SESSION_START",
            "sess-2",
            {"at": s2_start.isoformat()},
            s2_start,
        ),
        _evt("VOICE_SESSION_END", "sess-1", {"at": s1_end.isoformat()}, s1_end),
        _evt(
            "VOICE_TURN",
            "sess-1",
            {"role": "assistant", "text": "Yes, EURUSD is at 1.0823."},
            s1_asst,
        ),
        _evt(
            "VOICE_TURN",
            "sess-1",
            {"role": "user", "text": "Tell me about EURUSD."},
            s1_user,
        ),
        _evt(
            "VOICE_SESSION_START",
            "sess-1",
            {"at": s1_start.isoformat()},
            s1_start,
        ),
    ]


def _mock_session_returning(events: list):
    """An AsyncSession that returns `events` from any execute() call."""
    scalars_obj = MagicMock()
    scalars_obj.all.return_value = events
    result_obj = MagicMock()
    result_obj.scalars.return_value = scalars_obj

    session = MagicMock()
    session.execute = AsyncMock(return_value=result_obj)

    async def _yield():
        yield session

    return session, _yield


@pytest.fixture
def authed_client_with_events():
    """
    Builds an authed client with both get_current_user and get_session overridden.
    Events are injected via the parametrized factory in each test.
    """

    def _builder(events: list):
        app.dependency_overrides[get_current_user] = lambda: _make_user()
        _, gen = _mock_session_returning(events)
        app.dependency_overrides[get_session] = gen

        transport = ASGITransport(app=app)

        class _Ctx:
            async def __aenter__(self):
                self._client = AsyncClient(transport=transport, base_url="http://test")
                return await self._client.__aenter__()

            async def __aexit__(self, *args):
                await self._client.__aexit__(*args)
                app.dependency_overrides.clear()

        return _Ctx()

    return _builder


# ── Tests ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_memory_recent_requires_auth(client: AsyncClient):
    resp = await client.get("/api/v1/voice/memory/recent")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_memory_recent_groups_by_session(authed_client_with_events):
    """Two-session stream → two ordered summaries with correct last turns."""
    events = _build_events_for_two_sessions()
    async with authed_client_with_events(events) as client:
        resp = await client.get("/api/v1/voice/memory/recent", headers=_BEARER)

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["count"] == 2
    sids = [s["session_id"] for s in data["sessions"]]
    assert sids == ["sess-2", "sess-1"]  # newest first

    s2 = data["sessions"][0]
    assert s2["last_user_turn"] == "What's the spot on USDMXN?"
    assert s2["last_assistant_turn"] == "USDMXN mid is 17.24."
    assert s2["tool_calls_count"] == 1
    assert s2["turn_count"] == 2

    s1 = data["sessions"][1]
    assert s1["last_user_turn"] == "Tell me about EURUSD."
    assert s1["last_assistant_turn"] == "Yes, EURUSD is at 1.0823."
    assert s1["tool_calls_count"] == 0
    assert s1["turn_count"] == 2


@pytest.mark.asyncio
async def test_memory_recent_respects_limit(authed_client_with_events):
    """limit=1 stops at the most recent session."""
    events = _build_events_for_two_sessions()
    async with authed_client_with_events(events) as client:
        resp = await client.get(
            "/api/v1/voice/memory/recent?limit=1", headers=_BEARER
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 1
    assert data["sessions"][0]["session_id"] == "sess-2"


@pytest.mark.asyncio
async def test_memory_recent_empty_history_returns_empty_list(authed_client_with_events):
    async with authed_client_with_events([]) as client:
        resp = await client.get("/api/v1/voice/memory/recent", headers=_BEARER)

    assert resp.status_code == 200
    assert resp.json() == {"count": 0, "sessions": []}


@pytest.mark.asyncio
async def test_memory_recent_rejects_out_of_range_limit(authed_client_with_events):
    """limit must be in [1, 5]."""
    async with authed_client_with_events([]) as client:
        resp_high = await client.get(
            "/api/v1/voice/memory/recent?limit=99", headers=_BEARER
        )
        resp_low = await client.get(
            "/api/v1/voice/memory/recent?limit=0", headers=_BEARER
        )

    assert resp_high.status_code == 422
    assert resp_low.status_code == 422


@pytest.mark.asyncio
async def test_memory_recent_keeps_first_role_match_per_session(authed_client_with_events):
    """
    DESC iteration → the FIRST user turn we see is the LATEST one.
    Earlier user turns in the same session must NOT overwrite it.
    """
    base = datetime(2026, 4, 25, 12, 0, tzinfo=UTC)
    events = [
        # newest first
        _evt(
            "VOICE_TURN",
            "sess-x",
            {"role": "user", "text": "LATEST user turn"},
            base + timedelta(minutes=3),
        ),
        _evt(
            "VOICE_TURN",
            "sess-x",
            {"role": "user", "text": "EARLIER user turn"},
            base + timedelta(minutes=1),
        ),
        _evt(
            "VOICE_SESSION_START",
            "sess-x",
            {"at": base.isoformat()},
            base,
        ),
    ]
    async with authed_client_with_events(events) as client:
        resp = await client.get("/api/v1/voice/memory/recent", headers=_BEARER)

    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 1
    assert data["sessions"][0]["last_user_turn"] == "LATEST user turn"
    assert data["sessions"][0]["turn_count"] == 2


@pytest.mark.asyncio
async def test_memory_recent_ignores_events_without_session_id(authed_client_with_events):
    base = datetime(2026, 4, 25, 12, 0, tzinfo=UTC)
    events = [
        _evt("VOICE_TURN", None, {"role": "user", "text": "orphan"}, base),
        _evt(
            "VOICE_TURN",
            "sess-real",
            {"role": "user", "text": "real one"},
            base - timedelta(seconds=1),
        ),
    ]
    async with authed_client_with_events(events) as client:
        resp = await client.get("/api/v1/voice/memory/recent", headers=_BEARER)

    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 1
    assert data["sessions"][0]["session_id"] == "sess-real"
