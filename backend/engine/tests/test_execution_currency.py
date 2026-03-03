"""Tests for execution currency context and hedge_lines generation.

Two groups:
  1. Hedge plan produces actionable buckets (hedge_lines) -- non-zero action_mxn
     for unhedged exposure that exceeds min_trade_size_usd.
  2. Currency context via provider_metadata.primary_currency -- validates that
     the market snapshot correctly carries the primary currency and that the
     validator selects the right spot range.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from app.engine.kernel import compute_hedge_plan
from app.engine.normalizer import normalize_hedges, normalize_trades
from app.engine.validator import validate_all
from app.schemas.hedges import HedgeRow
from app.schemas.market import MarketSnapshot
from app.schemas.policy import PolicyConfig, HedgeRatios, CostAssumptions
from app.schemas.trades import TradeRow


# ?? Helpers ???????????????????????????????????????????????????????????????????

def _market(spot: float = 17.15, primary_ccy: str = "MXN", **overrides):
    defaults = dict(
        as_of=datetime(2025, 6, 15, tzinfo=timezone.utc),
        spot_usdmxn=spot,
        forward_points_by_month={"2025-07": 0.035},
        provider_metadata={"primary_currency": primary_ccy},
    )
    defaults.update(overrides)
    return MarketSnapshot(**defaults)


def _policy(min_trade_size_usd: float = 50_000, **overrides):
    defaults = dict(
        hedge_ratios=HedgeRatios(confirmed=1.0, forecast=0.5),
        cost_assumptions=CostAssumptions(spread_bps=5.0),
        execution_product="NDF",
        min_trade_size_usd=min_trade_size_usd,
    )
    defaults.update(overrides)
    return PolicyConfig(**defaults)


def _trade(**overrides):
    defaults = dict(
        record_id="T1", entity="E", type="AP", currency="MXN",
        amount=1_000_000, value_date=date(2025, 7, 15), status="CONFIRMED",
    )
    defaults.update(overrides)
    return TradeRow(**defaults)


# ?? Group 1: Hedge plan produces hedge_lines ???????????????????????????????????

class TestHedgeLinesGeneration:
    """Kernel must produce at least one bucket with action_mxn != 0 when
    there is unhedged exposure that exceeds the min trade size threshold."""

    def test_unhedged_exposure_produces_action_bucket(self):
        """AP trade with no existing hedge -> action_mxn > 0 (BUY to hedge)."""
        trades = [
            TradeRow(
                record_id="T1", entity="Acme", type="AP", currency="MXN",
                amount=5_000_000, value_date=date(2025, 7, 15), status="CONFIRMED",
            )
        ]
        market = _market()
        policy = _policy()

        trades_df = normalize_trades(trades)
        hedges_df = normalize_hedges([])
        plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)

        # At least one bucket must have a non-zero action (a "hedge line")
        action_buckets = [b for b in plan.buckets if b.action_mxn != 0]
        assert len(action_buckets) >= 1, "Expected at least one actionable bucket"

        b = action_buckets[0]
        # AP creates negative commercial exposure -> BUY_MXN to hedge
        assert b.action_mxn > 0
        assert b.action_direction == "BUY_MXN_SELL_USD"
        assert not b.suppressed

    def test_ar_trade_produces_sell_action(self):
        """AR trade (receivable) with no existing hedge -> action_mxn < 0 (SELL to hedge)."""
        trades = [
            TradeRow(
                record_id="T2", entity="Acme", type="AR", currency="MXN",
                amount=3_000_000, value_date=date(2025, 7, 15), status="CONFIRMED",
            )
        ]
        market = _market()
        policy = _policy()

        trades_df = normalize_trades(trades)
        hedges_df = normalize_hedges([])
        plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)

        action_buckets = [b for b in plan.buckets if b.action_mxn != 0]
        assert len(action_buckets) >= 1

        b = action_buckets[0]
        assert b.action_mxn < 0
        assert b.action_direction == "SELL_MXN_BUY_USD"
        assert not b.suppressed

    def test_multi_bucket_hedge_produces_multiple_action_lines(self):
        """Trades in different months produce separate action buckets."""
        trades = [
            TradeRow(
                record_id="T3", entity="Acme", type="AP", currency="MXN",
                amount=2_000_000, value_date=date(2025, 7, 15), status="CONFIRMED",
            ),
            TradeRow(
                record_id="T4", entity="Acme", type="AP", currency="MXN",
                amount=2_000_000, value_date=date(2025, 8, 15), status="CONFIRMED",
            ),
        ]
        market = _market(
            forward_points_by_month={"2025-07": 0.035, "2025-08": 0.070},
        )
        policy = _policy()

        trades_df = normalize_trades(trades)
        hedges_df = normalize_hedges([])
        plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)

        # Both buckets should produce action lines
        action_buckets = [b for b in plan.buckets if b.action_mxn != 0 and not b.suppressed]
        assert len(action_buckets) == 2, (
            f"Expected 2 action buckets, got {len(action_buckets)}: {[b.bucket for b in plan.buckets]}"
        )

    def test_fully_hedged_exposure_produces_no_action(self):
        """Fully hedged AP trade produces zero action_mxn and zero residual.

        AP trade: commercial = -10M, target = +10M (need to BUY 10M to hedge).
        Existing BUY_MXN_SELL_USD hedge of 10M: existing_hedges_mxn = +10M.
        action = target - existing = 10M - 10M = 0.
        """
        trades = [
            TradeRow(
                record_id="T5", entity="Acme", type="AP", currency="MXN",
                amount=10_000_000, value_date=date(2025, 7, 15), status="CONFIRMED",
            )
        ]
        hedges = [
            HedgeRow(
                hedge_id="H1", instrument="NDF", direction="BUY_MXN_SELL_USD",
                notional_mxn=10_000_000, value_date=date(2025, 7, 15), status="ACTIVE",
            )
        ]
        market = _market()
        policy = _policy()

        trades_df = normalize_trades(trades)
        hedges_df = normalize_hedges(hedges)
        plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)

        b = plan.buckets[0]
        # Fully hedged: action should be 0 (suppressed or explicit zero)
        assert b.action_mxn == 0 or b.suppressed
        assert b.residual_mxn == 0

    def test_action_usd_computed_from_forward_rate(self):
        """action_usd must equal abs(action_mxn) / forward_rate."""
        trades = [
            TradeRow(
                record_id="T6", entity="Acme", type="AP", currency="MXN",
                amount=5_000_000, value_date=date(2025, 7, 15), status="CONFIRMED",
            )
        ]
        market = _market()  # spot=17.15, fwd_pts=0.035 -> fwd=17.185
        policy = _policy()

        trades_df = normalize_trades(trades)
        hedges_df = normalize_hedges([])
        plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)

        b = plan.buckets[0]
        if b.action_mxn != 0 and not b.suppressed:
            expected_usd = abs(b.action_mxn) / b.forward_rate
            assert abs(b.action_usd - expected_usd) < 1.0, (
                f"action_usd {b.action_usd:.2f} != expected {expected_usd:.2f}"
            )


# ?? Group 2: Currency context via provider_metadata ???????????????????????????

class TestCurrencyContextValidation:
    """Validate that provider_metadata.primary_currency is stored on the
    market snapshot and flows through to the validator correctly.

    The engine's spot range check (V-011) is calibrated for MXN [10, 30].
    Tests confirm that out-of-range spots for MXN still fail V-011 even when
    primary_currency metadata is present, and that valid spots pass.
    """

    def test_primary_currency_stored_in_market_metadata(self):
        """MarketSnapshot must store primary_currency in provider_metadata."""
        m = _market(spot=17.15, primary_ccy="MXN")
        assert m.provider_metadata.get("primary_currency") == "MXN"

    def test_primary_currency_euro_stored_correctly(self):
        """EUR primary currency metadata is preserved on market snapshot."""
        m = _market(spot=1.08, primary_ccy="EUR")
        assert m.provider_metadata.get("primary_currency") == "EUR"

    def test_primary_currency_jpy_stored_correctly(self):
        """JPY primary currency metadata is preserved on market snapshot."""
        m = _market(spot=148.5, primary_ccy="JPY")
        assert m.provider_metadata.get("primary_currency") == "JPY"

    def test_mxn_spot_in_valid_range_passes_v011(self):
        """Spot 17.15 is within MXN [10, 30] -> validation passes."""
        t = _trade()
        m = _market(spot=17.15, primary_ccy="MXN")
        r = validate_all([t], [], m, _policy())
        assert r.status == "PASS"
        assert not any(e.code == "V-011" for e in r.errors)

    def test_mxn_spot_too_low_fails_v011(self):
        """Spot 5.0 is below MXN [10, 30] -> V-011 triggered."""
        t = _trade()
        m = _market(spot=5.0, primary_ccy="MXN")
        r = validate_all([t], [], m, _policy())
        assert r.status == "FAIL"
        assert any(e.code == "V-011" for e in r.errors)

    def test_mxn_spot_too_high_fails_v011(self):
        """Spot 35.0 is above MXN [10, 30] -> V-011 triggered."""
        t = _trade()
        m = _market(spot=35.0, primary_ccy="MXN")
        r = validate_all([t], [], m, _policy())
        assert r.status == "FAIL"
        assert any(e.code == "V-011" for e in r.errors)

    def test_market_metadata_persists_through_compute(self):
        """provider_metadata is accessible on the market object used in kernel."""
        trades = [_trade(amount=2_000_000)]
        market = _market(spot=17.15, primary_ccy="MXN")
        policy = _policy()

        trades_df = normalize_trades(trades)
        hedges_df = normalize_hedges([])
        plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)

        # Market metadata is not mutated by the kernel
        assert market.provider_metadata.get("primary_currency") == "MXN"
        # Plan has at least one bucket (sanity check that compute ran)
        assert len(plan.buckets) >= 1

    def test_no_primary_currency_metadata_defaults_gracefully(self):
        """Market without primary_currency in metadata still processes correctly."""
        t = _trade()
        m = MarketSnapshot(
            as_of=datetime(2025, 6, 15, tzinfo=timezone.utc),
            spot_usdmxn=17.15,
            forward_points_by_month={"2025-07": 0.035},
            # No provider_metadata / primary_currency
        )
        r = validate_all([t], [], m, _policy())
        assert r.status == "PASS"

    def test_multiple_currencies_in_metadata(self):
        """Market metadata can carry extra context fields without breaking validation."""
        t = _trade(amount=1_000_000)
        m = MarketSnapshot(
            as_of=datetime(2025, 6, 15, tzinfo=timezone.utc),
            spot_usdmxn=17.15,
            forward_points_by_month={"2025-07": 0.035},
            provider_metadata={
                "primary_currency": "MXN",
                "currency_pair": "USD/MXN",
                "source": "demo_fixture",
                "fixture_id": "F01",
            },
        )
        r = validate_all([t], [], m, _policy())
        assert r.status == "PASS"
        assert m.provider_metadata["currency_pair"] == "USD/MXN"
        assert m.provider_metadata["fixture_id"] == "F01"
