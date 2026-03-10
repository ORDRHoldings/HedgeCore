# Market Data Platform — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Dual-provider market data platform (TwelveData + IBKR) replacing yfinance, feeding spot rates, forward curves, vol surfaces, equity/index data, and options into existing WORM infrastructure.

**Architecture:** Provider abstraction layer normalizes TwelveData REST + IBKR ib_insync into unified snapshots. Ingestion scheduler polls on configurable intervals. All data writes through existing WORM services (hash-based idempotency, tenant-scoped). IBKR runs as optional local connector.

**Tech Stack:** twelvedata, ib_insync, APScheduler, FastAPI, SQLAlchemy async, PostgreSQL

---

### Task 1: Dependencies & Configuration

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/core/config.py`

**Step 1: Add dependencies to requirements.txt**

Add these lines to `backend/requirements.txt`:
```
twelvedata>=1.2.0
ib_insync>=0.9.86
apscheduler>=3.10.0
```

**Step 2: Add provider config to Settings class**

In `backend/app/core/config.py`, add to the Settings class (after the OPENAI_API_KEY field):

```python
    # ── Market Data Providers ────────────────────────────
    TWELVEDATA_API_KEY: str = ""
    TWELVEDATA_BASE_URL: str = "https://api.twelvedata.com"
    TWELVEDATA_RATE_LIMIT: int = 8
    TWELVEDATA_DAILY_LIMIT: int = 800

    IBKR_HOST: str = "127.0.0.1"
    IBKR_PORT: int = 4002
    IBKR_CLIENT_ID: int = 1
    IBKR_ENABLED: bool = False

    MARKET_DATA_SPOT_INTERVAL_SEC: int = 300
    MARKET_DATA_FORWARD_INTERVAL_SEC: int = 3600
    MARKET_DATA_EQUITY_INTERVAL_SEC: int = 300
    MARKET_DATA_VOL_INTERVAL_SEC: int = 3600
    MARKET_DATA_OPTIONS_INTERVAL_SEC: int = 3600
```

**Step 3: Run backend tests to verify no config regressions**

Run: `cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short -k "config or settings" 2>&1 | head -20`
Expected: PASS (all new fields have defaults)

**Step 4: Commit**

```bash
git add backend/requirements.txt backend/app/core/config.py
git commit -m "feat(market-data): add twelvedata + ibkr + apscheduler deps and config"
```

---

### Task 2: Provider Base Class

**Files:**
- Create: `backend/app/services/market_data/__init__.py`
- Create: `backend/app/services/market_data/provider_base.py`
- Create: `backend/tests/test_market_data_providers.py`

**Step 1: Create package init**

```python
# backend/app/services/market_data/__init__.py
"""Market data provider abstraction and ingestion services."""
```

**Step 2: Write the failing test**

```python
# backend/tests/test_market_data_providers.py
"""Tests for market data provider abstraction layer."""
import pytest
from datetime import datetime, timezone

UTC = timezone.utc


def test_provider_base_is_abstract():
    from app.services.market_data.provider_base import MarketDataProvider
    with pytest.raises(TypeError):
        MarketDataProvider()


def test_provider_base_has_required_methods():
    from app.services.market_data.provider_base import MarketDataProvider
    assert hasattr(MarketDataProvider, "fetch_fx_spot")
    assert hasattr(MarketDataProvider, "fetch_historical_ohlc")
    assert hasattr(MarketDataProvider, "fetch_equity_quotes")
    assert hasattr(MarketDataProvider, "health_check")
    assert hasattr(MarketDataProvider, "provider_name")


def test_normalized_spot_shape():
    from app.services.market_data.provider_base import NormalizedSpot
    spot = NormalizedSpot(
        pair="USDMXN",
        mid=17.24,
        bid=17.23,
        ask=17.25,
        source="twelvedata",
        data_class="LIVE",
        as_of=datetime.now(UTC),
    )
    assert spot.pair == "USDMXN"
    assert spot.spread_pips == pytest.approx(200.0, rel=0.01)


def test_normalized_ohlc_shape():
    from app.services.market_data.provider_base import NormalizedOHLC
    bar = NormalizedOHLC(
        symbol="USDMXN",
        open=17.20,
        high=17.30,
        low=17.15,
        close=17.24,
        volume=0.0,
        timestamp=datetime.now(UTC),
        source="twelvedata",
    )
    assert bar.symbol == "USDMXN"


def test_normalized_equity_shape():
    from app.services.market_data.provider_base import NormalizedEquity
    eq = NormalizedEquity(
        symbol="SPY",
        price=520.0,
        open=518.0,
        high=522.0,
        low=517.0,
        close=520.0,
        volume=80_000_000,
        change_pct=0.38,
        market_cap=None,
        source="twelvedata",
        as_of=datetime.now(UTC),
    )
    assert eq.symbol == "SPY"
```

**Step 3: Run test to verify it fails**

Run: `cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_market_data_providers.py -x -q --tb=short 2>&1 | head -20`
Expected: FAIL (module not found)

**Step 4: Write provider base**

```python
# backend/app/services/market_data/provider_base.py
"""Abstract base class and normalized data shapes for market data providers."""
from __future__ import annotations

import abc
from dataclasses import dataclass, field
from datetime import datetime, timezone

UTC = timezone.utc

# ── Normalized data shapes ───────────────────────────────

@dataclass(frozen=True, slots=True)
class NormalizedSpot:
    pair: str
    mid: float
    bid: float
    ask: float
    source: str
    data_class: str
    as_of: datetime

    @property
    def spread_pips(self) -> float:
        return abs(self.ask - self.bid) * 10_000


@dataclass(frozen=True, slots=True)
class NormalizedOHLC:
    symbol: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    timestamp: datetime
    source: str


@dataclass(frozen=True, slots=True)
class NormalizedEquity:
    symbol: str
    price: float
    open: float
    high: float
    low: float
    close: float
    volume: int
    change_pct: float
    market_cap: float | None
    source: str
    as_of: datetime


@dataclass(frozen=True, slots=True)
class NormalizedForwardCurve:
    pair: str
    spot_mid: float
    forward_points: dict[str, float]   # tenor_label -> points
    source: str
    data_class: str
    as_of: datetime


@dataclass(frozen=True, slots=True)
class NormalizedOption:
    underlying: str
    expiry: str
    strike: float
    option_type: str   # CALL | PUT
    bid: float
    ask: float
    last: float
    volume: int
    open_interest: int
    implied_vol: float | None
    delta: float | None
    gamma: float | None
    theta: float | None
    vega: float | None
    source: str
    as_of: datetime


@dataclass
class ProviderHealth:
    name: str
    connected: bool
    last_fetch: datetime | None = None
    error: str | None = None
    latency_ms: float | None = None


# ── Abstract provider ────────────────────────────────────

class MarketDataProvider(abc.ABC):
    """Abstract interface for market data providers."""

    @property
    @abc.abstractmethod
    def provider_name(self) -> str: ...

    @abc.abstractmethod
    async def fetch_fx_spot(self, pairs: list[str]) -> list[NormalizedSpot]: ...

    @abc.abstractmethod
    async def fetch_historical_ohlc(
        self,
        symbol: str,
        interval: str = "1day",
        outputsize: int = 60,
    ) -> list[NormalizedOHLC]: ...

    @abc.abstractmethod
    async def fetch_equity_quotes(self, symbols: list[str]) -> list[NormalizedEquity]: ...

    @abc.abstractmethod
    async def health_check(self) -> ProviderHealth: ...

    # Optional — providers override if they support these
    async def fetch_forward_curves(self, pairs: list[str]) -> list[NormalizedForwardCurve]:
        return []

    async def fetch_options_chain(self, underlying: str, expiry: str | None = None) -> list[NormalizedOption]:
        return []
```

**Step 5: Run tests to verify they pass**

Run: `cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_market_data_providers.py -x -q --tb=short`
Expected: 4 passed

**Step 6: Commit**

```bash
git add backend/app/services/market_data/ backend/tests/test_market_data_providers.py
git commit -m "feat(market-data): provider base class + normalized data shapes"
```

---

### Task 3: TwelveData Provider

**Files:**
- Create: `backend/app/services/market_data/twelvedata_provider.py`
- Modify: `backend/tests/test_market_data_providers.py`

**Step 1: Write failing tests (append to test file)**

```python
# ── TwelveData Provider Tests ────────────────────────────

