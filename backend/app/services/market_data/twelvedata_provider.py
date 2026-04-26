"""TwelveData REST API provider for FX spot, historical OHLC, and equity quotes."""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime
from urllib.parse import urlencode

import httpx

from .provider_base import (
    MarketDataProvider,
    NormalizedEquity,
    NormalizedOHLC,
    NormalizedSpot,
    ProviderHealth,
)

UTC = UTC
_log = logging.getLogger(__name__)

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

        # Top-level error (e.g. invalid key, plan restriction) — log and bail early
        if "code" in data and "close" not in data:
            _log.error(
                "TwelveData API error (code=%s): %s — check TWELVEDATA_API_KEY and plan tier",
                data.get("code"), data.get("message", "no message"),
            )
            return []

        # Single symbol returns dict directly; multi returns dict of dicts
        if len(td_symbols) == 1 and "symbol" in data:
            data = {td_symbols[0]: data}

        results: list[NormalizedSpot] = []
        now = datetime.now(UTC)
        for td_sym in td_symbols:
            item = data.get(td_sym)
            if not item or "code" in item or "close" not in item:
                _log.warning(
                    "TwelveData: no data for %s (code=%s, msg=%s)",
                    td_sym, (item or {}).get("code", "?"), (item or {}).get("message", "?"),
                )
                continue
            ordr_pair = self._from_td_symbol(td_sym)
            close = float(item["close"])
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
        headers = {"User-Agent": "ORDR-Terminal/1.0"}
        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
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
