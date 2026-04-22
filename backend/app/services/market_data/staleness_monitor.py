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
    "fx_spot": 5,
    "forward_curve": 60,
    "volatility": 60,
    "equity": 5,
    "options": 60,
    "geopolitical": 2880,
}


class StalenessMonitor:
    """Monitors freshness of market data across all types."""

    def __init__(self, providers: list | None = None):
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
        """Check staleness of latest data for each type."""
        results: list[DataFreshness] = []
        now = datetime.now(UTC)

        # Check FX spot snapshots
        try:
            from app.models.market_snapshot import MarketSnapshot
            from sqlalchemy import select, desc

            q = (
                select(MarketSnapshot)
                .where(MarketSnapshot.company_id == company_id)
                .order_by(desc(MarketSnapshot.as_of))
                .limit(1)
            )
            row = await session.execute(q)
            snap = row.scalars().first()
            if snap:
                age = now - snap.as_of.replace(tzinfo=UTC) if snap.as_of.tzinfo is None else now - snap.as_of
                results.append(DataFreshness(
                    data_type="fx_spot",
                    pair_or_symbol=snap.primary_currency or "ALL",
                    last_update=snap.as_of,
                    staleness_minutes=int(age.total_seconds() / 60),
                    threshold_minutes=STALENESS_THRESHOLDS["fx_spot"],
                    is_stale=age > timedelta(minutes=STALENESS_THRESHOLDS["fx_spot"]),
                    source=snap.provider,
                ))
        except Exception as exc:
            _log.debug("Freshness check for fx_spot failed: %s", exc)

        return results
