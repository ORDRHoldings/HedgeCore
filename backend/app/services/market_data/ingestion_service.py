"""Ingestion orchestrator — normalizes provider data and routes to WORM services."""
from __future__ import annotations

import logging
from datetime import UTC

from app.services import (
    equity_snapshot_service,
    forward_curve_service,
    market_snapshot_service,
    options_snapshot_service,
)

from .provider_base import (
    MarketDataProvider,
    NormalizedOption,
)

UTC = UTC
_log = logging.getLogger(__name__)


class IngestionOrchestrator:
    """Routes normalized provider data to the correct WORM snapshot service."""

    def __init__(self, providers: list[MarketDataProvider]) -> None:
        self._providers = providers

    @property
    def providers(self) -> list[MarketDataProvider]:
        return list(self._providers)

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
