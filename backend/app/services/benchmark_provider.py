"""app/services/benchmark_provider.py

Abstract benchmark provider interface for Audit Lab.

Defines the BenchmarkProvider ABC and three stub implementations:
  - RefinitivProvider  (Refinitiv Eikon / Workspace)
  - BloombergProvider  (Bloomberg B-PIPE / BLPAPI)
  - AlphaVantageProvider (Alpha Vantage REST / MCP)

All stubs return None / empty lists.  Replace with real adapters when
data-vendor contracts are in place.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime


# ---------------------------------------------------------------------------
# Data transfer object
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class BenchmarkQuote:
    """A single FX benchmark rate observation."""

    currency_pair: str
    """ISO 4217 pair, e.g. 'EURUSD'."""

    mid_rate: float
    """Mid-market rate."""

    bid_rate: float | None
    """Best bid (None when unavailable)."""

    ask_rate: float | None
    """Best ask (None when unavailable)."""

    as_of: datetime
    """Observation timestamp (UTC preferred)."""

    provider: str
    """Canonical provider name, e.g. 'REFINITIV'."""

    source_id: str | None = field(default=None)
    """Provider-specific record identifier (RIC, FIGI, etc.)."""


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------

class BenchmarkProvider(ABC):
    """Abstract interface for FX benchmark data providers.

    Implementors must supply:
      - get_rate        : single-pair lookup
      - get_rates_batch : multi-pair lookup
      - provider_name   : human-readable provider label
    """

    @abstractmethod
    async def get_rate(
        self,
        pair: str,
        as_of: date,
    ) -> BenchmarkQuote | None:
        """Return the benchmark quote for *pair* on *as_of*, or None."""
        ...

    @abstractmethod
    async def get_rates_batch(
        self,
        pairs: list[str],
        as_of: date,
    ) -> list[BenchmarkQuote]:
        """Return available quotes for each pair in *pairs*.

        Missing pairs are silently omitted from the result list.
        """
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Canonical provider label (uppercase, e.g. 'REFINITIV')."""
        ...


# ---------------------------------------------------------------------------
# Stub: Refinitiv
# ---------------------------------------------------------------------------

class RefinitivProvider(BenchmarkProvider):
    """Stub for Refinitiv Eikon / Workspace integration.

    Returns None / empty for all queries.  Replace with real adapter
    once Refinitiv API credentials and entitlements are provisioned.
    """

    async def get_rate(
        self,
        pair: str,
        as_of: date,
    ) -> BenchmarkQuote | None:
        """Stub -- always returns None."""
        return None

    async def get_rates_batch(
        self,
        pairs: list[str],
        as_of: date,
    ) -> list[BenchmarkQuote]:
        """Stub -- always returns an empty list."""
        return []

    @property
    def provider_name(self) -> str:
        return "REFINITIV"


# ---------------------------------------------------------------------------
# Stub: Bloomberg
# ---------------------------------------------------------------------------

class BloombergProvider(BenchmarkProvider):
    """Stub for Bloomberg B-PIPE / BLPAPI integration.

    Returns None / empty for all queries.  Replace with real adapter
    once Bloomberg terminal access and BLPAPI licence are available.
    """

    async def get_rate(
        self,
        pair: str,
        as_of: date,
    ) -> BenchmarkQuote | None:
        """Stub -- always returns None."""
        return None

    async def get_rates_batch(
        self,
        pairs: list[str],
        as_of: date,
    ) -> list[BenchmarkQuote]:
        """Stub -- always returns an empty list."""
        return []

    @property
    def provider_name(self) -> str:
        return "BLOOMBERG"


# ---------------------------------------------------------------------------
# Stub: Alpha Vantage
# ---------------------------------------------------------------------------

class AlphaVantageProvider(BenchmarkProvider):
    """Stub for Alpha Vantage FX integration.

    Can connect via Alpha Vantage REST API or MCP adapter when
    available.  Returns None / empty for all queries until wired.
    """

    async def get_rate(
        self,
        pair: str,
        as_of: date,
    ) -> BenchmarkQuote | None:
        """Stub -- always returns None."""
        return None

    async def get_rates_batch(
        self,
        pairs: list[str],
        as_of: date,
    ) -> list[BenchmarkQuote]:
        """Stub -- always returns an empty list."""
        return []

    @property
    def provider_name(self) -> str:
        return "ALPHA_VANTAGE"
