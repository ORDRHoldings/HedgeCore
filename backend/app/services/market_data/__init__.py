"""Market data provider abstraction and ingestion services."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .ingestion_service import IngestionOrchestrator
    from .staleness_monitor import StalenessMonitor
    from .scheduler import MarketDataScheduler

_log = logging.getLogger(__name__)

_orchestrator: IngestionOrchestrator | None = None
_monitor: StalenessMonitor | None = None
_scheduler: MarketDataScheduler | None = None


def get_orchestrator() -> IngestionOrchestrator | None:
    return _orchestrator


def get_staleness_monitor() -> StalenessMonitor | None:
    return _monitor


def get_scheduler() -> MarketDataScheduler | None:
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
        _log.warning("No market data providers configured — set TWELVEDATA_API_KEY or IBKR_ENABLED=true")
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
