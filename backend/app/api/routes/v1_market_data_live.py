"""
Live market data routes -- /api/v1/market-data/live

Endpoints:
  GET /v1/market-data/live/fx-rates       -> live FX spot rates
  GET /v1/market-data/live/equity-quotes  -> live equity/ETF quotes
  GET /v1/market-data/live/macro          -> macro instruments (DXY, VIX, etc.)
  GET /v1/market-data/live/quote          -> single instrument quote
  GET /v1/market-data/live/fx-change      -> FX daily % change

Provider priority: IBKR (if enabled) → TwelveData (if API key set) → 503
Public endpoints (no JWT required) — market data is publicly available.
Called server-to-server by Next.js API routes.
In-memory TTL cache prevents excessive provider polling.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.core.config import settings

router = APIRouter(prefix="/v1/market-data/live", tags=["v1-market-data-live"])
_log = logging.getLogger(__name__)

UTC = timezone.utc

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_FX_PAIRS = ["USDMXN", "EURUSD", "GBPUSD", "USDJPY", "USDCAD", "USDCHF", "AUDUSD", "USDCNH"]

DEFAULT_EQUITY_SYMBOLS = [
    "SPY", "QQQ", "DIA", "IWM", "XLK", "XLF", "XLE", "XLV",
    "XLY", "XLP", "XLI", "XLU", "XLB", "XLRE", "XLC",
]

SYMBOL_NAMES: dict[str, str] = {
    "SPY": "S&P 500",
    "QQQ": "Nasdaq 100",
    "DIA": "Dow Jones",
    "IWM": "Russell 2000",
    "XLK": "Technology",
    "XLF": "Financials",
    "XLE": "Energy",
    "XLV": "Healthcare",
    "XLY": "Consumer Discr.",
    "XLP": "Consumer Staples",
    "XLI": "Industrials",
    "XLU": "Utilities",
    "XLB": "Materials",
    "XLRE": "Real Estate",
    "XLC": "Communications",
}

SYMBOL_CATEGORIES: dict[str, str] = {
    "SPY": "market", "QQQ": "market", "DIA": "market", "IWM": "market",
}

MACRO_INSTRUMENTS: dict[str, dict[str, str]] = {
    "DXY INDEX": {"label": "US Dollar Index", "unit": "index", "context": "Dollar strength"},
    "VIX INDEX": {"label": "CBOE VIX", "unit": "index", "context": "Market volatility gauge"},
    "US10Y": {"label": "US 10Y Yield", "unit": "%", "context": "Risk-free benchmark"},
    "BRENT": {"label": "Brent Crude", "unit": "USD/bbl", "context": "Energy benchmark"},
    "GOLD": {"label": "Gold", "unit": "USD/oz", "context": "Safe-haven asset"},
}

# Max reference values used for gauge rendering on frontend
MACRO_MAX_REF: dict[str, float] = {
    "DXY INDEX": 120.0,
    "VIX INDEX": 80.0,
    "US10Y": 6.0,
    "BRENT": 150.0,
    "GOLD": 3000.0,
}


# ---------------------------------------------------------------------------
# In-memory TTL cache
# ---------------------------------------------------------------------------

class _TTLCache:
    """Simple in-memory cache with per-key TTL."""

    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str, ttl_seconds: float) -> Any | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        ts, value = entry
        if time.monotonic() - ts > ttl_seconds:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any) -> None:
        self._store[key] = (time.monotonic(), value)


_cache = _TTLCache()

_CACHE_TTL_FX = 30.0       # 30 seconds for FX rates
_CACHE_TTL_EQUITY = 60.0   # 60 seconds for equity quotes
_CACHE_TTL_MACRO = 300.0   # 5 minutes for macro data
_CACHE_TTL_CHANGE = 60.0   # 60 seconds for FX change


# ---------------------------------------------------------------------------
# Shared IBKR provider accessor (mirrors v1_ibkr.py pattern)
# ---------------------------------------------------------------------------

_ibkr_provider = None
_td_provider = None


def _get_ibkr_provider():
    """Lazy-init the IBKR provider singleton."""
    global _ibkr_provider
    if _ibkr_provider is not None:
        return _ibkr_provider
    try:
        from app.services.market_data.ibkr_provider import IBKRProvider
        _ibkr_provider = IBKRProvider(
            host=settings.IBKR_HOST,
            port=settings.IBKR_PORT,
            client_id=settings.IBKR_CLIENT_ID,
        )
        return _ibkr_provider
    except Exception as exc:
        _log.warning("IBKR provider init failed: %s", exc)
        return None


# Keep old name for backward compat inside this module
_get_provider = _get_ibkr_provider


def _get_td_provider():
    """Lazy-init TwelveData provider singleton. Returns None if key not configured."""
    global _td_provider
    if _td_provider is not None:
        return _td_provider
    if not settings.TWELVEDATA_API_KEY:
        return None
    try:
        from app.services.market_data.twelvedata_provider import TwelveDataProvider
        _td_provider = TwelveDataProvider(
            api_key=settings.TWELVEDATA_API_KEY,
            base_url=settings.TWELVEDATA_BASE_URL,
            rate_limit=settings.TWELVEDATA_RATE_LIMIT,
        )
        _log.info("TwelveData provider lazy-initialized for live routes")
        return _td_provider
    except Exception as exc:
        _log.warning("TwelveData provider init failed: %s", exc)
        return None


def _require_ibkr():
    """Return IBKR provider or raise 503."""
    if not settings.IBKR_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="IBKR integration is disabled in server configuration",
        )
    provider = _get_ibkr_provider()
    if provider is None:
        raise HTTPException(
            status_code=503,
            detail="IBKR provider unavailable (ib_insync not installed or init failed)",
        )
    return provider


async def _ensure_connected(provider):
    """Ensure IBKR provider is connected, raise 502 on failure."""
    if not provider.is_connected:
        try:
            await provider.connect()
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Cannot connect to IBKR Gateway: {exc}",
            )
    if not provider.is_connected:
        raise HTTPException(
            status_code=502,
            detail="IBKR Gateway not connected after connect attempt",
        )


def _no_provider_503(detail: str = "No market data provider available") -> HTTPException:
    return HTTPException(status_code=503, detail=detail)


# ---------------------------------------------------------------------------
# Response Schemas
# ---------------------------------------------------------------------------

class FXRateItem(BaseModel):
    symbol: str
    bid: float
    ask: float
    mid: float
    spread: float


class FXRatesResponse(BaseModel):
    rates: list[FXRateItem]
    source: str = "ibkr"
    as_of: str
    connected: bool = True


class EquityQuoteItem(BaseModel):
    symbol: str
    name: str
    price: float
    change: float
    changePercent: float
    volume: int
    category: str


class EquityQuotesResponse(BaseModel):
    quotes: list[EquityQuoteItem]
    source: str = "ibkr"
    as_of: str


class MacroDataPoint(BaseModel):
    label: str
    value: float
    display: str
    maxRef: float
    trend: str
    context: str
    unit: str


class MacroResponse(BaseModel):
    macroData: dict[str, MacroDataPoint]
    source: str = "ibkr"


class SingleQuoteResponse(BaseModel):
    symbol: str
    bid: float | None = None
    ask: float | None = None
    mid: float | None = None
    last: float | None = None
    source: str = "ibkr"


class FXChangeResponse(BaseModel):
    changes: dict[str, float]
    source: str = "ibkr"


# ---------------------------------------------------------------------------
# 1. GET /fx-rates
# ---------------------------------------------------------------------------

@router.get("/fx-rates", response_model=FXRatesResponse)
async def live_fx_rates(
    request: Request,
    pairs: str = Query(default=None, description="Comma-separated FX pairs, e.g. EURUSD,USDJPY"),
):
    """Live FX spot rates. Provider chain: IBKR → TwelveData."""
    pair_list = [p.strip().upper() for p in pairs.split(",")] if pairs else DEFAULT_FX_PAIRS

    cache_key = f"fx_rates:{'|'.join(sorted(pair_list))}"
    cached = _cache.get(cache_key, _CACHE_TTL_FX)
    if cached is not None:
        return cached

    spots = None
    source = "ibkr"

    # ── Primary: IBKR ─────────────────────────────────────────────────────
    if settings.IBKR_ENABLED:
        try:
            provider = _get_ibkr_provider()
            if provider is not None:
                await _ensure_connected(provider)
                spots = await provider.fetch_fx_spot(pair_list)
        except Exception as exc:
            _log.warning("IBKR fx-rates failed, trying TwelveData: %s", exc)
            spots = None

    # ── Fallback: TwelveData ──────────────────────────────────────────────
    if not spots:
        td = _get_td_provider()
        if td is not None:
            try:
                spots = await td.fetch_fx_spot(pair_list)
                source = "twelvedata"
            except Exception as exc:
                _log.error("TwelveData fx-rates failed: %s", exc)
                spots = None

    if not spots:
        raise _no_provider_503("No market data provider available for FX rates (configure TWELVEDATA_API_KEY or enable IBKR)")

    rates = []
    for s in spots:
        spread = abs(s.ask - s.bid) * 10_000  # spread in pips
        rates.append(FXRateItem(
            symbol=s.pair,
            bid=round(s.bid, 6),
            ask=round(s.ask, 6),
            mid=round(s.mid, 6),
            spread=round(spread, 2),
        ))

    as_of = spots[0].as_of.isoformat() if spots else datetime.now(UTC).isoformat()

    response = FXRatesResponse(
        rates=rates,
        source=source,
        as_of=as_of,
        connected=True,
    )
    _cache.set(cache_key, response)
    return response


# ---------------------------------------------------------------------------
# 2. GET /equity-quotes
# ---------------------------------------------------------------------------

@router.get("/equity-quotes", response_model=EquityQuotesResponse)
async def live_equity_quotes(
    request: Request,
    symbols: str = Query(default=None, description="Comma-separated equity symbols, e.g. SPY,QQQ"),
):
    """Live equity / ETF quotes. Provider chain: IBKR → TwelveData."""
    sym_list = [s.strip().upper() for s in symbols.split(",")] if symbols else DEFAULT_EQUITY_SYMBOLS

    cache_key = f"equity_quotes:{'|'.join(sorted(sym_list))}"
    cached = _cache.get(cache_key, _CACHE_TTL_EQUITY)
    if cached is not None:
        return cached

    equities = None
    source = "ibkr"

    # ── Primary: IBKR ─────────────────────────────────────────────────────
    if settings.IBKR_ENABLED:
        try:
            provider = _get_ibkr_provider()
            if provider is not None:
                await _ensure_connected(provider)
                equities = await provider.fetch_equity_quotes(sym_list)
        except Exception as exc:
            _log.warning("IBKR equity-quotes failed, trying TwelveData: %s", exc)
            equities = None

    # ── Fallback: TwelveData ──────────────────────────────────────────────
    if not equities:
        td = _get_td_provider()
        if td is not None:
            try:
                equities = await td.fetch_equity_quotes(sym_list)
                source = "twelvedata"
            except Exception as exc:
                _log.error("TwelveData equity-quotes failed: %s", exc)
                equities = None

    if not equities:
        raise _no_provider_503("No market data provider available for equity quotes (configure TWELVEDATA_API_KEY or enable IBKR)")

    quotes = []
    for eq in equities:
        close_price = eq.close if eq.close else eq.price
        change = eq.price - close_price if close_price else 0.0
        change_pct = (change / close_price * 100) if close_price else eq.change_pct
        category = SYMBOL_CATEGORIES.get(eq.symbol, "sector")
        name = SYMBOL_NAMES.get(eq.symbol, eq.symbol)

        quotes.append(EquityQuoteItem(
            symbol=eq.symbol,
            name=name,
            price=round(eq.price, 2),
            change=round(change, 2),
            changePercent=round(change_pct, 2),
            volume=eq.volume,
            category=category,
        ))

    as_of = equities[0].as_of.isoformat() if equities else datetime.now(UTC).isoformat()

    response = EquityQuotesResponse(
        quotes=quotes,
        source=source,
        as_of=as_of,
    )
    _cache.set(cache_key, response)
    return response


# ---------------------------------------------------------------------------
# 3. GET /macro
# ---------------------------------------------------------------------------

@router.get("/macro", response_model=MacroResponse)
async def live_macro(
    request: Request,
):
    """Macro instruments (DXY, VIX, US 10Y, Brent, Gold) from IBKR Gateway."""
    cache_key = "macro_data"
    cached = _cache.get(cache_key, _CACHE_TTL_MACRO)
    if cached is not None:
        return cached

    provider = _require_ibkr()
    await _ensure_connected(provider)

    ib = provider._ib  # direct access to ib_insync.IB instance

    try:
        from app.services.market_data.ibkr_provider import _ensure_ib_insync
        ib_mod = _ensure_ib_insync()
    except ImportError:
        raise HTTPException(status_code=503, detail="ib_insync library not available")

    # Define contracts for each macro instrument
    contracts_map: dict[str, Any] = {
        "DXY INDEX": ib_mod.ContFuture("DX", "NYBOT"),
        "VIX INDEX": ib_mod.Index("VIX", "CBOE"),
        "US10Y": ib_mod.ContFuture("ZN", "CBOT"),
        "BRENT": ib_mod.ContFuture("BZ", "NYMEX"),
        "GOLD": ib_mod.ContFuture("GC", "COMEX"),
    }

    macro_data: dict[str, MacroDataPoint] = {}

    for key, contract in contracts_map.items():
        try:
            await ib.qualifyContractsAsync(contract)
            ticker = ib.reqMktData(contract, snapshot=True)
            await asyncio.sleep(2)

            mid = ticker.midpoint() if callable(getattr(ticker, "midpoint", None)) else None
            if mid is None or mid != mid:  # NaN check
                # Fallback: try bid/ask average or last
                if ticker.bid and ticker.ask and ticker.bid == ticker.bid and ticker.ask == ticker.ask:
                    mid = (ticker.bid + ticker.ask) / 2
                elif ticker.last and ticker.last == ticker.last:
                    mid = ticker.last
                else:
                    mid = 0.0

            close_price = float(getattr(ticker, "close", 0) or 0)
            if close_price and close_price == close_price:  # valid and not NaN
                trend_val = ((mid - close_price) / close_price) * 100
                if trend_val > 0.05:
                    trend = "up"
                elif trend_val < -0.05:
                    trend = "down"
                else:
                    trend = "flat"
            else:
                trend = "flat"

            info = MACRO_INSTRUMENTS[key]
            display = f"{mid:,.2f}" if mid else "N/A"

            macro_data[key] = MacroDataPoint(
                label=info["label"],
                value=round(mid, 4),
                display=display,
                maxRef=MACRO_MAX_REF.get(key, 100.0),
                trend=trend,
                context=info["context"],
                unit=info["unit"],
            )
        except Exception as exc:
            _log.warning("IBKR macro fetch for %s failed: %s", key, exc)
            info = MACRO_INSTRUMENTS[key]
            macro_data[key] = MacroDataPoint(
                label=info["label"],
                value=0.0,
                display="N/A",
                maxRef=MACRO_MAX_REF.get(key, 100.0),
                trend="flat",
                context=info["context"],
                unit=info["unit"],
            )

    response = MacroResponse(macroData=macro_data, source="ibkr")
    _cache.set(cache_key, response)
    return response


# ---------------------------------------------------------------------------
# 4. GET /quote
# ---------------------------------------------------------------------------

@router.get("/quote", response_model=SingleQuoteResponse)
async def live_quote(
    request: Request,
    symbol: str = Query(..., description="Symbol, e.g. EURUSD or SPY"),
    type: str = Query(default="fx", description="Instrument type: fx or equity"),
):
    """Single instrument quote. Provider chain: IBKR → TwelveData."""
    symbol = symbol.strip().upper()
    instrument_type = type.strip().lower()

    # ── IBKR primary ──────────────────────────────────────────────────────
    if settings.IBKR_ENABLED:
        try:
            provider = _get_ibkr_provider()
            if provider is not None:
                await _ensure_connected(provider)
                if instrument_type == "equity":
                    equities = await provider.fetch_equity_quotes([symbol])
                    if equities:
                        eq = equities[0]
                        return SingleQuoteResponse(
                            symbol=eq.symbol, bid=None, ask=None,
                            mid=round(eq.price, 4),
                            last=round(eq.close, 4) if eq.close else None,
                            source="ibkr",
                        )
                else:
                    spots = await provider.fetch_fx_spot([symbol])
                    if spots:
                        s = spots[0]
                        return SingleQuoteResponse(
                            symbol=s.pair,
                            bid=round(s.bid, 6), ask=round(s.ask, 6), mid=round(s.mid, 6),
                            last=None, source="ibkr",
                        )
        except Exception as exc:
            _log.warning("IBKR quote(%s) failed, trying TwelveData: %s", symbol, exc)

    # ── TwelveData fallback ───────────────────────────────────────────────
    td = _get_td_provider()
    if td is not None:
        try:
            if instrument_type == "equity":
                equities = await td.fetch_equity_quotes([symbol])
                if equities:
                    eq = equities[0]
                    return SingleQuoteResponse(
                        symbol=eq.symbol, bid=None, ask=None,
                        mid=round(eq.price, 4),
                        last=round(eq.close, 4) if eq.close else None,
                        source="twelvedata",
                    )
            else:
                spots = await td.fetch_fx_spot([symbol])
                if spots:
                    s = spots[0]
                    return SingleQuoteResponse(
                        symbol=s.pair,
                        bid=round(s.bid, 6), ask=round(s.ask, 6), mid=round(s.mid, 6),
                        last=None, source="twelvedata",
                    )
        except Exception as exc:
            _log.error("TwelveData quote(%s) failed: %s", symbol, exc)

    raise _no_provider_503(f"No market data provider available for symbol: {symbol}")


# ---------------------------------------------------------------------------
# 5. GET /fx-change
# ---------------------------------------------------------------------------

@router.get("/fx-change", response_model=FXChangeResponse)
async def live_fx_change(
    request: Request,
    pairs: str = Query(default=None, description="Comma-separated FX pairs"),
):
    """FX daily % change (current vs previous close). Provider chain: IBKR → TwelveData."""
    pair_list = [p.strip().upper() for p in pairs.split(",")] if pairs else DEFAULT_FX_PAIRS

    cache_key = f"fx_change:{'|'.join(sorted(pair_list))}"
    cached = _cache.get(cache_key, _CACHE_TTL_CHANGE)
    if cached is not None:
        return cached

    spots = None
    provider = None
    source = "ibkr"

    # ── Primary: IBKR ─────────────────────────────────────────────────────
    if settings.IBKR_ENABLED:
        try:
            provider = _get_ibkr_provider()
            if provider is not None:
                await _ensure_connected(provider)
                spots = await provider.fetch_fx_spot(pair_list)
        except Exception as exc:
            _log.warning("IBKR fx-change failed, trying TwelveData: %s", exc)
            provider = None
            spots = None

    # ── Fallback: TwelveData ──────────────────────────────────────────────
    if not spots:
        td = _get_td_provider()
        if td is not None:
            try:
                spots = await td.fetch_fx_spot(pair_list)
                provider = td
                source = "twelvedata"
            except Exception as exc:
                _log.error("TwelveData fx-change failed: %s", exc)
                spots = None

    if not spots:
        raise _no_provider_503("No market data provider available for FX change (configure TWELVEDATA_API_KEY or enable IBKR)")

    spot_map = {s.pair: s.mid for s in spots}

    changes: dict[str, float] = {}
    for pair in pair_list:
        current_mid = spot_map.get(pair)
        if current_mid is None or current_mid == 0:
            changes[pair] = 0.0
            continue

        try:
            bars = await provider.fetch_historical_ohlc(pair, interval="1day", outputsize=2)
            if bars and len(bars) >= 1:
                prev_close = bars[-1].close
                if prev_close and prev_close > 0:
                    pct = ((current_mid - prev_close) / prev_close) * 100
                    changes[pair] = round(pct, 4)
                else:
                    changes[pair] = 0.0
            else:
                changes[pair] = 0.0
        except Exception as exc:
            _log.warning("%s historical OHLC for %s failed: %s", source, pair, exc)
            changes[pair] = 0.0

    response = FXChangeResponse(changes=changes, source=source)
    _cache.set(cache_key, response)
    return response