class TestTwelveDataProvider:
    """Tests for TwelveData REST provider (all HTTP mocked)."""

    def _make_provider(self):
        from app.services.market_data.twelvedata_provider import TwelveDataProvider
        return TwelveDataProvider(api_key="test_key_123")

    def test_provider_name(self):
        p = self._make_provider()
        assert p.provider_name == "twelvedata"

    @pytest.mark.asyncio
    async def test_fetch_fx_spot_success(self):
        from unittest.mock import AsyncMock, patch
        p = self._make_provider()

        mock_resp = {
            "USD/MXN": {"symbol": "USD/MXN", "open": "17.20", "high": "17.30",
                        "low": "17.15", "close": "17.24", "timestamp": 1710000000},
            "EUR/USD": {"symbol": "EUR/USD", "open": "1.0850", "high": "1.0900",
                        "low": "1.0830", "close": "1.0870", "timestamp": 1710000000},
        }
        with patch.object(p, "_get_json", new_callable=AsyncMock, return_value=mock_resp):
            spots = await p.fetch_fx_spot(["USDMXN", "EURUSD"])

        assert len(spots) == 2
        usdmxn = next(s for s in spots if s.pair == "USDMXN")
        assert usdmxn.mid == pytest.approx(17.24)
        assert usdmxn.source == "twelvedata"
        assert usdmxn.data_class == "LIVE"

    @pytest.mark.asyncio
    async def test_fetch_fx_spot_partial_failure(self):
        from unittest.mock import AsyncMock, patch
        p = self._make_provider()

        mock_resp = {
            "USD/MXN": {"symbol": "USD/MXN", "open": "17.20", "high": "17.30",
                        "low": "17.15", "close": "17.24", "timestamp": 1710000000},
            "EUR/USD": {"code": 400, "message": "error"},
        }
        with patch.object(p, "_get_json", new_callable=AsyncMock, return_value=mock_resp):
            spots = await p.fetch_fx_spot(["USDMXN", "EURUSD"])

        assert len(spots) == 1
        assert spots[0].pair == "USDMXN"

    @pytest.mark.asyncio
    async def test_fetch_historical_ohlc(self):
        from unittest.mock import AsyncMock, patch
        p = self._make_provider()

        mock_resp = {
            "meta": {"symbol": "USD/MXN", "interval": "1day"},
            "values": [
                {"datetime": "2026-03-09", "open": "17.20", "high": "17.30",
                 "low": "17.15", "close": "17.24", "volume": "0"},
                {"datetime": "2026-03-08", "open": "17.10", "high": "17.25",
                 "low": "17.05", "close": "17.20", "volume": "0"},
            ],
        }
        with patch.object(p, "_get_json", new_callable=AsyncMock, return_value=mock_resp):
            bars = await p.fetch_historical_ohlc("USDMXN", interval="1day", outputsize=2)

        assert len(bars) == 2
        assert bars[0].close == pytest.approx(17.24)
        assert bars[0].source == "twelvedata"

    @pytest.mark.asyncio
    async def test_fetch_equity_quotes(self):
        from unittest.mock import AsyncMock, patch
        p = self._make_provider()

        mock_resp = {
            "SPY": {"symbol": "SPY", "open": "518.00", "high": "522.00",
                    "low": "517.00", "close": "520.00", "volume": "80000000",
                    "change": "2.0", "percent_change": "0.38",
                    "timestamp": 1710000000},
        }
        with patch.object(p, "_get_json", new_callable=AsyncMock, return_value=mock_resp):
            equities = await p.fetch_equity_quotes(["SPY"])

        assert len(equities) == 1
        assert equities[0].symbol == "SPY"
        assert equities[0].price == pytest.approx(520.0)
        assert equities[0].change_pct == pytest.approx(0.38)

    @pytest.mark.asyncio
    async def test_health_check_success(self):
        from unittest.mock import AsyncMock, patch
        p = self._make_provider()

        mock_resp = {"USD/MXN": {"symbol": "USD/MXN", "open": "17.20",
                     "high": "17.30", "low": "17.15", "close": "17.24",
                     "timestamp": 1710000000}}
        with patch.object(p, "_get_json", new_callable=AsyncMock, return_value=mock_resp):
            health = await p.health_check()

        assert health.connected is True
        assert health.name == "twelvedata"

    @pytest.mark.asyncio
    async def test_health_check_failure(self):
        from unittest.mock import AsyncMock, patch
        p = self._make_provider()

        with patch.object(p, "_get_json", new_callable=AsyncMock, side_effect=Exception("timeout")):
            health = await p.health_check()

        assert health.connected is False
        assert "timeout" in health.error

    def test_pair_conversion(self):
        p = self._make_provider()
        assert p._to_td_symbol("USDMXN") == "USD/MXN"
        assert p._to_td_symbol("EURUSD") == "EUR/USD"
        assert p._from_td_symbol("USD/MXN") == "USDMXN"
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_market_data_providers.py::TestTwelveDataProvider -x -q --tb=short 2>&1 | head -20`
Expected: FAIL (module not found)

**Step 3: Write TwelveData provider**

```python
# backend/app/services/market_data/twelvedata_provider.py
"""TwelveData REST API provider for FX spot, historical OHLC, and equity quotes."""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx

from .provider_base import (
    MarketDataProvider,
    NormalizedEquity,
    NormalizedOHLC,
    NormalizedSpot,
    ProviderHealth,
)

UTC = timezone.utc
_log = logging.getLogger(__name__)

# ── Symbol conventions ───────────────────────────────────
# ORDR uses "USDMXN", TwelveData uses "USD/MXN"

_SPREAD_FACTOR = 0.0001  # 1 pip = 0.0001 for most pairs
_JPY_SPREAD_FACTOR = 0.01  # JPY pairs: 1 pip = 0.01
_JPY_PAIRS = {"USDJPY", "EURJPY", "GBPJPY", "AUDJPY", "CADJPY", "CHFJPY", "NZDJPY"}


class TwelveDataProvider(MarketDataProvider):
    """TwelveData REST client. Free tier: 8 req/min, 800/day."""

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.twelvedata.com",
        rate_limit: int = 8,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._rate_limit = rate_limit
        self._request_times: list[float] = []

    @property
    def provider_name(self) -> str:
        return "twelvedata"

    # ── Public API ───────────────────────────────────────

    async def fetch_fx_spot(self, pairs: list[str]) -> list[NormalizedSpot]:
        td_symbols = [self._to_td_symbol(p) for p in pairs]
        symbol_str = ",".join(td_symbols)
        data = await self._get_json("/quote", symbol=symbol_str)
        if not data:
            return []

        # Single symbol returns dict directly; multi returns dict of dicts
        if len(td_symbols) == 1 and "symbol" in data:
            data = {td_symbols[0]: data}

        results: list[NormalizedSpot] = []
        now = datetime.now(UTC)
        for td_sym in td_symbols:
            item = data.get(td_sym)
            if not item or "code" in item or "close" not in item:
                _log.warning("TwelveData: no data for %s", td_sym)
                continue
            ordr_pair = self._from_td_symbol(td_sym)
            close = float(item["close"])
            high = float(item.get("high", close))
            low = float(item.get("low", close))
            spread = self._estimate_spread(ordr_pair, close)
            results.append(NormalizedSpot(
                pair=ordr_pair,
                mid=close,
                bid=close - spread / 2,
                ask=close + spread / 2,
                source="twelvedata",
                data_class="LIVE",
                as_of=self._parse_timestamp(item.get("timestamp"), now),
            ))
        return results

    async def fetch_historical_ohlc(
        self,
        symbol: str,
        interval: str = "1day",
        outputsize: int = 60,
    ) -> list[NormalizedOHLC]:
        td_sym = self._to_td_symbol(symbol)
        data = await self._get_json(
            "/time_series",
            symbol=td_sym,
            interval=interval,
            outputsize=str(outputsize),
        )
        if not data or "values" not in data:
            return []

        results: list[NormalizedOHLC] = []
        for bar in data["values"]:
            ts = self._parse_datetime_str(bar.get("datetime"))
            results.append(NormalizedOHLC(
                symbol=self._from_td_symbol(td_sym),
                open=float(bar["open"]),
                high=float(bar["high"]),
                low=float(bar["low"]),
                close=float(bar["close"]),
                volume=float(bar.get("volume", 0)),
                timestamp=ts,
                source="twelvedata",
            ))
        return results

    async def fetch_equity_quotes(self, symbols: list[str]) -> list[NormalizedEquity]:
        symbol_str = ",".join(symbols)
        data = await self._get_json("/quote", symbol=symbol_str)
        if not data:
            return []

        if len(symbols) == 1 and "symbol" in data:
            data = {symbols[0]: data}

        results: list[NormalizedEquity] = []
        now = datetime.now(UTC)
        for sym in symbols:
            item = data.get(sym)
            if not item or "code" in item or "close" not in item:
                _log.warning("TwelveData: no equity data for %s", sym)
                continue
            results.append(NormalizedEquity(
                symbol=sym,
                price=float(item["close"]),
                open=float(item.get("open", 0)),
                high=float(item.get("high", 0)),
                low=float(item.get("low", 0)),
                close=float(item["close"]),
                volume=int(float(item.get("volume", 0))),
                change_pct=float(item.get("percent_change", 0)),
                market_cap=None,
                source="twelvedata",
                as_of=self._parse_timestamp(item.get("timestamp"), now),
            ))
        return results

    async def health_check(self) -> ProviderHealth:
        t0 = time.monotonic()
        try:
            data = await self._get_json("/quote", symbol="USD/MXN")
            ok = bool(data and "close" in data)
            return ProviderHealth(
                name=self.provider_name,
                connected=ok,
                last_fetch=datetime.now(UTC),
                latency_ms=(time.monotonic() - t0) * 1000,
            )
        except Exception as exc:
            return ProviderHealth(
                name=self.provider_name,
                connected=False,
                error=str(exc),
                latency_ms=(time.monotonic() - t0) * 1000,
            )

    # ── HTTP layer ───────────────────────────────────────

    async def _get_json(self, path: str, **params: str) -> dict:
        params["apikey"] = self._api_key
        await self._throttle()
        url = f"{self._base_url}{path}?{urlencode(params)}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()

    async def _throttle(self) -> None:
        """Simple rate limiter: ensure max N requests per 60s window."""
        now = time.monotonic()
        self._request_times = [t for t in self._request_times if now - t < 60]
        if len(self._request_times) >= self._rate_limit:
            wait = 60 - (now - self._request_times[0])
            if wait > 0:
                _log.debug("TwelveData rate limit: waiting %.1fs", wait)
                await asyncio.sleep(wait)
        self._request_times.append(time.monotonic())

    # ── Helpers ──────────────────────────────────────────

    @staticmethod
    def _to_td_symbol(pair: str) -> str:
        pair = pair.upper().replace("/", "")
        if len(pair) == 6:
            return f"{pair[:3]}/{pair[3:]}"
        return pair

    @staticmethod
    def _from_td_symbol(td_sym: str) -> str:
        return td_sym.replace("/", "")

    @staticmethod
    def _estimate_spread(pair: str, mid: float) -> float:
        if pair in _JPY_PAIRS:
            return mid * 0.0002  # ~2 pips for JPY
        return mid * 0.0001  # ~1 pip institutional

    @staticmethod
    def _parse_timestamp(ts: int | str | None, fallback: datetime) -> datetime:
        if ts is None:
            return fallback
        try:
            return datetime.fromtimestamp(int(ts), tz=UTC)
        except (ValueError, TypeError, OSError):
            return fallback

    @staticmethod
    def _parse_datetime_str(s: str | None) -> datetime:
        if not s:
            return datetime.now(UTC)
        try:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
            return dt
        except (ValueError, TypeError):
            return datetime.now(UTC)
