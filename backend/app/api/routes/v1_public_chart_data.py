"""Public chart data endpoint — unauthenticated, rate-limited.

Serves OHLCV bars for the free ORDR Market page.
Restricted to major FX pairs and longer timeframes.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Path, Query, Request
from pydantic import BaseModel, Field

from app.services.market_data import get_orchestrator

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/public/chart-data", tags=["v1-public-chart-data"])

# ── Restrictions ─────────────────────────────────────────

ALLOWED_PAIRS = frozenset({
    # FX — majors, crosses & EM
    "EURUSD", "GBPUSD", "USDJPY", "USDCAD", "AUDUSD",
    "NZDUSD", "USDCHF", "EURGBP", "EURJPY", "GBPJPY",
    "USDMXN", "USDCNH", "USDZAR", "USDTRY", "AUDJPY",
    "USDBRL", "USDINR", "EURCHF", "EURAUD", "GBPAUD",
    "GBPNZD", "AUDNZD", "CADJPY", "CHFJPY", "NZDJPY",
    "USDSGD", "USDHKD", "USDNOK", "USDSEK", "USDPLN",
    "USDDKK", "USDCZK", "USDHUF",
    # Crypto
    "BTCUSD", "ETHUSD", "XRPUSD", "SOLUSD", "ADAUSD",
    "DOGEUSD", "DOTUSD", "AVAXUSD", "MATICUSD", "LINKUSD",
    "BNBUSD", "LTCUSD",
    # Indices (TwelveData format)
    "SPX", "NDX", "DJI", "IXIC", "RUT", "VIX",
    "FTSE", "DAX", "CAC", "N225", "HSI", "STOXX50E",
    # US Equities
    "SPY", "QQQ", "AAPL", "MSFT", "AMZN", "TSLA", "GOOGL", "META",
    "NVDA", "AMD", "NFLX", "DIS", "BA", "JPM", "GS", "V", "MA",
    "BRK.B", "JNJ", "PFE", "UNH", "XOM", "CVX", "WMT", "HD",
    "COST", "KO", "PEP", "MCD", "NKE", "INTC", "CRM", "ADBE",
    "PYPL", "SQ", "COIN", "PLTR", "SOFI", "RIVN", "LCID",
    # Commodities
    "XAUUSD", "XAGUSD",
    # Commodity futures (TwelveData)
    "CRUDE_OIL", "NATURAL_GAS", "COPPER", "WHEAT", "CORN",
})

ALLOWED_INTERVALS = frozenset({
    "1min", "3min", "5min", "15min", "30min",
    "1h", "4h", "1day", "1week", "1month",
})

# ── Rate limiter (IP-based, 10 req/min) ─────────────────

_rate_buckets: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT = 10
RATE_WINDOW = 60.0


def _check_rate(ip: str) -> None:
    now = time.monotonic()
    bucket = _rate_buckets[ip]
    # Prune old entries
    _rate_buckets[ip] = [t for t in bucket if now - t < RATE_WINDOW]
    if len(_rate_buckets[ip]) >= RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded ({RATE_LIMIT} requests per minute)",
        )
    _rate_buckets[ip].append(now)


# ── Response schema ──────────────────────────────────────

class OHLCVBar(BaseModel):
    t: int = Field(..., description="Unix timestamp (seconds)")
    o: float = Field(..., description="Open price")
    h: float = Field(..., description="High price")
    l: float = Field(..., description="Low price")
    c: float = Field(..., description="Close price")
    v: float = Field(..., description="Volume")


class PublicChartDataResponse(BaseModel):
    symbol: str
    interval: str
    bars: list[OHLCVBar]
    source: str
    count: int


# ── In-memory cache (shared TTL) ────────────────────────

_CACHE_TTL_S = 120  # 2 min cache for public (longer than auth)
_cache: dict[str, tuple[float, PublicChartDataResponse]] = {}


def _cache_get(key: str) -> PublicChartDataResponse | None:
    entry = _cache.get(key)
    if entry is None:
        return None
    ts, resp = entry
    if time.monotonic() - ts > _CACHE_TTL_S:
        _cache.pop(key, None)
        return None
    return resp


def _cache_set(key: str, resp: PublicChartDataResponse) -> None:
    _cache[key] = (time.monotonic(), resp)


# ── Endpoint ─────────────────────────────────────────────

@router.get("/{symbol}", response_model=PublicChartDataResponse)
async def get_public_chart_data(
    request: Request,
    symbol: str = Path(..., min_length=2, max_length=20),
    interval: str = Query("1day", description="Bar interval"),
    limit: int = Query(200, ge=1, le=500, description="Number of bars"),
) -> PublicChartDataResponse:
    """Return OHLCV bars without authentication. Rate-limited."""

    # Rate limit by IP
    client_ip = request.client.host if request.client else "unknown"
    _check_rate(client_ip)

    # Normalize
    symbol = symbol.upper().replace("/", "")

    # Validate pair
    if symbol not in ALLOWED_PAIRS:
        raise HTTPException(
            status_code=422,
            detail=f"Pair '{symbol}' not available. Allowed: {sorted(ALLOWED_PAIRS)}",
        )

    # Validate interval
    if interval not in ALLOWED_INTERVALS:
        raise HTTPException(
            status_code=422,
            detail=f"Interval '{interval}' not available. Allowed: {sorted(ALLOWED_INTERVALS)}",
        )

    # Cache check
    cache_key = f"pub:{symbol}:{interval}:{limit}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    # Fetch from providers
    orch = get_orchestrator()
    if orch is None:
        raise HTTPException(status_code=503, detail="Market data not available")

    bars_raw = []
    source = "unknown"

    for provider in orch.providers:
        try:
            bars_raw = await provider.fetch_historical_ohlc(
                symbol=symbol, interval=interval, outputsize=limit,
            )
            if bars_raw:
                source = provider.provider_name
                break
        except Exception as exc:
            _log.warning("public-chart: %s failed for %s: %s", provider.provider_name, symbol, exc)

    if not bars_raw:
        raise HTTPException(status_code=502, detail=f"No data available for {symbol}")

    bars = [
        OHLCVBar(
            t=int(bar.timestamp.timestamp()),
            o=bar.open, h=bar.high, l=bar.low, c=bar.close, v=bar.volume,
        )
        for bar in bars_raw
    ]

    resp = PublicChartDataResponse(
        symbol=symbol, interval=interval, bars=bars, source=source, count=len(bars),
    )
    _cache_set(cache_key, resp)
    return resp
