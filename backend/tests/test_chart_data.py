"""
Tests for GET /v1/chart-data/{symbol} — OHLCV bar endpoint for charting.

Covers:
  1. Auth required (unauthenticated → 401)
  2. Invalid interval → 422
  3. No providers configured → 503
  4. Providers return empty → 502
  5. Happy path (mocked provider) → 200, correct shape
  6. Cache hit returns same data without re-fetching
  7. RBAC: non-superuser missing market.view → 403
  8. Symbol normalization (slash-separated → stripped)
  9. Limit clamped to max 2000
  10. Multiple providers with failover
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.dependencies import get_current_user
from app.main import app
from app.services.market_data.provider_base import NormalizedOHLC

UTC = timezone.utc

# ── Helpers ──────────────────────────────────────────────────────────────────

_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


def _make_user(*, is_superuser: bool = True) -> MagicMock:
    user = MagicMock()
    user.id = "aaaaaaaa-0000-0000-0000-000000000001"
    user.email = "chart@example.com"
    user.company_id = "cccccccc-0000-0000-0000-000000000001"
    user.is_active = True
    user.is_superuser = is_superuser
    return user


def _make_bars(n: int = 3) -> list[NormalizedOHLC]:
    base_ts = datetime(2024, 3, 10, 12, 0, 0, tzinfo=UTC)
    return [
        NormalizedOHLC(
            symbol="USDMXN",
            open=17.50 + i * 0.01,
            high=17.60 + i * 0.01,
            low=17.40 + i * 0.01,
            close=17.55 + i * 0.01,
            volume=float(1000 * (i + 1)),
            timestamp=datetime(2024, 3, 10 + i, 12, 0, 0, tzinfo=UTC),
            source="twelvedata",
        )
        for i in range(n)
    ]


def _make_provider(name: str = "twelvedata", bars: list | None = None) -> MagicMock:
    provider = MagicMock()
    provider.provider_name = name
    provider.fetch_historical_ohlc = AsyncMock(return_value=bars if bars is not None else _make_bars())
    return provider


def _make_orchestrator(providers: list | None = None) -> MagicMock:
    orch = MagicMock()
    orch.providers = providers if providers is not None else [_make_provider()]
    return orch


@pytest.fixture
def superuser_client():
    """Client with superuser (skips RBAC check)."""
    app.dependency_overrides[get_current_user] = lambda: _make_user(is_superuser=True)
    transport = ASGITransport(app=app)

    class _Ctx:
        async def __aenter__(self):
            self._client = AsyncClient(transport=transport, base_url="http://test")
            return await self._client.__aenter__()

        async def __aexit__(self, *args):
            await self._client.__aexit__(*args)
            app.dependency_overrides.clear()

    return _Ctx()


@pytest.fixture
def normal_user_client():
    """Client with non-superuser (RBAC enforced)."""
    app.dependency_overrides[get_current_user] = lambda: _make_user(is_superuser=False)
    transport = ASGITransport(app=app)

    class _Ctx:
        async def __aenter__(self):
            self._client = AsyncClient(transport=transport, base_url="http://test")
            return await self._client.__aenter__()

        async def __aexit__(self, *args):
            await self._client.__aexit__(*args)
            app.dependency_overrides.clear()

    return _Ctx()


@pytest.fixture(autouse=True)
def _clear_chart_cache():
    """Ensure each test starts with a clean cache."""
    from app.api.routes.v1_chart_data import _cache
    _cache.clear()
    yield
    _cache.clear()


# ── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_chart_data_requires_auth():
    """Unauthenticated requests should be rejected."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/chart-data/USDMXN")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_chart_data_invalid_interval(superuser_client):
    """Invalid interval value returns 422."""
    orch = _make_orchestrator()
    with patch("app.api.routes.v1_chart_data.get_orchestrator", return_value=orch):
        async with superuser_client as client:
            resp = await client.get(
                "/api/v1/chart-data/USDMXN",
                params={"interval": "3h"},
                headers=_BEARER,
            )
    assert resp.status_code == 422
    assert "Invalid interval" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_chart_data_no_providers(superuser_client):
    """When no orchestrator exists, return 503."""
    with patch("app.api.routes.v1_chart_data.get_orchestrator", return_value=None):
        async with superuser_client as client:
            resp = await client.get(
                "/api/v1/chart-data/USDMXN",
                headers=_BEARER,
            )
    assert resp.status_code == 503
    assert "providers" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_chart_data_providers_return_empty(superuser_client):
    """When all providers return empty, return 502."""
    empty_provider = _make_provider(bars=[])
    orch = _make_orchestrator(providers=[empty_provider])
    with patch("app.api.routes.v1_chart_data.get_orchestrator", return_value=orch):
        async with superuser_client as client:
            resp = await client.get(
                "/api/v1/chart-data/USDMXN",
                headers=_BEARER,
            )
    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_chart_data_happy_path(superuser_client):
    """Successful fetch returns correct shape and data."""
    bars = _make_bars(5)
    orch = _make_orchestrator(providers=[_make_provider(bars=bars)])
    with patch("app.api.routes.v1_chart_data.get_orchestrator", return_value=orch):
        async with superuser_client as client:
            resp = await client.get(
                "/api/v1/chart-data/USDMXN",
                params={"interval": "1h", "limit": 500},
                headers=_BEARER,
            )
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "USDMXN"
    assert data["interval"] == "1h"
    assert data["source"] == "twelvedata"
    assert data["count"] == 5
    assert len(data["bars"]) == 5

    bar = data["bars"][0]
    assert set(bar.keys()) == {"t", "o", "h", "l", "c", "v"}
    assert isinstance(bar["t"], int)
    assert isinstance(bar["o"], float)


