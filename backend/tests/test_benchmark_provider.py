"""Tests for app.services.benchmark_provider.

Covers:
  - BenchmarkQuote dataclass construction and immutability
  - All three stub providers (Refinitiv, Bloomberg, Alpha Vantage)
  - ABC enforcement (cannot instantiate bare BenchmarkProvider)
  - provider_name property values
  - get_rate returns None for every stub
  - get_rates_batch returns empty list for every stub
"""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from app.services.benchmark_provider import (
    AlphaVantageProvider,
    BenchmarkProvider,
    BenchmarkQuote,
    BloombergProvider,
    RefinitivProvider,
)


# ---------------------------------------------------------------------------
# BenchmarkQuote
# ---------------------------------------------------------------------------

class TestBenchmarkQuote:
    def test_construction_full(self) -> None:
        ts = datetime(2026, 3, 9, 12, 0, 0, tzinfo=timezone.utc)
        q = BenchmarkQuote(
            currency_pair="EURUSD",
            mid_rate=1.0850,
            bid_rate=1.0848,
            ask_rate=1.0852,
            as_of=ts,
            provider="TEST",
            source_id="RIC:EUR=",
        )
        assert q.currency_pair == "EURUSD"
        assert q.mid_rate == 1.0850
        assert q.bid_rate == 1.0848
        assert q.ask_rate == 1.0852
        assert q.as_of == ts
        assert q.provider == "TEST"
        assert q.source_id == "RIC:EUR="

    def test_construction_minimal(self) -> None:
        ts = datetime(2026, 1, 1, tzinfo=timezone.utc)
        q = BenchmarkQuote(
            currency_pair="USDJPY",
            mid_rate=150.25,
            bid_rate=None,
            ask_rate=None,
            as_of=ts,
            provider="STUB",
        )
        assert q.bid_rate is None
        assert q.ask_rate is None
        assert q.source_id is None

    def test_immutable(self) -> None:
        ts = datetime(2026, 1, 1, tzinfo=timezone.utc)
        q = BenchmarkQuote(
            currency_pair="GBPUSD",
            mid_rate=1.27,
            bid_rate=None,
            ask_rate=None,
            as_of=ts,
            provider="STUB",
        )
        with pytest.raises(AttributeError):
            q.mid_rate = 1.30  # type: ignore[misc]


# ---------------------------------------------------------------------------
# ABC enforcement
# ---------------------------------------------------------------------------

class TestBenchmarkProviderABC:
    def test_cannot_instantiate_abstract(self) -> None:
        with pytest.raises(TypeError):
            BenchmarkProvider()  # type: ignore[abstract]


# ---------------------------------------------------------------------------
# Refinitiv stub
# ---------------------------------------------------------------------------

class TestRefinitivProvider:
    @pytest.fixture()
    def provider(self) -> RefinitivProvider:
        return RefinitivProvider()

    def test_provider_name(self, provider: RefinitivProvider) -> None:
        assert provider.provider_name == "REFINITIV"

    @pytest.mark.asyncio
    async def test_get_rate_returns_none(self, provider: RefinitivProvider) -> None:
        result = await provider.get_rate("EURUSD", date(2026, 3, 9))
        assert result is None

    @pytest.mark.asyncio
    async def test_get_rates_batch_returns_empty(self, provider: RefinitivProvider) -> None:
        result = await provider.get_rates_batch(
            ["EURUSD", "GBPUSD", "USDJPY"],
            date(2026, 3, 9),
        )
        assert result == []


# ---------------------------------------------------------------------------
# Bloomberg stub
# ---------------------------------------------------------------------------

class TestBloombergProvider:
    @pytest.fixture()
    def provider(self) -> BloombergProvider:
        return BloombergProvider()

    def test_provider_name(self, provider: BloombergProvider) -> None:
        assert provider.provider_name == "BLOOMBERG"

    @pytest.mark.asyncio
    async def test_get_rate_returns_none(self, provider: BloombergProvider) -> None:
        result = await provider.get_rate("USDJPY", date(2026, 1, 15))
        assert result is None

    @pytest.mark.asyncio
    async def test_get_rates_batch_returns_empty(self, provider: BloombergProvider) -> None:
        result = await provider.get_rates_batch(["EURUSD"], date(2026, 1, 15))
        assert result == []


# ---------------------------------------------------------------------------
# Alpha Vantage stub
# ---------------------------------------------------------------------------

class TestAlphaVantageProvider:
    @pytest.fixture()
    def provider(self) -> AlphaVantageProvider:
        return AlphaVantageProvider()

    def test_provider_name(self, provider: AlphaVantageProvider) -> None:
        assert provider.provider_name == "ALPHA_VANTAGE"

    @pytest.mark.asyncio
    async def test_get_rate_returns_none(self, provider: AlphaVantageProvider) -> None:
        result = await provider.get_rate("GBPUSD", date(2026, 6, 1))
        assert result is None

    @pytest.mark.asyncio
    async def test_get_rates_batch_returns_empty(self, provider: AlphaVantageProvider) -> None:
        result = await provider.get_rates_batch(
            ["GBPUSD", "AUDUSD"],
            date(2026, 6, 1),
        )
        assert result == []


# ---------------------------------------------------------------------------
# Polymorphism
# ---------------------------------------------------------------------------

class TestPolymorphism:
    @pytest.mark.asyncio
    async def test_all_stubs_are_benchmark_providers(self) -> None:
        providers: list[BenchmarkProvider] = [
            RefinitivProvider(),
            BloombergProvider(),
            AlphaVantageProvider(),
        ]
        for p in providers:
            assert isinstance(p, BenchmarkProvider)
            assert await p.get_rate("EURUSD", date.today()) is None
            assert await p.get_rates_batch(["EURUSD"], date.today()) == []