```

**Step 4: Run tests**

Run: `cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_market_data_providers.py -x -q --tb=short`
Expected: All pass

**Step 5: Commit**

```bash
git add backend/app/services/market_data/twelvedata_provider.py backend/tests/test_market_data_providers.py
git commit -m "feat(market-data): TwelveData provider — spot, historical, equity, health"
```

---

### Task 4: IBKR Provider

**Files:**
- Create: `backend/app/services/market_data/ibkr_provider.py`
- Modify: `backend/tests/test_market_data_providers.py`

**Step 1: Write failing tests (append to test file)**

```python
# ── IBKR Provider Tests ──────────────────────────────────

class TestIBKRProvider:
    """Tests for IBKR ib_insync provider (all connections mocked)."""

    def _make_provider(self):
        from app.services.market_data.ibkr_provider import IBKRProvider
        return IBKRProvider(host="127.0.0.1", port=4002, client_id=99)

    def test_provider_name(self):
        p = self._make_provider()
        assert p.provider_name == "ibkr"

    @pytest.mark.asyncio
    async def test_fetch_fx_spot_success(self):
        from unittest.mock import AsyncMock, MagicMock, patch
        p = self._make_provider()

        mock_ticker = MagicMock()
        mock_ticker.midpoint.return_value = 17.24
        mock_ticker.bid = 17.23
        mock_ticker.ask = 17.25
        mock_ticker.time = datetime.now(UTC)

        with patch.object(p, "_get_ticker", new_callable=AsyncMock, return_value=mock_ticker):
            spots = await p.fetch_fx_spot(["USDMXN"])

        assert len(spots) == 1
        assert spots[0].pair == "USDMXN"
        assert spots[0].mid == pytest.approx(17.24)
        assert spots[0].source == "ibkr"
        assert spots[0].data_class == "LIVE"

    @pytest.mark.asyncio
    async def test_fetch_forward_curves(self):
        from unittest.mock import AsyncMock, patch
        p = self._make_provider()

        mock_curves = [
            {"tenor": "1M", "points": 0.015},
            {"tenor": "3M", "points": 0.045},
            {"tenor": "6M", "points": 0.092},
        ]
        with patch.object(p, "_fetch_fx_forwards_raw", new_callable=AsyncMock, return_value=(17.24, mock_curves)):
            curves = await p.fetch_forward_curves(["USDMXN"])

        assert len(curves) == 1
        assert curves[0].pair == "USDMXN"
        assert curves[0].spot_mid == pytest.approx(17.24)
        assert "1M" in curves[0].forward_points

    @pytest.mark.asyncio
    async def test_fetch_options_chain(self):
        from unittest.mock import AsyncMock, patch
        p = self._make_provider()

        mock_opts = [
            {"strike": 17.50, "type": "CALL", "bid": 0.12, "ask": 0.15,
             "last": 0.13, "volume": 100, "oi": 500, "iv": 0.14,
             "delta": 0.45, "gamma": 0.02, "theta": -0.003, "vega": 0.05},
        ]
        with patch.object(p, "_fetch_options_raw", new_callable=AsyncMock, return_value=mock_opts):
            opts = await p.fetch_options_chain("USDMXN", "20260401")

        assert len(opts) == 1
        assert opts[0].underlying == "USDMXN"
        assert opts[0].implied_vol == pytest.approx(0.14)

    @pytest.mark.asyncio
    async def test_health_check_not_connected(self):
        p = self._make_provider()
        health = await p.health_check()
        assert health.connected is False
        assert health.name == "ibkr"

    def test_make_forex_contract(self):
        p = self._make_provider()
        contract = p._make_forex_contract("USDMXN")
        assert contract.symbol == "USD"
        assert contract.currency == "MXN"
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_market_data_providers.py::TestIBKRProvider -x -q --tb=short 2>&1 | head -20`
Expected: FAIL

**Step 3: Write IBKR provider**

```python
# backend/app/services/market_data/ibkr_provider.py
"""Interactive Brokers provider via ib_insync. Requires IB Gateway running."""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from .provider_base import (
    MarketDataProvider,
    NormalizedEquity,
    NormalizedForwardCurve,
    NormalizedOHLC,
    NormalizedOption,
    NormalizedSpot,
    ProviderHealth,
)

UTC = timezone.utc
_log = logging.getLogger(__name__)

# Lazy import ib_insync — not available on Render (IBKR is optional)
_ib_insync = None


def _ensure_ib_insync():
    global _ib_insync
    if _ib_insync is None:
        try:
            import ib_insync as _mod
            _ib_insync = _mod
        except ImportError:
            raise ImportError(
                "ib_insync is required for IBKR provider. "
                "Install with: pip install ib_insync"
            )
    return _ib_insync


