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
            import nest_asyncio
            nest_asyncio.apply()
        except ImportError:
            pass
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
        contract = self._make_forex_contract(symbol)
        await self._ib.qualifyContractsAsync(contract)
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
                await self._ib.qualifyContractsAsync(contract)
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
        await self._ib.qualifyContractsAsync(contract)
        ticker = self._ib.reqMktData(contract, snapshot=True)
        await self._ib.sleep(2)
        return ticker

    async def _fetch_fx_forwards_raw(self, pair: str) -> tuple[float, list[dict]]:
        """Fetch forward points from IBKR. Returns (spot_mid, [{tenor, points}])."""
        if not self.is_connected:
            await self.connect()

        contract = self._make_forex_contract(pair)
        await self._ib.qualifyContractsAsync(contract)
        ticker = self._ib.reqMktData(contract, snapshot=True)
        await self._ib.sleep(2)
        spot = ticker.midpoint() if callable(getattr(ticker, "midpoint", None)) else 0.0

        # Forward points via swap rates — placeholder for actual IBKR swap data
        tenors = ["1M", "3M", "6M", "9M", "12M"]
        curves = [{"tenor": t, "points": 0.0} for t in tenors]

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

        await self._ib.qualifyContractsAsync(contract)
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
        for strike in strikes[:20]:  # Limit to prevent excessive API calls
            for right in ("C", "P"):
                try:
                    opt = ib_mod.Option(underlying, target_expiry, strike, right, chain.exchange)
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
