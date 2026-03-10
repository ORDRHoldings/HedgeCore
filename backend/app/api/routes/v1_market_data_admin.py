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


# ── Schemas ──────────────────────────────────────────────

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


# ── Helpers ──────────────────────────────────────────────

async def _check_perm(session, user, perm: str):
    if user.is_superuser:
        return
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if perm not in perms:
        raise HTTPException(status_code=403, detail=f"Missing permission: {perm}")


# ── Endpoints ────────────────────────────────────────────

@router.get("/status", response_model=HealthReportResponse)
async def get_market_data_status(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Get market data provider health and data freshness."""
    await _check_perm(session, current_user, "market.view")

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


@router.get("/providers")
async def list_providers(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """List configured market data providers and their capabilities."""
    await _check_perm(session, current_user, "market.view")

    from app.services.market_data import get_orchestrator
    orch = get_orchestrator()
    if not orch:
        return {"providers": [], "count": 0}

    providers = []
    for p in orch.providers:
        providers.append({
            "name": p.provider_name,
            "capabilities": {
                "fx_spot": True,
                "historical_ohlc": True,
                "equity_quotes": True,
                "forward_curves": hasattr(p, "fetch_forward_curves"),
                "options_chain": hasattr(p, "fetch_options_chain"),
            },
        })
    return {"providers": providers, "count": len(providers)}