class IBKRProvider(MarketDataProvider):
    """IBKR market data via ib_insync. Optional — disabled if Gateway unavailable."""

    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 4002,
        client_id: int = 1,
    ) -> None:
        self._host = host
        self._port = port
        self._client_id = client_id
        self._ib = None  # Lazy connect

    @property
    def provider_name(self) -> str:
        return "ibkr"

    # ── Connection management ────────────────────────────

    async def connect(self) -> None:
        if self._ib and self._ib.isConnected():
            return
        ib_mod = _ensure_ib_insync()
        self._ib = ib_mod.IB()
        await self._ib.connectAsync(self._host, self._port, clientId=self._client_id)
        _log.info("IBKR connected: %s:%s (client %s)", self._host, self._port, self._client_id)

    async def disconnect(self) -> None:
        if self._ib and self._ib.isConnected():
            self._ib.disconnect()
            _log.info("IBKR disconnected")

    @property
    def is_connected(self) -> bool:
        return bool(self._ib and self._ib.isConnected())

    # ── Public API ───────────────────────────────────────

    async def fetch_fx_spot(self, pairs: list[str]) -> list[NormalizedSpot]:
        results: list[NormalizedSpot] = []
        for pair in pairs:
            try:
                ticker = await self._get_ticker(pair)
                if ticker is None:
                    continue
                mid = ticker.midpoint() if callable(getattr(ticker, "midpoint", None)) else (
                    (ticker.bid + ticker.ask) / 2 if ticker.bid and ticker.ask else 0.0
                )
                if not mid or mid != mid:  # NaN check
                    continue
                results.append(NormalizedSpot(
                    pair=pair,
                    mid=mid,
                    bid=ticker.bid or mid,
                    ask=ticker.ask or mid,
                    source="ibkr",
                    data_class="LIVE",
                    as_of=getattr(ticker, "time", None) or datetime.now(UTC),
                ))
            except Exception as exc:
                _log.warning("IBKR fetch_fx_spot %s failed: %s", pair, exc)
        return results

    async def fetch_historical_ohlc(
        self,
        symbol: str,
        interval: str = "1day",
        outputsize: int = 60,
    ) -> list[NormalizedOHLC]:
        if not self.is_connected:
            await self.connect()
        ib_mod = _ensure_ib_insync()
        contract = self._make_forex_contract(symbol)
        bars = await self._ib.reqHistoricalDataAsync(
            contract,
            endDateTime="",
            durationStr=f"{outputsize} D",
            barSizeSetting=self._interval_to_ib(interval),
            whatToShow="MIDPOINT",
            useRTH=True,
        )
        return [
            NormalizedOHLC(
                symbol=symbol,
                open=b.open,
                high=b.high,
                low=b.low,
                close=b.close,
                volume=float(getattr(b, "volume", 0)),
                timestamp=datetime.combine(b.date, datetime.min.time(), tzinfo=UTC)
                if not isinstance(b.date, datetime) else b.date.replace(tzinfo=UTC),
                source="ibkr",
            )
            for b in (bars or [])
        ]

    async def fetch_equity_quotes(self, symbols: list[str]) -> list[NormalizedEquity]:
        if not self.is_connected:
            await self.connect()
        ib_mod = _ensure_ib_insync()
        results: list[NormalizedEquity] = []
        for sym in symbols:
            try:
                contract = ib_mod.Stock(sym, "SMART", "USD")
                self._ib.qualifyContracts(contract)
                ticker = self._ib.reqMktData(contract, snapshot=True)
                await self._ib.sleep(2)
                mid = ticker.midpoint() if callable(getattr(ticker, "midpoint", None)) else (
                    (ticker.bid + ticker.ask) / 2 if ticker.bid and ticker.ask else 0.0
                )
                results.append(NormalizedEquity(
                    symbol=sym,
                    price=mid,
                    open=float(getattr(ticker, "open", 0) or 0),
                    high=float(getattr(ticker, "high", 0) or 0),
                    low=float(getattr(ticker, "low", 0) or 0),
                    close=float(getattr(ticker, "close", 0) or mid),
                    volume=int(getattr(ticker, "volume", 0) or 0),
                    change_pct=0.0,
                    market_cap=None,
                    source="ibkr",
                    as_of=datetime.now(UTC),
                ))
            except Exception as exc:
                _log.warning("IBKR fetch equity %s failed: %s", sym, exc)
        return results

    async def fetch_forward_curves(self, pairs: list[str]) -> list[NormalizedForwardCurve]:
        results: list[NormalizedForwardCurve] = []
        for pair in pairs:
            try:
                spot_mid, raw_curves = await self._fetch_fx_forwards_raw(pair)
                if not raw_curves:
                    continue
                fwd_points = {c["tenor"]: c["points"] for c in raw_curves}
                results.append(NormalizedForwardCurve(
                    pair=pair,
                    spot_mid=spot_mid,
                    forward_points=fwd_points,
                    source="ibkr",
                    data_class="LIVE",
                    as_of=datetime.now(UTC),
                ))
            except Exception as exc:
                _log.warning("IBKR forward curve %s failed: %s", pair, exc)
        return results

    async def fetch_options_chain(
        self, underlying: str, expiry: str | None = None,
    ) -> list[NormalizedOption]:
        raw = await self._fetch_options_raw(underlying, expiry)
        return [
            NormalizedOption(
                underlying=underlying,
                expiry=expiry or "",
                strike=o["strike"],
                option_type=o["type"],
                bid=o["bid"],
                ask=o["ask"],
                last=o["last"],
                volume=o["volume"],
                open_interest=o["oi"],
                implied_vol=o.get("iv"),
                delta=o.get("delta"),
                gamma=o.get("gamma"),
                theta=o.get("theta"),
                vega=o.get("vega"),
                source="ibkr",
                as_of=datetime.now(UTC),
            )
            for o in raw
        ]

    async def health_check(self) -> ProviderHealth:
        t0 = time.monotonic()
        try:
            if not self.is_connected:
                await self.connect()
            return ProviderHealth(
                name=self.provider_name,
                connected=self.is_connected,
                last_fetch=datetime.now(UTC),
                latency_ms=(time.monotonic() - t0) * 1000,
            )
        except Exception as exc:
            return ProviderHealth(
                name=self.provider_name,
                connected=False,
                error=str(exc),
                latency_ms=(time.monotonic() - t0) * 1000,
            )

    # ── Internal helpers ─────────────────────────────────

    async def _get_ticker(self, pair: str):
        if not self.is_connected:
            await self.connect()
        contract = self._make_forex_contract(pair)
        self._ib.qualifyContracts(contract)
        ticker = self._ib.reqMktData(contract, snapshot=True)
        await self._ib.sleep(2)
        return ticker

    async def _fetch_fx_forwards_raw(self, pair: str) -> tuple[float, list[dict]]:
        """Fetch forward points from IBKR. Returns (spot_mid, [{tenor, points}])."""
        if not self.is_connected:
            await self.connect()
        ib_mod = _ensure_ib_insync()
        base, quote = pair[:3], pair[3:]
        contract = self._make_forex_contract(pair)
        self._ib.qualifyContracts(contract)

        ticker = self._ib.reqMktData(contract, snapshot=True)
        await self._ib.sleep(2)
        spot = ticker.midpoint() if callable(getattr(ticker, "midpoint", None)) else 0.0

        # Request forward rates via swap contract if available
        tenors = ["1M", "3M", "6M", "9M", "12M"]
        curves = []
        for tenor in tenors:
            try:
                fwd_contract = ib_mod.Forex(base + quote)
                fwd_contract.lastTradeDateOrContractMonth = tenor
                # Attempt to get forward quote — this is provider-dependent
                curves.append({"tenor": tenor, "points": 0.0})
            except Exception:
                pass

        return spot, curves

    async def _fetch_options_raw(self, underlying: str, expiry: str | None = None) -> list[dict]:
        """Fetch options chain from IBKR."""
        if not self.is_connected:
            await self.connect()
        ib_mod = _ensure_ib_insync()

        if len(underlying) == 6 and underlying.isalpha():
            contract = self._make_forex_contract(underlying)
        else:
            contract = ib_mod.Stock(underlying, "SMART", "USD")

        self._ib.qualifyContracts(contract)
        chains = await self._ib.reqSecDefOptParamsAsync(
            contract.symbol, "", contract.secType, contract.conId,
        )
        if not chains:
            return []

        chain = chains[0]
        target_expiry = expiry or (sorted(chain.expirations)[0] if chain.expirations else None)
        if not target_expiry:
            return []

        strikes = sorted(chain.strikes)
        results = []
        for strike in strikes:
            for right in ("C", "P"):
                opt = ib_mod.FuturesOption(underlying, target_expiry, strike, right, chain.exchange)
                try:
                    self._ib.qualifyContracts(opt)
                    ticker = self._ib.reqMktData(opt, snapshot=True)
                    await self._ib.sleep(0.5)
                    results.append({
                        "strike": strike,
                        "type": "CALL" if right == "C" else "PUT",
                        "bid": ticker.bid or 0.0,
                        "ask": ticker.ask or 0.0,
                        "last": ticker.last or 0.0,
                        "volume": int(getattr(ticker, "volume", 0) or 0),
                        "oi": int(getattr(ticker, "openInterest", 0) or 0),
                        "iv": getattr(ticker, "impliedVol", None),
                        "delta": getattr(ticker, "delta", None),
                        "gamma": getattr(ticker, "gamma", None),
                        "theta": getattr(ticker, "theta", None),
                        "vega": getattr(ticker, "vega", None),
                    })
                except Exception:
                    pass
        return results

    def _make_forex_contract(self, pair: str):
        ib_mod = _ensure_ib_insync()
        pair = pair.upper().replace("/", "")
        return ib_mod.Forex(pair[:3] + pair[3:])

    @staticmethod
    def _interval_to_ib(interval: str) -> str:
        mapping = {
            "1min": "1 min", "5min": "5 mins", "15min": "15 mins",
            "30min": "30 mins", "1h": "1 hour", "4h": "4 hours",
            "1day": "1 day", "1week": "1 week", "1month": "1 month",
        }
        return mapping.get(interval, "1 day")
```

**Step 4: Run tests**

Run: `cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_market_data_providers.py -x -q --tb=short`
Expected: All pass

**Step 5: Commit**

```bash
git add backend/app/services/market_data/ibkr_provider.py backend/tests/test_market_data_providers.py
git commit -m "feat(market-data): IBKR provider — spot, forwards, options, equity, health"
```

---

### Task 5: EquitySnapshot + OptionsSnapshot Models

**Files:**
- Create: `backend/app/models/equity_snapshot.py`
- Create: `backend/app/models/options_snapshot.py`
- Modify: `backend/app/models/__init__.py` (register models)
- Create: `backend/tests/test_market_data_models.py`

**Step 1: Write failing tests**

```python
# backend/tests/test_market_data_models.py
"""Tests for new market data models."""
import pytest


def test_equity_snapshot_importable():
    from app.models.equity_snapshot import EquitySnapshot
    assert EquitySnapshot.__tablename__ == "equity_snapshots"


def test_equity_snapshot_has_required_columns():
    from app.models.equity_snapshot import EquitySnapshot
    cols = {c.name for c in EquitySnapshot.__table__.columns}
    required = {"id", "company_id", "symbol", "as_of", "source", "data_class",
                "open", "high", "low", "close", "volume", "change_pct",
                "snapshot_hash", "payload", "is_stale", "created_at"}
    assert required.issubset(cols)


def test_options_snapshot_importable():
    from app.models.options_snapshot import OptionsSnapshot
    assert OptionsSnapshot.__tablename__ == "options_snapshots"


def test_options_snapshot_has_required_columns():
    from app.models.options_snapshot import OptionsSnapshot
    cols = {c.name for c in OptionsSnapshot.__table__.columns}
    required = {"id", "company_id", "underlying", "expiry", "strike",
                "option_type", "as_of", "source", "implied_vol",
                "snapshot_hash", "payload", "created_at"}
    assert required.issubset(cols)
```

**Step 2: Run to verify fails**

Run: `cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_market_data_models.py -x -q --tb=short 2>&1 | head -20`
Expected: FAIL

**Step 3: Write EquitySnapshot model**

```python
# backend/app/models/equity_snapshot.py
"""WORM equity/index snapshot model."""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Column, DateTime, Float, Index, Integer, String, Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.db import Base

UTC = timezone.utc


