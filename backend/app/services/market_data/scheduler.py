"""APScheduler-based market data polling scheduler."""
from __future__ import annotations

import logging
from datetime import timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .ingestion_service import IngestionOrchestrator

UTC = timezone.utc
_log = logging.getLogger(__name__)

DEFAULT_FX_PAIRS = [
    "USDMXN", "USDBRL", "USDCOP", "USDCLP", "USDPEN",
    "EURUSD", "GBPUSD", "USDJPY", "USDCAD", "USDCHF",
    "USDCNY", "USDINR", "USDSGD", "USDKRW", "USDHKD",
    "USDAUD", "USDNZD",
]

DEFAULT_EQUITY_SYMBOLS = [
    "SPY", "QQQ", "DIA", "IWM",
    "XLK", "XLV", "XLF", "XLE", "XLU",
    "VIX",
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
        self._stopped = False

    def configure(self, session_factory, system_user) -> None:
        """Set DB session factory and system user for background jobs."""
        self._session_factory = session_factory
        self._system_user = system_user

    def start(self) -> None:
        self._stopped = False
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
        self._stopped = True
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)
        _log.info("Market data scheduler stopped")

    @property
    def is_running(self) -> bool:
        return not self._stopped and self._scheduler.running

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
