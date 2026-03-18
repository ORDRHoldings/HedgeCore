"""Tests for v1_market_data_live routes (/v1/market-data/live).

Covers:
  - GET /fx-rates (disabled, success, custom pairs, cache, fetch error)
  - GET /equity-quotes (disabled, success, change calc)
  - GET /macro (disabled, success, partial failure)
  - GET /quote (fx, equity, 404, 422)
  - GET /fx-change (disabled, success, historical failure, missing spot)
  - Connection edge cases (provider init fail, connect fail)
  - TTL cache unit tests
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import get_current_user
from app.main import app

UTC = timezone.utc

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


def _make_user():
    user = MagicMock()
    user.id = "aaaaaaaa-0000-0000-0000-000000000001"
    user.email = "trader@example.com"
    user.company_id = "cccccccc-0000-0000-0000-000000000001"
    user.branch_id = "bbbbbbbb-0000-0000-0000-000000000001"
    user.is_active = True
    user.is_superuser = False
    return user


def _make_spot(pair: str, mid: float = 1.1000, bid: float = 1.0998, ask: float = 1.1002):
    from app.services.market_data.provider_base import NormalizedSpot
    return NormalizedSpot(
        pair=pair, mid=mid, bid=bid, ask=ask,
        source="ibkr", data_class="LIVE", as_of=datetime.now(UTC),
    )


def _make_equity(symbol: str, price: float = 450.0, close: float = 448.0, volume: int = 50000):
    from app.services.market_data.provider_base import NormalizedEquity
    return NormalizedEquity(
        symbol=symbol, price=price, open=447.0, high=451.0, low=446.0,
        close=close, volume=volume, change_pct=0.45,
        market_cap=None, source="ibkr", as_of=datetime.now(UTC),
    )


def _make_ohlc(symbol: str, close: float):
    from app.services.market_data.provider_base import NormalizedOHLC
    return NormalizedOHLC(
        symbol=symbol, open=close - 0.001, high=close + 0.002,
        low=close - 0.002, close=close, volume=100.0,
        timestamp=datetime.now(UTC), source="ibkr",
    )


@pytest.fixture(autouse=True)
def _clear_cache():
    """Clear the TTL cache before each test and reset provider singletons."""
    from app.api.routes import v1_market_data_live
    v1_market_data_live._cache._store.clear()
    v1_market_data_live._ibkr_provider = None
    v1_market_data_live._td_provider = None
    yield
    v1_market_data_live._cache._store.clear()
    v1_market_data_live._ibkr_provider = None
    v1_market_data_live._td_provider = None


@pytest.fixture
def authed_client():
    """Client with auth override + Bearer header (bypasses CSRF)."""
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


# ---------------------------------------------------------------------------
# 1. FX Rates
# ---------------------------------------------------------------------------

class TestFXRates:
    """GET /v1/market-data/live/fx-rates"""

    @pytest.mark.asyncio
    async def test_ibkr_disabled_returns_503(self, authed_client):
        with patch("app.api.routes.v1_market_data_live.settings") as ms:
            ms.IBKR_ENABLED = False
            async with authed_client as client:
                resp = await client.get("/api/v1/market-data/live/fx-rates", headers=_BEARER)
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_success_default_pairs(self, authed_client):
        mock_provider = MagicMock()
        mock_provider.is_connected = True
        mock_provider.fetch_fx_spot = AsyncMock(return_value=[
            _make_spot("EURUSD"), _make_spot("USDJPY", mid=150.50, bid=150.48, ask=150.52),
        ])

        with (
            patch("app.api.routes.v1_market_data_live.settings") as ms,
            patch("app.api.routes.v1_market_data_live._get_ibkr_provider", return_value=mock_provider),
            patch("app.api.routes.v1_market_data_live._get_td_provider", return_value=None),
        ):
            ms.IBKR_ENABLED = True
            async with authed_client as client:
                resp = await client.get("/api/v1/market-data/live/fx-rates", headers=_BEARER)

        assert resp.status_code == 200
        body = resp.json()
        assert body["source"] == "ibkr"
        assert body["connected"] is True
        assert len(body["rates"]) == 2
        assert body["rates"][0]["symbol"] == "EURUSD"
        assert "spread" in body["rates"][0]

    @pytest.mark.asyncio
    async def test_custom_pairs(self, authed_client):
        mock_provider = MagicMock()
        mock_provider.is_connected = True
        mock_provider.fetch_fx_spot = AsyncMock(return_value=[_make_spot("GBPUSD")])

        with (
            patch("app.api.routes.v1_market_data_live.settings") as ms,
            patch("app.api.routes.v1_market_data_live._get_ibkr_provider", return_value=mock_provider),
            patch("app.api.routes.v1_market_data_live._get_td_provider", return_value=None),
        ):
            ms.IBKR_ENABLED = True
            async with authed_client as client:
                resp = await client.get(
                    "/api/v1/market-data/live/fx-rates?pairs=GBPUSD", headers=_BEARER,
                )

        assert resp.status_code == 200
        assert resp.json()["rates"][0]["symbol"] == "GBPUSD"

    @pytest.mark.asyncio
    async def test_cache_hit(self, authed_client):
        mock_provider = MagicMock()
        mock_provider.is_connected = True
        mock_provider.fetch_fx_spot = AsyncMock(return_value=[_make_spot("EURUSD")])

        with (
            patch("app.api.routes.v1_market_data_live.settings") as ms,
            patch("app.api.routes.v1_market_data_live._get_ibkr_provider", return_value=mock_provider),
            patch("app.api.routes.v1_market_data_live._get_td_provider", return_value=None),
        ):
            ms.IBKR_ENABLED = True
            async with authed_client as client:
                resp1 = await client.get(
                    "/api/v1/market-data/live/fx-rates?pairs=EURUSD", headers=_BEARER,
                )
                resp2 = await client.get(
                    "/api/v1/market-data/live/fx-rates?pairs=EURUSD", headers=_BEARER,
                )

        assert resp1.status_code == 200
        assert resp2.status_code == 200
        # Provider should only have been called once (second hit from cache)
        assert mock_provider.fetch_fx_spot.call_count == 1

    @pytest.mark.asyncio
    async def test_all_providers_fail_returns_503(self, authed_client):
        """When IBKR fetch fails and TwelveData is unavailable, return 503."""
        mock_provider = MagicMock()
        mock_provider.is_connected = True
        mock_provider.fetch_fx_spot = AsyncMock(side_effect=Exception("IB Gateway timeout"))

        with (
            patch("app.api.routes.v1_market_data_live.settings") as ms,
            patch("app.api.routes.v1_market_data_live._get_ibkr_provider", return_value=mock_provider),
            patch("app.api.routes.v1_market_data_live._get_td_provider", return_value=None),
        ):
            ms.IBKR_ENABLED = True
            async with authed_client as client:
                resp = await client.get("/api/v1/market-data/live/fx-rates", headers=_BEARER)

        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_twelvedata_fallback_when_ibkr_disabled(self, authed_client):
        """When IBKR is disabled, TwelveData serves as the live data source."""
        td_mock = MagicMock()
        td_mock.fetch_fx_spot = AsyncMock(return_value=[
            _make_spot("EURUSD", mid=1.0900, bid=1.0898, ask=1.0902),
        ])

        with (
            patch("app.api.routes.v1_market_data_live.settings") as ms,
            patch("app.api.routes.v1_market_data_live._get_td_provider", return_value=td_mock),
        ):
            ms.IBKR_ENABLED = False
            async with authed_client as client:
                resp = await client.get(
                    "/api/v1/market-data/live/fx-rates?pairs=EURUSD", headers=_BEARER,
                )

        assert resp.status_code == 200
        body = resp.json()
        assert body["source"] == "twelvedata"
        assert body["connected"] is True
        assert body["rates"][0]["symbol"] == "EURUSD"
        assert body["rates"][0]["mid"] == 1.09


# ---------------------------------------------------------------------------
# 2. Equity Quotes
# ---------------------------------------------------------------------------

class TestEquityQuotes:
    """GET /v1/market-data/live/equity-quotes"""

    @pytest.mark.asyncio
    async def test_ibkr_disabled_returns_503(self, authed_client):
        with patch("app.api.routes.v1_market_data_live.settings") as ms:
            ms.IBKR_ENABLED = False
            async with authed_client as client:
                resp = await client.get("/api/v1/market-data/live/equity-quotes", headers=_BEARER)
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_success_default_symbols(self, authed_client):
        mock_provider = MagicMock()
        mock_provider.is_connected = True
        mock_provider.fetch_equity_quotes = AsyncMock(return_value=[
            _make_equity("SPY", price=450.0, close=448.0),
            _make_equity("XLK", price=200.0, close=199.0),
        ])

        with (
            patch("app.api.routes.v1_market_data_live.settings") as ms,
            patch("app.api.routes.v1_market_data_live._get_ibkr_provider", return_value=mock_provider),
            patch("app.api.routes.v1_market_data_live._get_td_provider", return_value=None),
        ):
            ms.IBKR_ENABLED = True
            async with authed_client as client:
                resp = await client.get("/api/v1/market-data/live/equity-quotes", headers=_BEARER)

        assert resp.status_code == 200
        body = resp.json()
        assert body["source"] == "ibkr"
        assert len(body["quotes"]) == 2

        spy = body["quotes"][0]
        assert spy["symbol"] == "SPY"
        assert spy["name"] == "S&P 500"
        assert spy["category"] == "market"
        assert spy["price"] == 450.0

        xlk = body["quotes"][1]
        assert xlk["symbol"] == "XLK"
        assert xlk["name"] == "Technology"
        assert xlk["category"] == "sector"

    @pytest.mark.asyncio
    async def test_change_calculation(self, authed_client):
        """Verify change and changePercent are computed from price vs close."""
        mock_provider = MagicMock()
        mock_provider.is_connected = True
        mock_provider.fetch_equity_quotes = AsyncMock(return_value=[
            _make_equity("SPY", price=450.0, close=440.0),
        ])

        with (
            patch("app.api.routes.v1_market_data_live.settings") as ms,
            patch("app.api.routes.v1_market_data_live._get_ibkr_provider", return_value=mock_provider),
            patch("app.api.routes.v1_market_data_live._get_td_provider", return_value=None),
        ):
            ms.IBKR_ENABLED = True
            async with authed_client as client:
                resp = await client.get(
                    "/api/v1/market-data/live/equity-quotes?symbols=SPY", headers=_BEARER,
                )

        body = resp.json()
        spy = body["quotes"][0]
        assert spy["change"] == 10.0
        assert round(spy["changePercent"], 2) == 2.27


# ---------------------------------------------------------------------------
# 3. Macro
# ---------------------------------------------------------------------------

class TestMacro:
    """GET /v1/market-data/live/macro"""

    @pytest.mark.asyncio
    async def test_ibkr_disabled_returns_503(self, authed_client):
        with patch("app.api.routes.v1_market_data_live.settings") as ms:
            ms.IBKR_ENABLED = False
            async with authed_client as client:
                resp = await client.get("/api/v1/market-data/live/macro", headers=_BEARER)
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_success_with_mocked_ib(self, authed_client):
        mock_ticker = MagicMock()
        mock_ticker.midpoint = MagicMock(return_value=104.5)
        mock_ticker.close = 104.0
        mock_ticker.bid = 104.4
        mock_ticker.ask = 104.6
        mock_ticker.last = 104.5

        mock_ib = MagicMock()
        mock_ib.qualifyContractsAsync = AsyncMock(return_value=None)
        mock_ib.reqMktData = MagicMock(return_value=mock_ticker)

        mock_provider = MagicMock()
        mock_provider.is_connected = True
        mock_provider._ib = mock_ib

        mock_ib_mod = MagicMock()
        mock_ib_mod.ContFuture = MagicMock(return_value=MagicMock())
        mock_ib_mod.Index = MagicMock(return_value=MagicMock())

        with (
            patch("app.api.routes.v1_market_data_live.settings") as ms,
            patch("app.api.routes.v1_market_data_live._get_provider", return_value=mock_provider),
            patch("app.api.routes.v1_market_data_live._get_ibkr_provider", return_value=mock_provider),
            patch("app.api.routes.v1_market_data_live.asyncio.sleep", new_callable=AsyncMock),
            patch(
                "app.services.market_data.ibkr_provider._ensure_ib_insync",
                return_value=mock_ib_mod,
            ),
        ):
            ms.IBKR_ENABLED = True
            async with authed_client as client:
                resp = await client.get("/api/v1/market-data/live/macro", headers=_BEARER)

        assert resp.status_code == 200
        body = resp.json()
        assert body["source"] == "ibkr"
        assert "macroData" in body
        for key in ["DXY INDEX", "VIX INDEX", "US10Y", "BRENT", "GOLD"]:
            assert key in body["macroData"]
            dp = body["macroData"][key]
            assert "label" in dp
            assert "value" in dp
            assert "trend" in dp
            assert "unit" in dp

    @pytest.mark.asyncio
    async def test_partial_failure_returns_n_a(self, authed_client):
        """If one instrument fails, others still return data."""
        call_count = 0

        mock_ib = MagicMock()

        async def qualify_side_effect(contract):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise Exception("Instrument not found")

        mock_ib.qualifyContractsAsync = AsyncMock(side_effect=qualify_side_effect)
        mock_ticker = MagicMock()
        mock_ticker.midpoint = MagicMock(return_value=100.0)
        mock_ticker.close = 99.5
        mock_ib.reqMktData = MagicMock(return_value=mock_ticker)

        mock_provider = MagicMock()
        mock_provider.is_connected = True
        mock_provider._ib = mock_ib

        mock_ib_mod = MagicMock()
        mock_ib_mod.ContFuture = MagicMock(return_value=MagicMock())
        mock_ib_mod.Index = MagicMock(return_value=MagicMock())

        with (
            patch("app.api.routes.v1_market_data_live.settings") as ms,
            patch("app.api.routes.v1_market_data_live._get_provider", return_value=mock_provider),
            patch("app.api.routes.v1_market_data_live._get_ibkr_provider", return_value=mock_provider),
            patch("app.api.routes.v1_market_data_live.asyncio.sleep", new_callable=AsyncMock),
            patch(
                "app.services.market_data.ibkr_provider._ensure_ib_insync",
                return_value=mock_ib_mod,
            ),
        ):
            ms.IBKR_ENABLED = True
            async with authed_client as client:
                resp = await client.get("/api/v1/market-data/live/macro", headers=_BEARER)

        assert resp.status_code == 200
        body = resp.json()
        values = [v["display"] for v in body["macroData"].values()]
        assert "N/A" in values  # At least one failed


# ---------------------------------------------------------------------------
# 4. Single Quote
# ---------------------------------------------------------------------------

class TestQuote:
    """GET /v1/market-data/live/quote"""

    @pytest.mark.asyncio
    async def test_fx_quote(self, authed_client):
        mock_provider = MagicMock()
        mock_provider.is_connected = True
        mock_provider.fetch_fx_spot = AsyncMock(return_value=[
            _make_spot("EURUSD", mid=1.0850, bid=1.0848, ask=1.0852),
        ])

        with (
            patch("app.api.routes.v1_market_data_live.settings") as ms,
            patch("app.api.routes.v1_market_data_live._get_ibkr_provider", return_value=mock_provider),
            patch("app.api.routes.v1_market_data_live._get_td_provider", return_value=None),
        ):
            ms.IBKR_ENABLED = True
            async with authed_client as client:
                resp = await client.get(
                    "/api/v1/market-data/live/quote?symbol=EURUSD&type=fx", headers=_BEARER,
                )

        assert resp.status_code == 200
        body = resp.json()
        assert body["symbol"] == "EURUSD"
        assert body["bid"] == 1.0848
        assert body["ask"] == 1.0852
        assert body["mid"] == 1.085
        assert body["source"] == "ibkr"

    @pytest.mark.asyncio
    async def test_equity_quote(self, authed_client):
        mock_provider = MagicMock()
        mock_provider.is_connected = True
        mock_provider.fetch_equity_quotes = AsyncMock(return_value=[
            _make_equity("SPY", price=452.50, close=450.00),
        ])

        with (
            patch("app.api.routes.v1_market_data_live.settings") as ms,
            patch("app.api.routes.v1_market_data_live._get_ibkr_provider", return_value=mock_provider),
            patch("app.api.routes.v1_market_data_live._get_td_provider", return_value=None),
        ):
            ms.IBKR_ENABLED = True
            async with authed_client as client:
                resp = await client.get(
                    "/api/v1/market-data/live/quote?symbol=SPY&type=equity", headers=_BEARER,
                )

        assert resp.status_code == 200
        body = resp.json()
        assert body["symbol"] == "SPY"
        assert body["mid"] == 452.5
        assert body["source"] == "ibkr"

    @pytest.mark.asyncio
    async def test_no_data_returns_503(self, authed_client):
        """When IBKR returns empty and TwelveData unavailable, 503 is returned."""
        mock_provider = MagicMock()
        mock_provider.is_connected = True
        mock_provider.fetch_fx_spot = AsyncMock(return_value=[])

        with (
            patch("app.api.routes.v1_market_data_live.settings") as ms,
            patch("app.api.routes.v1_market_data_live._get_ibkr_provider", return_value=mock_provider),
            patch("app.api.routes.v1_market_data_live._get_td_provider", return_value=None),
        ):
            ms.IBKR_ENABLED = True
            async with authed_client as client:
                resp = await client.get(
                    "/api/v1/market-data/live/quote?symbol=XXXYYY&type=fx", headers=_BEARER,
                )

        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_missing_symbol_returns_422(self, authed_client):
        with patch("app.api.routes.v1_market_data_live.settings") as ms:
            ms.IBKR_ENABLED = True
            async with authed_client as client:
                resp = await client.get("/api/v1/market-data/live/quote", headers=_BEARER)
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 5. FX Change
# ---------------------------------------------------------------------------

class TestFXChange:
    """GET /v1/market-data/live/fx-change"""

    @pytest.mark.asyncio
    async def test_ibkr_disabled_returns_503(self, authed_client):
        with patch("app.api.routes.v1_market_data_live.settings") as ms:
            ms.IBKR_ENABLED = False
            async with authed_client as client:
                resp = await client.get("/api/v1/market-data/live/fx-change", headers=_BEARER)
        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_success_with_change_calculation(self, authed_client):
        mock_provider = MagicMock()
        mock_provider.is_connected = True
        mock_provider.fetch_fx_spot = AsyncMock(return_value=[
            _make_spot("EURUSD", mid=1.1000),
        ])
        mock_provider.fetch_historical_ohlc = AsyncMock(return_value=[
            _make_ohlc("EURUSD", 1.0950),  # day before yesterday
            _make_ohlc("EURUSD", 1.0980),  # yesterday close
        ])

        with (
            patch("app.api.routes.v1_market_data_live.settings") as ms,
            patch("app.api.routes.v1_market_data_live._get_ibkr_provider", return_value=mock_provider),
            patch("app.api.routes.v1_market_data_live._get_td_provider", return_value=None),
        ):
            ms.IBKR_ENABLED = True
            async with authed_client as client:
                resp = await client.get(
                    "/api/v1/market-data/live/fx-change?pairs=EURUSD", headers=_BEARER,
                )

        assert resp.status_code == 200
        body = resp.json()
        assert body["source"] == "ibkr"
        assert "EURUSD" in body["changes"]
        # (1.1000 - 1.0980) / 1.0980 * 100 = ~0.1821
        assert abs(body["changes"]["EURUSD"] - 0.1821) < 0.01

    @pytest.mark.asyncio
    async def test_historical_failure_returns_zero(self, authed_client):
        mock_provider = MagicMock()
        mock_provider.is_connected = True
        mock_provider.fetch_fx_spot = AsyncMock(return_value=[
            _make_spot("EURUSD", mid=1.1000),
        ])
        mock_provider.fetch_historical_ohlc = AsyncMock(
            side_effect=Exception("Historical data unavailable"),
        )

        with (
            patch("app.api.routes.v1_market_data_live.settings") as ms,
            patch("app.api.routes.v1_market_data_live._get_ibkr_provider", return_value=mock_provider),
            patch("app.api.routes.v1_market_data_live._get_td_provider", return_value=None),
        ):
            ms.IBKR_ENABLED = True
            async with authed_client as client:
                resp = await client.get(
                    "/api/v1/market-data/live/fx-change?pairs=EURUSD", headers=_BEARER,
                )

        assert resp.status_code == 200
        assert resp.json()["changes"]["EURUSD"] == 0.0

    @pytest.mark.asyncio
    async def test_pair_not_in_spot_returns_zero(self, authed_client):
        """If a requested pair has no spot data, change should be 0."""
        mock_provider = MagicMock()
        mock_provider.is_connected = True
        mock_provider.fetch_fx_spot = AsyncMock(return_value=[
            _make_spot("USDJPY", mid=150.0),  # different pair from requested
        ])
        mock_provider.fetch_historical_ohlc = AsyncMock(return_value=[])

        with (
            patch("app.api.routes.v1_market_data_live.settings") as ms,
            patch("app.api.routes.v1_market_data_live._get_ibkr_provider", return_value=mock_provider),
            patch("app.api.routes.v1_market_data_live._get_td_provider", return_value=None),
        ):
            ms.IBKR_ENABLED = True
            async with authed_client as client:
                resp = await client.get(
                    "/api/v1/market-data/live/fx-change?pairs=EURUSD", headers=_BEARER,
                )

        assert resp.status_code == 200
        assert resp.json()["changes"]["EURUSD"] == 0.0


# ---------------------------------------------------------------------------
# Connection / Provider edge cases
# ---------------------------------------------------------------------------

class TestConnectionEdgeCases:
    """Edge cases for provider initialization and connection."""

    @pytest.mark.asyncio
    async def test_provider_init_failure_returns_503(self, authed_client):
        """When IBKR init returns None and TwelveData is unavailable → 503."""
        with (
            patch("app.api.routes.v1_market_data_live.settings") as ms,
            patch("app.api.routes.v1_market_data_live._get_ibkr_provider", return_value=None),
            patch("app.api.routes.v1_market_data_live._get_td_provider", return_value=None),
        ):
            ms.IBKR_ENABLED = True
            async with authed_client as client:
                resp = await client.get("/api/v1/market-data/live/fx-rates", headers=_BEARER)

        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_connect_failure_falls_to_503(self, authed_client):
        """When IBKR connect fails and TwelveData unavailable → 503."""
        mock_provider = MagicMock()
        mock_provider.is_connected = False
        mock_provider.connect = AsyncMock(side_effect=Exception("Connection refused"))

        with (
            patch("app.api.routes.v1_market_data_live.settings") as ms,
            patch("app.api.routes.v1_market_data_live._get_ibkr_provider", return_value=mock_provider),
            patch("app.api.routes.v1_market_data_live._get_td_provider", return_value=None),
        ):
            ms.IBKR_ENABLED = True
            async with authed_client as client:
                resp = await client.get("/api/v1/market-data/live/fx-rates", headers=_BEARER)

        assert resp.status_code == 503

    @pytest.mark.asyncio
    async def test_auth_required(self):
        """Requests without auth should return 401."""
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test",
        ) as client:
            resp = await client.get("/api/v1/market-data/live/fx-rates")
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# TTL Cache unit tests
# ---------------------------------------------------------------------------

class TestTTLCache:
    """Unit tests for the _TTLCache helper."""

    def test_set_and_get(self):
        from app.api.routes.v1_market_data_live import _TTLCache
        cache = _TTLCache()
        cache.set("key1", {"data": 42})
        assert cache.get("key1", ttl_seconds=10.0) == {"data": 42}

    def test_miss_returns_none(self):
        from app.api.routes.v1_market_data_live import _TTLCache
        cache = _TTLCache()
        assert cache.get("nonexistent", ttl_seconds=10.0) is None

    def test_expired_entry_returns_none(self):
        from app.api.routes.v1_market_data_live import _TTLCache
        cache = _TTLCache()
        # Manually set with an old timestamp
        cache._store["old_key"] = (time.monotonic() - 100, "stale")
        assert cache.get("old_key", ttl_seconds=5.0) is None
        assert "old_key" not in cache._store
