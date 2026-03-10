"""Abstract base class and normalized data shapes for market data providers."""
from __future__ import annotations

import abc
from dataclasses import dataclass
from datetime import datetime, timezone

UTC = timezone.utc


# ── Normalized data shapes ───────────────────────────────

@dataclass(frozen=True, slots=True)
class NormalizedSpot:
    pair: str
    mid: float
    bid: float
    ask: float
    source: str
    data_class: str
    as_of: datetime

    @property
    def spread_pips(self) -> float:
        return abs(self.ask - self.bid) * 10_000


@dataclass(frozen=True, slots=True)
class NormalizedOHLC:
    symbol: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    timestamp: datetime
    source: str


@dataclass(frozen=True, slots=True)
class NormalizedEquity:
    symbol: str
    price: float
    open: float
    high: float
    low: float
    close: float
    volume: int
    change_pct: float
    market_cap: float | None
    source: str
    as_of: datetime


@dataclass(frozen=True, slots=True)
class NormalizedForwardCurve:
    pair: str
    spot_mid: float
    forward_points: dict[str, float]   # tenor_label -> points
    source: str
    data_class: str
    as_of: datetime


@dataclass(frozen=True, slots=True)
class NormalizedOption:
    underlying: str
    expiry: str
    strike: float
    option_type: str   # CALL | PUT
    bid: float
    ask: float
    last: float
    volume: int
    open_interest: int
    implied_vol: float | None
    delta: float | None
    gamma: float | None
    theta: float | None
    vega: float | None
    source: str
    as_of: datetime


@dataclass
class ProviderHealth:
    name: str
    connected: bool
    last_fetch: datetime | None = None
    error: str | None = None
    latency_ms: float | None = None


# ── Abstract provider ────────────────────────────────────

class MarketDataProvider(abc.ABC):
    """Abstract interface for market data providers."""

    @property
    @abc.abstractmethod
    def provider_name(self) -> str: ...

    @abc.abstractmethod
    async def fetch_fx_spot(self, pairs: list[str]) -> list[NormalizedSpot]: ...

    @abc.abstractmethod
    async def fetch_historical_ohlc(
        self,
        symbol: str,
        interval: str = "1day",
        outputsize: int = 60,
    ) -> list[NormalizedOHLC]: ...

    @abc.abstractmethod
    async def fetch_equity_quotes(self, symbols: list[str]) -> list[NormalizedEquity]: ...

    @abc.abstractmethod
    async def health_check(self) -> ProviderHealth: ...

    # Optional — providers override if they support these
    async def fetch_forward_curves(self, pairs: list[str]) -> list[NormalizedForwardCurve]:
        return []

    async def fetch_options_chain(self, underlying: str, expiry: str | None = None) -> list[NormalizedOption]:
        return []
