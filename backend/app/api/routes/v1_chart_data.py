"""Chart data endpoint — serves OHLCV bars for the frontend charting platform.

Tries TwelveData first via the market data orchestrator's provider chain,
falls back to IBKR if available.  Results are cached in-memory (60s TTL)
to reduce provider API pressure.
"""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.dependencies import get_current_user
from app.models.user import User
from app.services import rbac_service
from app.services.market_data import get_orchestrator

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/chart-data", tags=["v1-chart-data"])

# ── Allowed intervals ────────────────────────────────────

ALLOWED_INTERVALS = frozenset({
    "1min", "5min", "15min", "1h", "4h", "1day", "1week", "1month",
})

# ── Response schemas ─────────────────────────────────────

class OHLCVBar(BaseModel):
    t: int = Field(..., description="Unix timestamp (seconds)")
    o: float = Field(..., description="Open price")
    h: float = Field(..., description="High price")
    l: float = Field(..., description="Low price")
    c: float = Field(..., description="Close price")
    v: float = Field(..., description="Volume")


class ChartDataResponse(BaseModel):
    symbol: str
    interval: str
    bars: list[OHLCVBar]
    source: str
    count: int


# ── In-memory cache ──────────────────────────────────────

_CACHE_TTL_S = 60
_cache: dict[str, tuple[float, ChartDataResponse]] = {}


def _cache_get(key: str) -> ChartDataResponse | None:
    entry = _cache.get(key)
    if entry is None:
        return None
    ts, resp = entry
    if time.monotonic() - ts > _CACHE_TTL_S:
        _cache.pop(key, None)
        return None
    return resp


def _cache_set(key: str, resp: ChartDataResponse) -> None:
    _cache[key] = (time.monotonic(), resp)


# ── RBAC helper ──────────────────────────────────────────

async def _check_perm(session: AsyncSession, user: User, perm: str) -> None:
    if user.is_superuser:
        return
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if perm not in perms:
        raise HTTPException(status_code=403, detail=f"Missing permission: {perm}")


# ── Endpoint ─────────────────────────────────────────────

@router.get("/{symbol}", response_model=ChartDataResponse)
async def get_chart_data(
    symbol: str = Path(
        ..., min_length=2, max_length=20,
        description="Currency pair (e.g. USDMXN) or equity symbol (e.g. SPY)",
    ),
    interval: str = Query("1day", description="Bar interval"),
    limit: int = Query(500, ge=1, le=2000, description="Number of bars"),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> ChartDataResponse:
    """Return OHLCV bars for *symbol* at the requested *interval*."""

    # Validate interval
    if interval not in ALLOWED_INTERVALS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid interval '{interval}'. Allowed: {sorted(ALLOWED_INTERVALS)}",
        )

    # RBAC
    await _check_perm(session, current_user, "market.view")

    # Normalize symbol
    symbol = symbol.upper().replace("/", "")

    # Check cache
    cache_key = f"{symbol}:{interval}:{limit}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    # Fetch from providers
    orch = get_orchestrator()
    if orch is None:
        raise HTTPException(
            status_code=503,
            detail="No market data providers configured",
        )

    bars_raw = []
    source = "unknown"

    for provider in orch.providers:
        try:
            bars_raw = await provider.fetch_historical_ohlc(
                symbol=symbol,
                interval=interval,
                outputsize=limit,
            )
            if bars_raw:
                source = provider.provider_name
                break
        except Exception as exc:
            _log.warning(
                "chart-data: %s fetch for %s failed: %s",
                provider.provider_name, symbol, exc,
            )

    if not bars_raw:
        raise HTTPException(
            status_code=502,
            detail=f"No OHLCV data available for {symbol}",
        )

    # Convert NormalizedOHLC -> compact bar format
    bars = [
        OHLCVBar(
            t=int(bar.timestamp.timestamp()),
            o=bar.open,
            h=bar.high,
            l=bar.low,
            c=bar.close,
            v=bar.volume,
        )
        for bar in bars_raw
    ]

    resp = ChartDataResponse(
        symbol=symbol,
        interval=interval,
        bars=bars,
        source=source,
        count=len(bars),
    )

    _cache_set(cache_key, resp)
    return resp