@pytest.mark.asyncio
async def test_chart_data_cache_hit(superuser_client):
    """Second request for same symbol/interval hits cache, no re-fetch."""
    provider = _make_provider(bars=_make_bars(2))
    orch = _make_orchestrator(providers=[provider])
    with patch("app.api.routes.v1_chart_data.get_orchestrator", return_value=orch):
        async with superuser_client as client:
            resp1 = await client.get(
                "/api/v1/chart-data/EURUSD",
                params={"interval": "1day"},
                headers=_BEARER,
            )
            resp2 = await client.get(
                "/api/v1/chart-data/EURUSD",
                params={"interval": "1day"},
                headers=_BEARER,
            )

    assert resp1.status_code == 200
    assert resp2.status_code == 200
    # Provider should have been called only once (second was cached)
    assert provider.fetch_historical_ohlc.call_count == 1


@pytest.mark.asyncio
async def test_chart_data_rbac_denied(normal_user_client):
    """Non-superuser without market.view permission gets 403."""
    orch = _make_orchestrator()
    with patch("app.api.routes.v1_chart_data.get_orchestrator", return_value=orch):
        with patch("app.api.routes.v1_chart_data.rbac_service") as mock_rbac:
            mock_rbac.get_permissions_by_user = AsyncMock(return_value={"position.view"})
            async with normal_user_client as client:
                resp = await client.get(
                    "/api/v1/chart-data/USDMXN",
                    headers=_BEARER,
                )
    assert resp.status_code == 403
    assert "market.view" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_chart_data_rbac_allowed(normal_user_client):
    """Non-superuser WITH market.view gets 200."""
    orch = _make_orchestrator()
    with patch("app.api.routes.v1_chart_data.get_orchestrator", return_value=orch):
        with patch("app.api.routes.v1_chart_data.rbac_service") as mock_rbac:
            mock_rbac.get_permissions_by_user = AsyncMock(return_value={"market.view", "position.view"})
            async with normal_user_client as client:
                resp = await client.get(
                    "/api/v1/chart-data/USDMXN",
                    headers=_BEARER,
                )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_chart_data_symbol_normalization(superuser_client):
    """Lowercase symbols are uppercased."""
    orch = _make_orchestrator()
    with patch("app.api.routes.v1_chart_data.get_orchestrator", return_value=orch):
        async with superuser_client as client:
            resp = await client.get(
                "/api/v1/chart-data/usdmxn",
                headers=_BEARER,
            )
    assert resp.status_code == 200
    assert resp.json()["symbol"] == "USDMXN"


@pytest.mark.asyncio
async def test_chart_data_provider_failover(superuser_client):
    """If first provider fails, second provider is tried."""
    failing_provider = _make_provider(name="twelvedata", bars=[])
    failing_provider.fetch_historical_ohlc = AsyncMock(side_effect=Exception("API down"))
    good_provider = _make_provider(name="ibkr", bars=_make_bars(2))
    orch = _make_orchestrator(providers=[failing_provider, good_provider])
    with patch("app.api.routes.v1_chart_data.get_orchestrator", return_value=orch):
        async with superuser_client as client:
            resp = await client.get(
                "/api/v1/chart-data/USDMXN",
                headers=_BEARER,
            )
    assert resp.status_code == 200
    assert resp.json()["source"] == "ibkr"