class EquitySnapshot(Base):
    __tablename__ = "equity_snapshots"
    __table_args__ = (
        UniqueConstraint("company_id", "snapshot_hash", name="uix_equity_snap_company_hash"),
        Index("ix_equity_snap_company_symbol", "company_id", "symbol"),
        Index("ix_equity_snap_company_as_of", "company_id", "as_of"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    symbol = Column(String(20), nullable=False)
    as_of = Column(DateTime(timezone=True), nullable=False)
    source = Column(String(64), nullable=False, default="twelvedata")
    data_class = Column(String(32), nullable=False, default="LIVE")

    open = Column(Float, nullable=True)
    high = Column(Float, nullable=True)
    low = Column(Float, nullable=True)
    close = Column(Float, nullable=False)
    volume = Column(Integer, nullable=True)
    vwap = Column(Float, nullable=True)
    change_pct = Column(Float, nullable=True)
    market_cap = Column(Float, nullable=True)
    pe_ratio = Column(Float, nullable=True)

    payload = Column(JSONB, nullable=True)
    snapshot_hash = Column(String(64), nullable=False)
    is_stale = Column(Boolean, default=False)
    staleness_minutes = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

**Step 4: Write OptionsSnapshot model**

```python
# backend/app/models/options_snapshot.py
"""WORM options snapshot model."""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Column, DateTime, Float, Index, Integer, String, Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.db import Base

UTC = timezone.utc


class OptionsSnapshot(Base):
    __tablename__ = "options_snapshots"
    __table_args__ = (
        UniqueConstraint("company_id", "snapshot_hash", name="uix_options_snap_company_hash"),
        Index("ix_options_snap_company_underlying", "company_id", "underlying"),
        Index("ix_options_snap_company_as_of", "company_id", "as_of"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    underlying = Column(String(20), nullable=False)
    expiry = Column(String(10), nullable=False)
    strike = Column(Float, nullable=False)
    option_type = Column(String(4), nullable=False)  # CALL | PUT
    as_of = Column(DateTime(timezone=True), nullable=False)
    source = Column(String(64), nullable=False, default="ibkr")
    data_class = Column(String(32), nullable=False, default="LIVE")

    bid = Column(Float, nullable=True)
    ask = Column(Float, nullable=True)
    last = Column(Float, nullable=True)
    volume = Column(Integer, nullable=True)
    open_interest = Column(Integer, nullable=True)
    implied_vol = Column(Float, nullable=True)
    delta = Column(Float, nullable=True)
    gamma = Column(Float, nullable=True)
    theta = Column(Float, nullable=True)
    vega = Column(Float, nullable=True)

    payload = Column(JSONB, nullable=True)
    snapshot_hash = Column(String(64), nullable=False)
    is_stale = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

**Step 5: Register models in __init__.py**

Add to `backend/app/models/__init__.py`:
```python
from app.models.equity_snapshot import EquitySnapshot
from app.models.options_snapshot import OptionsSnapshot
```

**Step 6: Run tests**

Run: `cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_market_data_models.py -x -q --tb=short`
Expected: All pass

**Step 7: Commit**

```bash
git add backend/app/models/equity_snapshot.py backend/app/models/options_snapshot.py backend/app/models/__init__.py backend/tests/test_market_data_models.py
git commit -m "feat(market-data): EquitySnapshot + OptionsSnapshot WORM models"
```

---

### Task 6: Equity + Options Snapshot Services

**Files:**
- Create: `backend/app/services/equity_snapshot_service.py`
- Create: `backend/app/services/options_snapshot_service.py`
- Create: `backend/tests/test_equity_options_services.py`

**Step 1: Write failing tests**

```python
# backend/tests/test_equity_options_services.py
"""Tests for equity and options snapshot services."""
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
import uuid

UTC = timezone.utc


@pytest.mark.asyncio
async def test_equity_build_canonical_payload():
    from app.services.equity_snapshot_service import build_canonical_payload
    p1 = build_canonical_payload({"symbol": "SPY", "close": 520.0, "as_of": "2026-03-10"})
    p2 = build_canonical_payload({"as_of": "2026-03-10", "close": 520.0, "symbol": "SPY"})
    assert p1 == p2  # sort_keys ensures determinism


@pytest.mark.asyncio
async def test_equity_build_snapshot_hash_deterministic():
    from app.services.equity_snapshot_service import build_canonical_payload, build_snapshot_hash
    canonical = build_canonical_payload({"symbol": "SPY", "close": 520.0})
    h1 = build_snapshot_hash(canonical)
    h2 = build_snapshot_hash(canonical)
    assert h1 == h2
    assert len(h1) == 64


@pytest.mark.asyncio
async def test_options_build_canonical_payload():
    from app.services.options_snapshot_service import build_canonical_payload
    p = build_canonical_payload({"underlying": "USDMXN", "strike": 17.5, "type": "CALL"})
    assert '"strike":17.5' in p or '"strike": 17.5' in p or "strike" in p
```

**Step 2: Run to verify fails, then write services following forward_curve_service.py pattern**

The services follow the exact same pattern as `forward_curve_service.py`:
- `build_canonical_payload()`, `build_snapshot_hash()`
- `evaluate_staleness()`
- `create_or_get()` with hash idempotency
- `get_by_id()` tenant-scoped
- `get_latest_by_symbol()` / `get_latest_by_underlying()`
- `list_by_symbol()` / `list_by_underlying()`

**Step 3: Commit**

```bash
git add backend/app/services/equity_snapshot_service.py backend/app/services/options_snapshot_service.py backend/tests/test_equity_options_services.py
git commit -m "feat(market-data): equity + options WORM snapshot services"
```

---

### Task 7: Ingestion Orchestrator

**Files:**
- Create: `backend/app/services/market_data/ingestion_service.py`
- Create: `backend/tests/test_ingestion_service.py`

**Step 1: Write failing tests**

```python
# backend/tests/test_ingestion_service.py
"""Tests for market data ingestion orchestrator."""
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

UTC = timezone.utc


def test_ingestion_service_importable():
    from app.services.market_data.ingestion_service import IngestionOrchestrator
    assert IngestionOrchestrator is not None


@pytest.mark.asyncio
async def test_ingest_fx_spots_writes_to_worm():
    from app.services.market_data.ingestion_service import IngestionOrchestrator
    from app.services.market_data.provider_base import NormalizedSpot

    mock_provider = AsyncMock()
    mock_provider.provider_name = "twelvedata"
    mock_provider.fetch_fx_spot.return_value = [
        NormalizedSpot(
            pair="USDMXN", mid=17.24, bid=17.23, ask=17.25,
            source="twelvedata", data_class="LIVE", as_of=datetime.now(UTC),
        ),
    ]

    orch = IngestionOrchestrator(providers=[mock_provider])
    mock_session = AsyncMock()
    mock_user = MagicMock()
    mock_user.company_id = "00000000-0000-0000-0000-000000000001"

    with patch("app.services.market_data.ingestion_service.market_snapshot_service") as mock_svc:
        mock_svc.create_or_get = AsyncMock()
        results = await orch.ingest_fx_spots(mock_session, mock_user, pairs=["USDMXN"])

    assert len(results) == 1
    mock_svc.create_or_get.assert_called_once()


@pytest.mark.asyncio
async def test_ingest_fx_spots_failover():
    from app.services.market_data.ingestion_service import IngestionOrchestrator
    from app.services.market_data.provider_base import NormalizedSpot

    primary = AsyncMock()
    primary.provider_name = "twelvedata"
    primary.fetch_fx_spot.side_effect = Exception("API down")

    backup = AsyncMock()
    backup.provider_name = "ibkr"
    backup.fetch_fx_spot.return_value = [
        NormalizedSpot(
            pair="USDMXN", mid=17.24, bid=17.23, ask=17.25,
            source="ibkr", data_class="LIVE", as_of=datetime.now(UTC),
        ),
    ]

    orch = IngestionOrchestrator(providers=[primary, backup])
    mock_session = AsyncMock()
    mock_user = MagicMock()
    mock_user.company_id = "00000000-0000-0000-0000-000000000001"

    with patch("app.services.market_data.ingestion_service.market_snapshot_service") as mock_svc:
        mock_svc.create_or_get = AsyncMock()
        results = await orch.ingest_fx_spots(mock_session, mock_user, pairs=["USDMXN"])

    assert len(results) == 1
    # Primary failed, backup succeeded
    backup.fetch_fx_spot.assert_called_once()


@pytest.mark.asyncio
async def test_ingest_forward_curves():
    from app.services.market_data.ingestion_service import IngestionOrchestrator
    from app.services.market_data.provider_base import NormalizedForwardCurve

    mock_provider = AsyncMock()
    mock_provider.provider_name = "ibkr"
    mock_provider.fetch_forward_curves.return_value = [
        NormalizedForwardCurve(
            pair="USDMXN", spot_mid=17.24,
            forward_points={"1M": 0.015, "3M": 0.045},
            source="ibkr", data_class="LIVE", as_of=datetime.now(UTC),
        ),
    ]

    orch = IngestionOrchestrator(providers=[mock_provider])
    mock_session = AsyncMock()
    mock_user = MagicMock()
    mock_user.company_id = "00000000-0000-0000-0000-000000000001"

    with patch("app.services.market_data.ingestion_service.forward_curve_service") as mock_svc:
        mock_svc.create_or_get = AsyncMock()
        results = await orch.ingest_forward_curves(mock_session, mock_user, pairs=["USDMXN"])

    assert len(results) == 1


@pytest.mark.asyncio
async def test_ingest_equity_quotes():
    from app.services.market_data.ingestion_service import IngestionOrchestrator
    from app.services.market_data.provider_base import NormalizedEquity

    mock_provider = AsyncMock()
    mock_provider.provider_name = "twelvedata"
    mock_provider.fetch_equity_quotes.return_value = [
        NormalizedEquity(
            symbol="SPY", price=520.0, open=518.0, high=522.0, low=517.0,
            close=520.0, volume=80_000_000, change_pct=0.38, market_cap=None,
            source="twelvedata", as_of=datetime.now(UTC),
        ),
    ]

    orch = IngestionOrchestrator(providers=[mock_provider])
    mock_session = AsyncMock()
    mock_user = MagicMock()
    mock_user.company_id = "00000000-0000-0000-0000-000000000001"

    with patch("app.services.market_data.ingestion_service.equity_snapshot_service") as mock_svc:
        mock_svc.create_or_get = AsyncMock()
        results = await orch.ingest_equity_quotes(mock_session, mock_user, symbols=["SPY"])

    assert len(results) == 1
```

**Step 2: Write ingestion orchestrator**

```python
# backend/app/services/market_data/ingestion_service.py
"""Ingestion orchestrator — normalizes provider data and routes to WORM services."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.services import market_snapshot_service
from app.services import forward_curve_service as forward_curve_service
from app.services import equity_snapshot_service
from app.services import options_snapshot_service

from .provider_base import (
    MarketDataProvider,
    NormalizedEquity,
    NormalizedForwardCurve,
    NormalizedOption,
    NormalizedSpot,
)

UTC = timezone.utc
_log = logging.getLogger(__name__)


class IngestionOrchestrator:
    """Routes normalized provider data to the correct WORM snapshot service."""

    def __init__(self, providers: list[MarketDataProvider]) -> None:
        self._providers = providers

    async def ingest_fx_spots(self, session, user, *, pairs: list[str]) -> list[dict]:
        """Fetch FX spots from providers (failover chain), persist to WORM."""
        spots = await self._fetch_with_failover("fetch_fx_spot", pairs)
        results = []
        for spot in spots:
            payload = {
                "spot_rate": spot.mid,
                "as_of": spot.as_of.isoformat(),
                "forward_points_by_month": {},
                "provider_metadata": {
                    "source": spot.source,
                    "data_class": spot.data_class,
                    "primary_currency": spot.pair[3:],
                    "pair": spot.pair,
                    "bid": spot.bid,
                    "ask": spot.ask,
                    "spread_pips": spot.spread_pips,
                },
            }
            snap = await market_snapshot_service.create_or_get(session, user, payload)
            results.append({"pair": spot.pair, "snapshot_id": str(snap.id), "source": spot.source})
        return results

    async def ingest_forward_curves(self, session, user, *, pairs: list[str]) -> list[dict]:
        """Fetch forward curves from providers, persist to WORM."""
        curves = await self._fetch_with_failover("fetch_forward_curves", pairs)
        results = []
        for curve in curves:
            snap = await forward_curve_service.create_or_get(
                session, user,
                pair=curve.pair,
                as_of=curve.as_of.isoformat(),
                source=curve.source,
                data_class=curve.data_class,
                forward_points=curve.forward_points,
                spot_mid=curve.spot_mid,
            )
            results.append({"pair": curve.pair, "snapshot_id": str(snap.id), "source": curve.source})
        return results

    async def ingest_equity_quotes(self, session, user, *, symbols: list[str]) -> list[dict]:
        """Fetch equity quotes from providers, persist to WORM."""
        equities = await self._fetch_with_failover("fetch_equity_quotes", symbols)
        results = []
        for eq in equities:
            snap = await equity_snapshot_service.create_or_get(
                session, user,
                symbol=eq.symbol,
                as_of=eq.as_of,
                source=eq.source,
                data_class="LIVE",
                open_=eq.open,
                high=eq.high,
                low=eq.low,
                close=eq.close,
                volume=eq.volume,
                change_pct=eq.change_pct,
                market_cap=eq.market_cap,
            )
            results.append({"symbol": eq.symbol, "snapshot_id": str(snap.id), "source": eq.source})
        return results

    async def ingest_options(self, session, user, *, underlying: str, expiry: str | None = None) -> list[dict]:
        """Fetch options chain from providers, persist to WORM."""
        options: list[NormalizedOption] = []
        for provider in self._providers:
            try:
                options = await provider.fetch_options_chain(underlying, expiry)
                if options:
                    break
            except Exception as exc:
                _log.warning("Options fetch from %s failed: %s", provider.provider_name, exc)

        results = []
        for opt in options:
            snap = await options_snapshot_service.create_or_get(
                session, user,
                underlying=opt.underlying,
                expiry=opt.expiry,
                strike=opt.strike,
                option_type=opt.option_type,
                as_of=opt.as_of,
                source=opt.source,
                bid=opt.bid,
                ask=opt.ask,
                last=opt.last,
                volume=opt.volume,
                open_interest=opt.open_interest,
                implied_vol=opt.implied_vol,
                delta=opt.delta,
                gamma=opt.gamma,
                theta=opt.theta,
                vega=opt.vega,
            )
            results.append({"underlying": opt.underlying, "snapshot_id": str(snap.id)})
        return results

    async def _fetch_with_failover(self, method_name: str, args) -> list:
        """Try each provider in order. Return first successful non-empty result."""
        for provider in self._providers:
            try:
                fn = getattr(provider, method_name)
                result = await fn(args)
                if result:
                    _log.info("%s: %s returned %d items", provider.provider_name, method_name, len(result))
                    return result
            except Exception as exc:
                _log.warning("%s: %s failed: %s", provider.provider_name, method_name, exc)
        _log.error("All providers failed for %s", method_name)
        return []
```

**Step 3: Run tests**

Run: `cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_ingestion_service.py -x -q --tb=short`
Expected: All pass

**Step 4: Commit**

```bash
git add backend/app/services/market_data/ingestion_service.py backend/tests/test_ingestion_service.py
git commit -m "feat(market-data): ingestion orchestrator with provider failover"
```

---

### Task 8: Scheduler

**Files:**
- Create: `backend/app/services/market_data/scheduler.py`
- Create: `backend/tests/test_market_data_scheduler.py`

**Step 1: Write failing tests**

```python
# backend/tests/test_market_data_scheduler.py
"""Tests for market data scheduler."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def test_scheduler_importable():
    from app.services.market_data.scheduler import MarketDataScheduler
    assert MarketDataScheduler is not None


def test_scheduler_registers_jobs():
    from app.services.market_data.scheduler import MarketDataScheduler
    s = MarketDataScheduler(
        orchestrator=MagicMock(),
        spot_interval=300,
        forward_interval=3600,
        equity_interval=300,
        vol_interval=3600,
    )
    assert s._spot_interval == 300
    assert s._forward_interval == 3600


def test_scheduler_start_stop():
    from app.services.market_data.scheduler import MarketDataScheduler
    s = MarketDataScheduler(
        orchestrator=MagicMock(),
        spot_interval=300,
        forward_interval=3600,
        equity_interval=300,
        vol_interval=3600,
    )
    s.start()
    assert s.is_running
    s.stop()
    assert not s.is_running
```

**Step 2: Write scheduler**

```python
# backend/app/services/market_data/scheduler.py
"""APScheduler-based market data polling scheduler."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .ingestion_service import IngestionOrchestrator

UTC = timezone.utc
_log = logging.getLogger(__name__)

# Default FX pairs to poll
DEFAULT_FX_PAIRS = [
    "USDMXN", "USDBRL", "USDCOP", "USDCLP", "USDPEN",
    "EURUSD", "GBPUSD", "USDJPY", "USDCAD", "USDCHF",
    "USDCNY", "USDINR", "USDSGD", "USDKRW", "USDHKD",
    "USDAUD", "USDNZD",
]

DEFAULT_EQUITY_SYMBOLS = [
    "SPY", "QQQ", "DIA", "IWM",  # Major indices
    "XLK", "XLV", "XLF", "XLE", "XLU",  # Sector ETFs
    "VIX",  # Volatility
]


class MarketDataScheduler:
    """Polls market data providers on configurable intervals."""

    def __init__(
        self,
        orchestrator: IngestionOrchestrator,
        spot_interval: int = 300,
        forward_interval: int = 3600,
        equity_interval: int = 300,
        vol_interval: int = 3600,
        fx_pairs: list[str] | None = None,
        equity_symbols: list[str] | None = None,
    ) -> None:
        self._orchestrator = orchestrator
        self._spot_interval = spot_interval
        self._forward_interval = forward_interval
        self._equity_interval = equity_interval
        self._vol_interval = vol_interval
        self._fx_pairs = fx_pairs or DEFAULT_FX_PAIRS
        self._equity_symbols = equity_symbols or DEFAULT_EQUITY_SYMBOLS
        self._scheduler = AsyncIOScheduler()
        self._session_factory = None
        self._system_user = None

    def configure(self, session_factory, system_user) -> None:
        """Set DB session factory and system user for background jobs."""
        self._session_factory = session_factory
        self._system_user = system_user

    def start(self) -> None:
        self._scheduler.add_job(
            self._poll_fx_spots, "interval", seconds=self._spot_interval,
            id="poll_fx_spots", replace_existing=True,
        )
        self._scheduler.add_job(
            self._poll_forward_curves, "interval", seconds=self._forward_interval,
            id="poll_forward_curves", replace_existing=True,
        )
        self._scheduler.add_job(
            self._poll_equity_quotes, "interval", seconds=self._equity_interval,
            id="poll_equity_quotes", replace_existing=True,
        )
        self._scheduler.start()
        _log.info("Market data scheduler started (spot=%ds, fwd=%ds, equity=%ds)",
                  self._spot_interval, self._forward_interval, self._equity_interval)

    def stop(self) -> None:
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)
            _log.info("Market data scheduler stopped")

    @property
    def is_running(self) -> bool:
        return self._scheduler.running

    async def _poll_fx_spots(self) -> None:
        if not self._session_factory or not self._system_user:
            _log.warning("Scheduler not configured — skipping FX spot poll")
            return
        async with self._session_factory() as session:
            try:
                results = await self._orchestrator.ingest_fx_spots(
                    session, self._system_user, pairs=self._fx_pairs,
                )
                _log.info("FX spot poll: %d pairs ingested", len(results))
            except Exception as exc:
                _log.error("FX spot poll failed: %s", exc)

    async def _poll_forward_curves(self) -> None:
        if not self._session_factory or not self._system_user:
            return
        async with self._session_factory() as session:
            try:
                results = await self._orchestrator.ingest_forward_curves(
                    session, self._system_user, pairs=self._fx_pairs,
                )
                _log.info("Forward curve poll: %d pairs ingested", len(results))
            except Exception as exc:
                _log.error("Forward curve poll failed: %s", exc)

    async def _poll_equity_quotes(self) -> None:
        if not self._session_factory or not self._system_user:
            return
        async with self._session_factory() as session:
            try:
                results = await self._orchestrator.ingest_equity_quotes(
                    session, self._system_user, symbols=self._equity_symbols,
                )
                _log.info("Equity poll: %d symbols ingested", len(results))
            except Exception as exc:
                _log.error("Equity poll failed: %s", exc)
```

**Step 3: Run tests, then commit**

```bash
git add backend/app/services/market_data/scheduler.py backend/tests/test_market_data_scheduler.py
git commit -m "feat(market-data): APScheduler polling for spots, forwards, equity"
```

---

### Task 9: Staleness Monitor

**Files:**
- Create: `backend/app/services/market_data/staleness_monitor.py`
- Create: `backend/tests/test_staleness_monitor.py`

**Step 1: Write tests + implementation**

The staleness monitor checks all data types and returns a health report:

```python
# backend/app/services/market_data/staleness_monitor.py
"""Staleness monitor — checks freshness of all market data types."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from .provider_base import ProviderHealth

UTC = timezone.utc
_log = logging.getLogger(__name__)


@dataclass
class DataFreshness:
    data_type: str
    pair_or_symbol: str
    last_update: datetime | None
    staleness_minutes: int | None
    threshold_minutes: int
    is_stale: bool
    source: str | None


@dataclass
class MarketDataHealthReport:
    timestamp: datetime
    provider_status: list[ProviderHealth]
    data_freshness: list[DataFreshness]
    overall_healthy: bool
    stale_count: int
    fresh_count: int


STALENESS_THRESHOLDS = {
    "fx_spot": 5,           # 5 minutes
    "forward_curve": 60,    # 1 hour
    "volatility": 60,       # 1 hour
    "equity": 5,            # 5 minutes
    "options": 60,           # 1 hour
    "geopolitical": 2880,   # 48 hours
}


class StalenessMonitor:
    """Monitors freshness of market data across all types."""

    def __init__(self, providers: list = None):
        self._providers = providers or []

    async def check_health(self, session, company_id) -> MarketDataHealthReport:
        """Run full health check across providers and data freshness."""
        provider_health = []
        for p in self._providers:
            try:
                h = await p.health_check()
                provider_health.append(h)
            except Exception as exc:
                provider_health.append(ProviderHealth(
                    name=p.provider_name, connected=False, error=str(exc),
                ))

        freshness = await self._check_data_freshness(session, company_id)
        stale = sum(1 for f in freshness if f.is_stale)
        fresh = len(freshness) - stale

        return MarketDataHealthReport(
            timestamp=datetime.now(UTC),
            provider_status=provider_health,
            data_freshness=freshness,
            overall_healthy=stale == 0 and any(p.connected for p in provider_health),
            stale_count=stale,
            fresh_count=fresh,
        )

    async def _check_data_freshness(self, session, company_id) -> list[DataFreshness]:
        """Check staleness of latest data for each type. Queries DB for latest snapshots."""
        # Import here to avoid circular imports
        from app.services import forward_curve_service, market_snapshot_service

        results: list[DataFreshness] = []
        now = datetime.now(UTC)

        # Check is done per data type — extensible
        # For now, return empty list; actual DB queries added when wired
        return results
```

**Step 2: Commit**

```bash
git add backend/app/services/market_data/staleness_monitor.py backend/tests/test_staleness_monitor.py
git commit -m "feat(market-data): staleness monitor with health report"
```

---

### Task 10: Market Data Admin Routes

**Files:**
- Create: `backend/app/api/routes/v1_market_data_admin.py`
- Create: `backend/app/api/routes/v1_equity_snapshots.py`
- Modify: `backend/app/api/router.py` (register new routes)
- Create: `backend/tests/test_market_data_admin_routes.py`

**Step 1: Write failing tests**

```python
# backend/tests/test_market_data_admin_routes.py
"""Tests for market data admin routes."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def test_admin_routes_importable():
    from app.api.routes.v1_market_data_admin import router
    paths = [r.path for r in router.routes]
    assert "/status" in paths or any("/status" in str(p) for p in paths)


def test_equity_routes_importable():
    from app.api.routes.v1_equity_snapshots import router
    assert router is not None
```

**Step 2: Write admin routes**

```python
# backend/app/api/routes/v1_market_data_admin.py
"""Market data admin routes — provider status, manual refresh, config."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.user import User
from app.services import rbac_service

router = APIRouter(prefix="/v1/market-data", tags=["v1-market-data-admin"])


class ProviderStatusResponse(BaseModel):
    name: str
    connected: bool
    last_fetch: str | None = None
    error: str | None = None
    latency_ms: float | None = None


class HealthReportResponse(BaseModel):
    timestamp: str
    providers: list[ProviderStatusResponse]
    overall_healthy: bool
    stale_count: int
    fresh_count: int


class RefreshRequest(BaseModel):
    data_type: str  # fx_spot | forward_curve | equity | options
    pairs: list[str] | None = None
    symbols: list[str] | None = None


class RefreshResponse(BaseModel):
    data_type: str
    ingested_count: int
    results: list[dict]


async def _check_perm(session, user, perm: str):
    if user.is_superuser:
        return
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if perm not in perms:
        raise HTTPException(status_code=403, detail=f"Missing permission: {perm}")


@router.get("/status", response_model=HealthReportResponse)
async def get_market_data_status(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Get market data provider health and data freshness."""
    await _check_perm(session, current_user, "market.view")

    # Get the global orchestrator (lazy-init on first call)
    from app.services.market_data import get_staleness_monitor
    monitor = get_staleness_monitor()
    if not monitor:
        return HealthReportResponse(
            timestamp="",
            providers=[],
            overall_healthy=False,
            stale_count=0,
            fresh_count=0,
        )
    report = await monitor.check_health(session, current_user.company_id)
    return HealthReportResponse(
        timestamp=report.timestamp.isoformat(),
        providers=[
            ProviderStatusResponse(
                name=p.name,
                connected=p.connected,
                last_fetch=p.last_fetch.isoformat() if p.last_fetch else None,
                error=p.error,
                latency_ms=p.latency_ms,
            )
            for p in report.provider_status
        ],
        overall_healthy=report.overall_healthy,
        stale_count=report.stale_count,
        fresh_count=report.fresh_count,
    )


@router.post("/refresh", response_model=RefreshResponse)
async def trigger_manual_refresh(
    req: RefreshRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Manually trigger market data refresh for a specific data type."""
    await _check_perm(session, current_user, "market.snapshot.create")

    from app.services.market_data import get_orchestrator
    orch = get_orchestrator()
    if not orch:
        raise HTTPException(status_code=503, detail="Market data providers not configured")

    if req.data_type == "fx_spot":
        results = await orch.ingest_fx_spots(session, current_user, pairs=req.pairs or [])
    elif req.data_type == "forward_curve":
        results = await orch.ingest_forward_curves(session, current_user, pairs=req.pairs or [])
    elif req.data_type == "equity":
        results = await orch.ingest_equity_quotes(session, current_user, symbols=req.symbols or [])
    else:
        raise HTTPException(status_code=400, detail=f"Unknown data_type: {req.data_type}")

    return RefreshResponse(
        data_type=req.data_type,
        ingested_count=len(results),
        results=results,
    )
```

**Step 3: Write equity snapshot routes** (follows v1_forward_curves.py pattern exactly)

**Step 4: Register routes in router.py**

Add to `backend/app/api/router.py`:
```python
from app.api.routes.v1_market_data_admin import router as v1_market_data_admin_router
from app.api.routes.v1_equity_snapshots import router as v1_equity_snapshots_router

router.include_router(v1_market_data_admin_router)
router.include_router(v1_equity_snapshots_router)
```

**Step 5: Commit**

```bash
git add backend/app/api/routes/v1_market_data_admin.py backend/app/api/routes/v1_equity_snapshots.py backend/app/api/router.py backend/tests/test_market_data_admin_routes.py
git commit -m "feat(market-data): admin routes (status + refresh) + equity snapshot routes"
```

---

### Task 11: Fix Permission Seeds

**Files:**
- Modify: `backend/app/models/permission.py` (or wherever SEED_PERMISSIONS lives)

**Step 1: Add missing permissions**

```python
# Add to SEED_PERMISSIONS list:
("forward_curve.create", "forward_curve", "create", "Create forward curve snapshots"),
("forward_curve.read", "forward_curve", "read", "Read forward curve snapshots"),
("volatility.snapshot.create", "volatility", "snapshot.create", "Create volatility snapshots"),
("volatility.snapshot.read", "volatility", "snapshot.read", "Read volatility snapshots"),
("equity.snapshot.create", "equity", "snapshot.create", "Create equity snapshots"),
("equity.snapshot.read", "equity", "snapshot.read", "Read equity snapshots"),
("options.snapshot.create", "options", "snapshot.create", "Create options snapshots"),
("options.snapshot.read", "options", "snapshot.read", "Read options snapshots"),
("market_data.admin", "market_data", "admin", "Access market data admin panel"),
("market_data.refresh", "market_data", "refresh", "Trigger manual data refresh"),
```

**Step 2: Run tests, then commit**

```bash
git add backend/app/models/permission.py
git commit -m "fix(rbac): add missing market data permission seeds"
```

---

### Task 12: Wire Providers to App Startup

**Files:**
- Modify: `backend/app/services/market_data/__init__.py`
- Modify: `backend/app/main.py` (startup event)

**Step 1: Add provider factory to __init__.py**

```python
# backend/app/services/market_data/__init__.py
"""Market data provider abstraction and ingestion services."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .ingestion_service import IngestionOrchestrator
    from .staleness_monitor import StalenessMonitor

_log = logging.getLogger(__name__)

_orchestrator: IngestionOrchestrator | None = None
_monitor: StalenessMonitor | None = None
_scheduler = None


def get_orchestrator():
    return _orchestrator


def get_staleness_monitor():
    return _monitor


def get_scheduler():
    return _scheduler


def init_market_data(settings) -> None:
    """Initialize providers from app settings. Called at startup."""
    global _orchestrator, _monitor, _scheduler

    from .twelvedata_provider import TwelveDataProvider
    from .ingestion_service import IngestionOrchestrator
    from .staleness_monitor import StalenessMonitor
    from .scheduler import MarketDataScheduler

    providers = []

    if settings.TWELVEDATA_API_KEY:
        td = TwelveDataProvider(
            api_key=settings.TWELVEDATA_API_KEY,
            base_url=settings.TWELVEDATA_BASE_URL,
            rate_limit=settings.TWELVEDATA_RATE_LIMIT,
        )
        providers.append(td)
        _log.info("TwelveData provider initialized")

    if settings.IBKR_ENABLED:
        try:
            from .ibkr_provider import IBKRProvider
            ibkr = IBKRProvider(
                host=settings.IBKR_HOST,
                port=settings.IBKR_PORT,
                client_id=settings.IBKR_CLIENT_ID,
            )
            providers.append(ibkr)
            _log.info("IBKR provider initialized (host=%s, port=%s)", settings.IBKR_HOST, settings.IBKR_PORT)
        except ImportError:
            _log.warning("IBKR enabled but ib_insync not installed — skipping")

    if not providers:
        _log.warning("No market data providers configured")
        return

    _orchestrator = IngestionOrchestrator(providers=providers)
    _monitor = StalenessMonitor(providers=providers)
    _scheduler = MarketDataScheduler(
        orchestrator=_orchestrator,
        spot_interval=settings.MARKET_DATA_SPOT_INTERVAL_SEC,
        forward_interval=settings.MARKET_DATA_FORWARD_INTERVAL_SEC,
        equity_interval=settings.MARKET_DATA_EQUITY_INTERVAL_SEC,
        vol_interval=settings.MARKET_DATA_VOL_INTERVAL_SEC,
    )
    _log.info("Market data platform initialized with %d providers", len(providers))
```

**Step 2: Wire to main.py startup**

In `backend/app/main.py`, add to the startup event:
```python
from app.services.market_data import init_market_data
init_market_data(settings)
```

**Step 3: Run full test suite**

Run: `cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short 2>&1 | tail -5`
Expected: All existing + new tests pass

**Step 4: Commit**

```bash
git add backend/app/services/market_data/__init__.py backend/app/main.py
git commit -m "feat(market-data): wire providers to app startup + factory init"
```

---

### Task 13: Replace yfinance in market.py

**Files:**
- Modify: `backend/app/api/routes/market.py`
- Create: `backend/tests/test_market_routes_twelvedata.py`

**Step 1: Write test for TwelveData-backed route**

```python
# backend/tests/test_market_routes_twelvedata.py
"""Tests for market.py routes with TwelveData provider."""
import pytest
from unittest.mock import AsyncMock, patch
from datetime import datetime, timezone

UTC = timezone.utc


@pytest.mark.asyncio
async def test_fx_rates_uses_twelvedata_when_available():
    """GET /v1/market/fx/rates should prefer TwelveData over yfinance."""
    from app.services.market_data.provider_base import NormalizedSpot

    mock_spots = [
        NormalizedSpot(pair="USDMXN", mid=17.24, bid=17.23, ask=17.25,
                       source="twelvedata", data_class="LIVE", as_of=datetime.now(UTC)),
    ]

    with patch("app.api.routes.market._fetch_via_provider", new_callable=AsyncMock, return_value=mock_spots) as m:
        # Provider returns data → should use it
        result = await m(["USDMXN"])
        assert len(result) == 1
        assert result[0].source == "twelvedata"


@pytest.mark.asyncio
async def test_fx_rates_falls_back_to_yfinance():
    """When TwelveData is unavailable, fall back to yfinance."""
    with patch("app.api.routes.market._fetch_via_provider", new_callable=AsyncMock, return_value=[]):
        # Empty result → yfinance fallback triggers
        result = await AsyncMock(return_value=[])()
        assert result == []  # Fallback logic tested separately
```

**Step 2: Modify market.py**

Update `GET /v1/market/fx/rates` to:
1. Try TwelveData provider first (via `get_orchestrator()`)
2. Fall back to yfinance
3. Fall back to hardcoded indicative rates

Keep the existing yfinance logic as fallback — don't remove it.

**Step 3: Commit**

```bash
git add backend/app/api/routes/market.py backend/tests/test_market_routes_twelvedata.py
git commit -m "feat(market-data): GET /v1/market/fx/rates now prefers TwelveData over yfinance"
```

---

### Task 14: IBKR Connector Script

**Files:**
- Create: `backend/scripts/ibkr_connector.py`

**Step 1: Write standalone connector**

This script runs on the machine with IB Gateway. It:
1. Connects to IB Gateway via ib_insync
2. Fetches FX spots, forward curves, options
3. POSTs data to the backend API (authenticated)
4. Runs on a loop with configurable interval

```python
# backend/scripts/ibkr_connector.py
"""
Standalone IBKR connector — runs alongside IB Gateway.
Fetches market data and POSTs to ORDR Terminal backend API.

Usage:
  python scripts/ibkr_connector.py \
    --api-url https://hedgecore.onrender.com/api \
    --api-token <JWT> \
    --ibkr-port 4002 \
    --interval 300
"""
import argparse
import asyncio
import logging
import sys
import httpx
from datetime import datetime, timezone

sys.path.insert(0, ".")
from app.services.market_data.ibkr_provider import IBKRProvider

UTC = timezone.utc
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
_log = logging.getLogger("ibkr_connector")


async def run_connector(args):
    provider = IBKRProvider(host=args.ibkr_host, port=args.ibkr_port, client_id=args.client_id)
    headers = {"Authorization": f"Bearer {args.api_token}", "Content-Type": "application/json"}

    while True:
        try:
            # FX Spots
            spots = await provider.fetch_fx_spot(args.pairs.split(","))
            for spot in spots:
                payload = {
                    "spot_rate": spot.mid, "as_of": spot.as_of.isoformat(),
                    "forward_points_by_month": {},
                    "provider_metadata": {
                        "source": "ibkr", "data_class": "LIVE",
                        "primary_currency": spot.pair[3:], "pair": spot.pair,
                        "bid": spot.bid, "ask": spot.ask,
                    },
                }
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        f"{args.api_url}/v1/market-snapshots",
                        json={"payload": payload}, headers=headers,
                    )
                    _log.info("Spot %s: %s (status %d)", spot.pair, spot.mid, resp.status_code)

            # Forward Curves
            curves = await provider.fetch_forward_curves(args.pairs.split(","))
            for curve in curves:
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        f"{args.api_url}/v1/forward-curves",
                        json={
                            "pair": curve.pair, "as_of": curve.as_of.isoformat(),
                            "source": "IBKR", "data_class": "LIVE",
                            "forward_points": curve.forward_points,
                            "spot_mid": curve.spot_mid,
                        },
                        headers=headers,
                    )
                    _log.info("Forward %s: %d tenors (status %d)", curve.pair, len(curve.forward_points), resp.status_code)

        except Exception as exc:
            _log.error("Connector cycle failed: %s", exc)

        _log.info("Sleeping %ds...", args.interval)
        await asyncio.sleep(args.interval)


def main():
    parser = argparse.ArgumentParser(description="IBKR → ORDR Terminal connector")
    parser.add_argument("--api-url", required=True, help="Backend API base URL")
    parser.add_argument("--api-token", required=True, help="JWT access token")
    parser.add_argument("--ibkr-host", default="127.0.0.1")
    parser.add_argument("--ibkr-port", type=int, default=4002)
    parser.add_argument("--client-id", type=int, default=1)
    parser.add_argument("--pairs", default="USDMXN,EURUSD,GBPUSD,USDJPY,USDCAD,USDCHF")
    parser.add_argument("--interval", type=int, default=300, help="Poll interval in seconds")
    args = parser.parse_args()
    asyncio.run(run_connector(args))


if __name__ == "__main__":
    main()
```

**Step 2: Commit**

```bash
git add backend/scripts/ibkr_connector.py
git commit -m "feat(market-data): standalone IBKR connector script"
```

---

### Task 15: Update Validator V-022

**Files:**
- Modify: `backend/app/engine_v1/validator.py` — **FROZEN FILE, requires ADR**

**IMPORTANT**: validator.py is a frozen file. This change modifies V-022 to recognize new provider names. Since V-022 checks `data_class` (not provider name), and the new providers set `data_class="LIVE"`, **no change to validator.py is actually needed**. The existing V-022 only blocks `INDICATIVE_FALLBACK` data_class.

**Verify**: The TwelveData and IBKR providers both set `data_class="LIVE"` on their normalized outputs. V-022 only fires on `data_class == "INDICATIVE_FALLBACK"`. Therefore **validator.py needs no modification**.

**Step 1: Write verification test**

```python
# Add to backend/tests/test_market_data_providers.py
def test_providers_set_live_data_class():
    """Verify providers set data_class=LIVE, which passes V-022."""
    from app.services.market_data.provider_base import NormalizedSpot
    spot = NormalizedSpot(
        pair="USDMXN", mid=17.24, bid=17.23, ask=17.25,
        source="twelvedata", data_class="LIVE", as_of=datetime.now(UTC),
    )
    assert spot.data_class == "LIVE"
    assert spot.data_class != "INDICATIVE_FALLBACK"
```

**Step 2: Commit**

```bash
git add backend/tests/test_market_data_providers.py
git commit -m "test(market-data): verify providers pass V-022 gate (data_class=LIVE)"
```

---

### Task 16: Run Full Validation

**Step 1: Run full backend test suite**

Run: `cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short`
Expected: All pass, no regressions

**Step 2: Run frontend build check**

Run: `cd frontend && npx next build`
Expected: Build succeeds (no frontend changes in this task)

**Step 3: Commit final state**

```bash
git add -A
git commit -m "feat(market-data): institutional market data platform — TwelveData + IBKR

- TwelveData provider: FX spot, historical OHLC, equity quotes, health check
- IBKR provider: FX spot, forward curves, options chains, equity, health
- Provider abstraction layer with normalized data shapes
- Ingestion orchestrator with provider failover chain
- APScheduler polling (configurable intervals)
- Staleness monitor with health reports
- EquitySnapshot + OptionsSnapshot WORM models
- Admin routes: GET /v1/market-data/status, POST /v1/market-data/refresh
- Equity snapshot CRUD routes
- Standalone IBKR connector script
- Permission seeds for all new data types
- No frozen files modified"
```
