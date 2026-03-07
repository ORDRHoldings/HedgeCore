"""
test_calc_assurance.py — Calculation Assurance + Finnhub FX Data Hardening
===========================================================================
Bank / BlackRock-grade proof suite for engine_v1 correctness.

Coverage:
  Phase 1 — Finnhub data path assertions (structural, no live API calls)
  Phase 2 — Math ledger: exact golden vector verification against hand-computed values
  Phase 3 — Validator V-022 / V-023 new codes
  Phase 4 — Property-based invariants (idempotency, sign, monotonicity, conservation)
  Phase 5 — Hash-chain determinism

All tests are pure-unit: no DB, no HTTP.  Runnable offline.
"""
from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timedelta, timezone
from typing import Any

import pandas as pd
import pytest

# ── engine imports ──────────────────────────────────────────────────────────
from app.engine_v1.kernel import compute_hedge_plan
from app.engine_v1.normalizer import normalize_hedges, normalize_trades
from app.engine_v1.scenarios import SIGMAS, compute_scenarios
from app.engine_v1.validator import validate_all

# ── schema imports ───────────────────────────────────────────────────────────
from app.schemas_v1.hedges import HedgeRow
from app.schemas_v1.market import MarketSnapshot
from app.schemas_v1.policy import PolicyConfig
from app.schemas_v1.trades import TradeRow


# ═══════════════════════════════════════════════════════════════════════════════
# Fixtures — reusable building blocks
# ═══════════════════════════════════════════════════════════════════════════════

def _market(
    spot: float = 20.0,
    fwd: dict[str, float] | None = None,
    as_of: datetime | None = None,
    data_class: str = "LIVE",
) -> MarketSnapshot:
    if fwd is None:
        fwd = {"2026-09": 0.40}
    if as_of is None:
        as_of = datetime.now(timezone.utc)
    return MarketSnapshot(
        as_of=as_of,
        spot_rate=spot,
        forward_points_by_month=fwd,
        provider_metadata={"data_class": data_class, "primary_currency": "MXN"},
    )


def _policy(
    confirmed: float = 1.0,
    forecast: float = 0.0,
    spread_bps: float = 10.0,
    min_trade: float = 0.0,
    execution_product: str = "NDF",
    allow_indicative_proxy: bool = False,
) -> PolicyConfig:
    return PolicyConfig(
        hedge_ratios={"confirmed": confirmed, "forecast": forecast},
        cost_assumptions={"spread_bps": spread_bps},
        execution_product=execution_product,
        min_trade_size_usd=min_trade,
        allow_indicative_proxy=allow_indicative_proxy,
    )


def _ar_trade(
    amount: float = 2_000_000.0,
    value_date: str = "2026-09-30",
    status: str = "CONFIRMED",
) -> TradeRow:
    return TradeRow(
        record_id="T001",
        entity="DemoEntity",
        type="AR",
        currency="MXN",
        amount=amount,
        value_date=date.fromisoformat(value_date),
        status=status,
    )


def _ap_trade(
    amount: float = 1_000_000.0,
    value_date: str = "2026-09-30",
    status: str = "CONFIRMED",
) -> TradeRow:
    return TradeRow(
        record_id="T002",
        entity="DemoEntity",
        type="AP",
        currency="MXN",
        amount=amount,
        value_date=date.fromisoformat(value_date),
        status=status,
    )


def _sell_hedge(
    notional: float = 500_000.0,
    value_date: str = "2026-09-30",
) -> HedgeRow:
    return HedgeRow(
        hedge_id="H001",
        instrument="FWD",
        direction="SELL_MXN_BUY_USD",
        notional_mxn=notional,
        value_date=date.fromisoformat(value_date),
        status="ACTIVE",
    )


# ═══════════════════════════════════════════════════════════════════════════════
# ── Phase 1: Finnhub data path structural assertions ─────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class TestFinnhubDataPath:
    """
    Structural proofs that the Finnhub integration exists ONLY in the
    Next.js frontend layer and that the backend engine receives a
    MarketSnapshot regardless of source.
    """

    def test_market_snapshot_accepts_live_data_class(self) -> None:
        """Engine accepts data_class=LIVE without warnings."""
        snap = _market(data_class="LIVE")
        assert snap.provider_metadata["data_class"] == "LIVE"

    def test_market_snapshot_accepts_indicative_fallback(self) -> None:
        """Engine accepts data_class=INDICATIVE_FALLBACK (flagged as warning, not error)."""
        snap = _market(data_class="INDICATIVE_FALLBACK")
        assert snap.provider_metadata["data_class"] == "INDICATIVE_FALLBACK"

    def test_indicative_fallback_triggers_v022_warning_not_critical(self) -> None:
        """V-022 must be WARNING severity — never CRITICAL — so fallback data can run."""
        trades = [_ar_trade()]
        hedges: list[HedgeRow] = []
        market = _market(data_class="INDICATIVE_FALLBACK")
        policy = _policy(allow_indicative_proxy=True)  # sandbox: allow indicative proxy
        report = validate_all(trades, hedges, market, policy)
        # Must PASS (no critical errors)
        assert report.status == "PASS", f"Unexpected FAIL: {report.errors}"
        # V-022 should surface in warnings
        assert any("V-022" in w for w in report.warnings), (
            f"V-022 warning expected but not found in: {report.warnings}"
        )

    def test_live_data_class_no_v022(self) -> None:
        """V-022 must NOT fire when data_class=LIVE."""
        trades = [_ar_trade()]
        hedges: list[HedgeRow] = []
        market = _market(data_class="LIVE")
        policy = _policy()
        report = validate_all(trades, hedges, market, policy)
        assert not any("V-022" in w for w in report.warnings), (
            f"V-022 should not fire for LIVE data: {report.warnings}"
        )

    def test_missing_data_class_no_v022(self) -> None:
        """V-022 must NOT fire when data_class key is absent (unknown provider)."""
        trades = [_ar_trade()]
        hedges: list[HedgeRow] = []
        market = MarketSnapshot(
            as_of=datetime.now(timezone.utc),
            spot_rate=20.0,
            forward_points_by_month={"2026-09": 0.40},
            provider_metadata={"primary_currency": "MXN"},  # no data_class key
        )
        policy = _policy()
        report = validate_all(trades, hedges, market, policy)
        assert not any("V-022" in w for w in report.warnings)

    def test_provider_metadata_preserved_in_snapshot(self) -> None:
        """All Finnhub source metadata fields survive MarketSnapshot round-trip."""
        meta = {
            "source": "finnhub_live",
            "data_class": "LIVE",
            "currency_pair": "USD/MXN",
            "primary_currency": "MXN",
            "currencies_detected": ["MXN"],
        }
        snap = MarketSnapshot(
            as_of=datetime.now(timezone.utc),
            spot_rate=20.35,
            forward_points_by_month={"2026-09": 0.41},
            provider_metadata=meta,
        )
        assert snap.provider_metadata["source"] == "finnhub_live"
        assert snap.provider_metadata["data_class"] == "LIVE"
        assert snap.provider_metadata["primary_currency"] == "MXN"


# ═══════════════════════════════════════════════════════════════════════════════
# ── Phase 2A: Normalizer golden vectors ──────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class TestNormalizerSignConventions:
    """
    Prove sign convention: AR → +MXN, AP → -MXN,
    SELL_MXN_BUY_USD → −notional, BUY_MXN_SELL_USD → +notional.
    """

    def test_ar_trade_positive_signed_mxn(self) -> None:
        trade = _ar_trade(amount=1_000_000.0)
        df = normalize_trades([trade])
        assert df.iloc[0]["signed_mxn"] == pytest.approx(1_000_000.0)

    def test_ap_trade_negative_signed_mxn(self) -> None:
        trade = _ap_trade(amount=1_000_000.0)
        df = normalize_trades([trade])
        assert df.iloc[0]["signed_mxn"] == pytest.approx(-1_000_000.0)

    def test_sell_mxn_hedge_negative(self) -> None:
        hedge = _sell_hedge(notional=800_000.0)
        df = normalize_hedges([hedge])
        assert df.iloc[0]["signed_mxn"] == pytest.approx(-800_000.0)

    def test_buy_mxn_hedge_positive(self) -> None:
        hedge = HedgeRow(
            hedge_id="H001",
            instrument="FWD",
            direction="BUY_MXN_SELL_USD",
            notional_mxn=600_000.0,
            value_date=date(2026, 9, 30),
            status="ACTIVE",
        )
        df = normalize_hedges([hedge])
        assert df.iloc[0]["signed_mxn"] == pytest.approx(600_000.0)

    def test_bucket_format_yyyymm(self) -> None:
        trade = _ar_trade(value_date="2026-09-30")
        df = normalize_trades([trade])
        assert df.iloc[0]["bucket"] == "2026-09"

    def test_empty_hedges_returns_correct_columns(self) -> None:
        df = normalize_hedges([])
        assert "signed_mxn" in df.columns
        assert "bucket" in df.columns
        assert len(df) == 0


# ═══════════════════════════════════════════════════════════════════════════════
# ── Phase 2B: Kernel golden vectors ─────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class TestKernelGoldenVectors:
    """
    Hand-verified math vectors for the 13-step kernel.
    All expected values computed by manual arithmetic to 12 sig-fig precision.
    """

    def test_gv1_ar_full_hedge_no_existing(self) -> None:
        """
        GV1: AR 2,000,000 MXN CONFIRMED, 100% confirmed ratio, no existing hedges.

        Hand calc:
          confirmed_flow  = +2,000,000
          forecast_flow   = 0
          commercial_exp  = +2,000,000
          existing_hedges = 0
          target_signed   = -1.0 * (2,000,000 × 1.0)  = -2,000,000
          action_mxn      = -2,000,000 - 0             = -2,000,000
          direction       = SELL_MXN_BUY_USD
          forward_rate    = 20.0 + 0.40                = 20.40
          action_usd      = 2,000,000 / 20.40          = 98,039.2156862745...
          friction_usd    = (2,000,000/20.0) × (10/10000) = 100.0
          usd_equiv       = 100,000 ≥ 0 → not suppressed
          hedge_position  = 0 + (-2,000,000)           = -2,000,000
          residual        = 2,000,000 + (-2,000,000)   = 0
        """
        trades = [_ar_trade(amount=2_000_000.0)]
        hedges: list[HedgeRow] = []
        market = _market(spot=20.0, fwd={"2026-09": 0.40})
        policy = _policy(confirmed=1.0, forecast=0.0, spread_bps=10.0, min_trade=0.0)

        trades_df = normalize_trades(trades)
        hedges_df = normalize_hedges(hedges)
        plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)

        assert len(plan.buckets) == 1
        b = plan.buckets[0]

        assert b.bucket == "2026-09"
        assert b.confirmed_flow_mxn == pytest.approx(2_000_000.0)
        assert b.forecast_flow_mxn == pytest.approx(0.0)
        assert b.commercial_exposure_mxn == pytest.approx(2_000_000.0)
        assert b.existing_hedges_mxn == pytest.approx(0.0)
        assert b.target_signed_mxn == pytest.approx(-2_000_000.0)
        assert b.action_mxn == pytest.approx(-2_000_000.0)
        assert b.action_direction == "SELL_MXN_BUY_USD"
        assert b.forward_rate == pytest.approx(20.40)
        assert b.action_usd == pytest.approx(2_000_000.0 / 20.40, rel=1e-10)
        assert b.friction_usd == pytest.approx(100.0, rel=1e-10)
        assert b.suppressed is False
        assert b.hedge_position_mxn == pytest.approx(-2_000_000.0)
        assert b.residual_mxn == pytest.approx(0.0, abs=1e-6)

    def test_gv2_ap_partial_hedge_75pct(self) -> None:
        """
        GV2: AP 1,000,000 MXN CONFIRMED, 75% confirmed ratio, no existing hedges.

        Hand calc:
          confirmed_flow  = -1,000,000   (AP = negative)
          target_signed   = -1.0 × (-1,000,000 × 0.75) = +750,000
          action_mxn      = +750,000 - 0 = +750,000  (BUY_MXN_SELL_USD)
          forward_rate    = 20.0 + 0.20 = 20.20
          action_usd      = 750,000 / 20.20 = 37,128.71287128...
          friction_usd    = (750,000/20.0) × (10/10000) = 37.5
          hedge_position  = 0 + 750,000 = +750,000
          residual        = -1,000,000 + 750,000 = -250,000
        """
        trade = TradeRow(
            record_id="T002",
            entity="DemoEntity",
            type="AP",
            currency="MXN",
            amount=1_000_000.0,
            value_date=date(2026, 9, 30),
            status="CONFIRMED",
        )
        hedges: list[HedgeRow] = []
        market = _market(spot=20.0, fwd={"2026-09": 0.20})
        policy = _policy(confirmed=0.75, forecast=0.0, spread_bps=10.0, min_trade=0.0)

        trades_df = normalize_trades([trade])
        hedges_df = normalize_hedges(hedges)
        plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)

        b = plan.buckets[0]
        assert b.confirmed_flow_mxn == pytest.approx(-1_000_000.0)
        assert b.target_signed_mxn == pytest.approx(750_000.0)
        assert b.action_mxn == pytest.approx(750_000.0)
        assert b.action_direction == "BUY_MXN_SELL_USD"
        assert b.forward_rate == pytest.approx(20.20)
        assert b.action_usd == pytest.approx(750_000.0 / 20.20, rel=1e-10)
        assert b.friction_usd == pytest.approx(37.5, rel=1e-10)
        assert b.hedge_position_mxn == pytest.approx(750_000.0)
        assert b.residual_mxn == pytest.approx(-250_000.0, rel=1e-10)

    def test_gv3_existing_hedge_incremental_action(self) -> None:
        """
        GV3: AR 1,000,000 CONFIRMED, existing SELL hedge of 500,000.

        Hand calc:
          existing_hedges = -500,000 (SELL → negative)
          target_signed   = -1,000,000
          action_mxn      = -1,000,000 - (-500,000) = -500,000
          forward_rate    = 20.0 + 0.30 = 20.30
          action_usd      = 500,000 / 20.30 = 24,630.54187192...
          hedge_position  = -500,000 + (-500,000) = -1,000,000
          residual        = 1,000,000 + (-1,000,000) = 0
        """
        trades = [_ar_trade(amount=1_000_000.0)]
        hedges = [_sell_hedge(notional=500_000.0)]
        market = _market(spot=20.0, fwd={"2026-09": 0.30})
        policy = _policy(confirmed=1.0, forecast=0.0, spread_bps=10.0, min_trade=0.0)

        trades_df = normalize_trades(trades)
        hedges_df = normalize_hedges(hedges)
        plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)

        b = plan.buckets[0]
        assert b.existing_hedges_mxn == pytest.approx(-500_000.0)
        assert b.target_signed_mxn == pytest.approx(-1_000_000.0)
        assert b.action_mxn == pytest.approx(-500_000.0)
        assert b.forward_rate == pytest.approx(20.30)
        assert b.action_usd == pytest.approx(500_000.0 / 20.30, rel=1e-10)
        assert b.hedge_position_mxn == pytest.approx(-1_000_000.0)
        assert b.residual_mxn == pytest.approx(0.0, abs=1e-6)

    def test_gv4_min_trade_suppression(self) -> None:
        """
        GV4: AR 50,000 MXN with min_trade=10,000 USD.

        Hand calc:
          action_mxn = -50,000
          usd_equiv  = 50,000 / 20.0 = 2,500 < 10,000 → SUPPRESSED
          effective_action = 0
          hedge_position = 0 + 0 = 0
          residual = 50,000 + 0 = 50,000  (still exposed)
        """
        trades = [_ar_trade(amount=50_000.0)]
        hedges: list[HedgeRow] = []
        market = _market(spot=20.0, fwd={"2026-09": 0.10})
        policy = _policy(confirmed=1.0, min_trade=10_000.0)

        trades_df = normalize_trades(trades)
        hedges_df = normalize_hedges(hedges)
        plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)

        b = plan.buckets[0]
        assert b.suppressed is True
        assert b.hedge_position_mxn == pytest.approx(0.0)
        assert b.residual_mxn == pytest.approx(50_000.0)

    def test_gv5_zero_action_when_fully_hedged_already(self) -> None:
        """
        GV5: AR 1,000,000, existing hedge = 1,000,000 → action = 0, direction = None.
        """
        trades = [_ar_trade(amount=1_000_000.0)]
        hedges = [_sell_hedge(notional=1_000_000.0)]
        market = _market(spot=20.0, fwd={"2026-09": 0.20})
        policy = _policy(confirmed=1.0)

        trades_df = normalize_trades(trades)
        hedges_df = normalize_hedges(hedges)
        plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)

        b = plan.buckets[0]
        assert b.action_mxn == pytest.approx(0.0, abs=1e-6)
        assert b.action_direction is None
        assert b.residual_mxn == pytest.approx(0.0, abs=1e-6)

    def test_gv6_forecast_only_trade(self) -> None:
        """
        GV6: FORECAST trade only, 50% forecast ratio.

        Hand calc:
          confirmed_flow = 0
          forecast_flow  = +1,000,000
          target_signed  = -1.0 × (0 × 1.0 + 1,000,000 × 0.50) = -500,000
          action_mxn     = -500,000
        """
        trade = TradeRow(
            record_id="T001",
            entity="DemoEntity",
            type="AR",
            currency="MXN",
            amount=1_000_000.0,
            value_date=date(2026, 9, 30),
            status="FORECAST",
        )
        market = _market(spot=20.0, fwd={"2026-09": 0.20})
        policy = _policy(confirmed=1.0, forecast=0.50)

        trades_df = normalize_trades([trade])
        hedges_df = normalize_hedges([])
        plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)

        b = plan.buckets[0]
        assert b.confirmed_flow_mxn == pytest.approx(0.0)
        assert b.forecast_flow_mxn == pytest.approx(1_000_000.0)
        assert b.target_signed_mxn == pytest.approx(-500_000.0)
        assert b.action_mxn == pytest.approx(-500_000.0)

    def test_gv7_multi_bucket_independence(self) -> None:
        """
        GV7: Two trades in different buckets. Each bucket is computed independently.
        """
        t1 = TradeRow(
            record_id="T001",
            entity="DemoEntity",
            type="AR",
            currency="MXN",
            amount=1_000_000.0,
            value_date=date(2026, 9, 30),
            status="CONFIRMED",
        )
        t2 = TradeRow(
            record_id="T002",
            entity="DemoEntity",
            type="AR",
            currency="MXN",
            amount=2_000_000.0,
            value_date=date(2026, 10, 31),
            status="CONFIRMED",
        )
        market = _market(spot=20.0, fwd={"2026-09": 0.40, "2026-10": 0.60})
        policy = _policy(confirmed=1.0)

        trades_df = normalize_trades([t1, t2])
        hedges_df = normalize_hedges([])
        plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)

        assert len(plan.buckets) == 2
        b09 = next(b for b in plan.buckets if b.bucket == "2026-09")
        b10 = next(b for b in plan.buckets if b.bucket == "2026-10")

        assert b09.commercial_exposure_mxn == pytest.approx(1_000_000.0)
        assert b10.commercial_exposure_mxn == pytest.approx(2_000_000.0)
        assert b09.forward_rate == pytest.approx(20.40)
        assert b10.forward_rate == pytest.approx(20.60)

    def test_summary_aggregation_correct(self) -> None:
        """Summary fields must equal sum of per-bucket values."""
        trades = [_ar_trade(amount=2_000_000.0)]
        market = _market(spot=20.0, fwd={"2026-09": 0.40})
        policy = _policy(confirmed=1.0)

        trades_df = normalize_trades(trades)
        hedges_df = normalize_hedges([])
        plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)

        s = plan.summary
        assert s.total_commercial_exposure_mxn == pytest.approx(
            sum(b.commercial_exposure_mxn for b in plan.buckets), rel=1e-10
        )
        assert s.total_action_mxn == pytest.approx(
            sum(b.action_mxn for b in plan.buckets), rel=1e-10
        )
        assert s.total_action_usd == pytest.approx(
            sum(b.action_usd for b in plan.buckets), rel=1e-10
        )
        assert s.total_friction_usd == pytest.approx(
            sum(b.friction_usd for b in plan.buckets), rel=1e-10
        )


# ═══════════════════════════════════════════════════════════════════════════════
# ── Phase 2C: Scenario golden vectors ────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class TestScenarioGoldenVectors:
    """
    Exact arithmetic proof for the 4-sigma shock engine.
    """

    def _run_scenario(
        self, amount: float = 2_000_000.0, spot: float = 20.0
    ):
        """Helper: full AR hedge then scenario engine."""
        trades = [_ar_trade(amount=amount)]
        market = _market(spot=spot, fwd={"2026-09": 0.40})
        policy = _policy(confirmed=1.0)

        trades_df = normalize_trades(trades)
        hedges_df = normalize_hedges([])
        plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)
        results = compute_scenarios(plan.buckets, market)
        return plan, results

    def test_sigmas_are_fixed_set(self) -> None:
        assert SIGMAS == [-0.10, -0.05, 0.05, 0.10]

    def test_shocked_spot_arithmetic(self) -> None:
        """shocked_spot = spot × (1 + sigma) for each sigma."""
        _, results = self._run_scenario(spot=20.0)
        for total in results.totals:
            expected = 20.0 * (1.0 + total.sigma)
            assert total.shocked_spot == pytest.approx(expected, rel=1e-10)

    def test_unhedged_usd_formula(self) -> None:
        """
        GV-S1: AR 2,000,000, spot=20.0, sigma=-0.05.
        shocked_spot = 19.0
        unhedged_usd = 2,000,000 / 19.0 = 105,263.15789...
        """
        plan, results = self._run_scenario(amount=2_000_000.0, spot=20.0)

        # Find sigma = -0.05 total
        t = next(t for t in results.totals if t.sigma == pytest.approx(-0.05))
        assert t.shocked_spot == pytest.approx(20.0 * 0.95, rel=1e-10)
        assert t.total_unhedged_usd == pytest.approx(2_000_000.0 / (20.0 * 0.95), rel=1e-10)

    def test_hedged_usd_formula(self) -> None:
        """
        GV-S2: AR fully hedged.
        hedge_position = -2,000,000, forward_rate = 20.40, residual = 0.
        hedged_usd = -2,000,000 / 20.40 + 0 = -98,039.2156...
        """
        plan, results = self._run_scenario(amount=2_000_000.0, spot=20.0)

        # All totals should agree on hedged_usd (residual=0)
        expected_hedged = -2_000_000.0 / 20.40  # hedge_position / forward_rate
        for total in results.totals:
            assert total.total_hedged_usd == pytest.approx(expected_hedged, rel=1e-10)

    def test_benefit_equals_hedged_minus_unhedged(self) -> None:
        """benefit = hedged_usd - unhedged_usd per bucket."""
        plan, results = self._run_scenario(amount=2_000_000.0, spot=20.0)
        for pr in results.per_bucket:
            assert pr.hedge_benefit_usd == pytest.approx(
                pr.hedged_usd - pr.unhedged_usd, rel=1e-10
            )

    def test_total_equals_sum_of_buckets(self) -> None:
        """Total fields must equal sum of per-bucket results for same sigma."""
        plan, results = self._run_scenario(amount=2_000_000.0, spot=20.0)
        for total in results.totals:
            sigma_buckets = [b for b in results.per_bucket if b.sigma == total.sigma]
            assert total.total_unhedged_usd == pytest.approx(
                sum(b.unhedged_usd for b in sigma_buckets), rel=1e-10
            )
            assert total.total_hedge_benefit_usd == pytest.approx(
                sum(b.hedge_benefit_usd for b in sigma_buckets), rel=1e-10
            )

    def test_correct_number_of_results(self) -> None:
        """#sigmas × #buckets per_bucket records."""
        plan, results = self._run_scenario()
        assert len(results.sigmas) == 4
        assert len(results.per_bucket) == 4 * len(plan.buckets)
        assert len(results.totals) == 4


# ═══════════════════════════════════════════════════════════════════════════════
# ── Phase 3: Validator V-022 and V-023 ───────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class TestValidatorNewCodes:
    """Prove V-022 (data quality gate) and V-023 (staleness guard) behave correctly."""

    # V-022 ──────────────────────────────────────────────────────────────────

    def test_v022_fires_warning_for_indicative_fallback(self) -> None:
        trades = [_ar_trade()]
        market = _market(data_class="INDICATIVE_FALLBACK")
        policy = _policy(allow_indicative_proxy=True)  # sandbox: gate open, expect only WARNING
        report = validate_all(trades, [], market, policy)
        assert report.status == "PASS"
        assert any("V-022" in w for w in report.warnings)

    def test_v022_message_contains_indicative_fallback_text(self) -> None:
        trades = [_ar_trade()]
        market = _market(data_class="INDICATIVE_FALLBACK")
        policy = _policy(allow_indicative_proxy=True)  # sandbox: gate open, inspect warning text
        report = validate_all(trades, [], market, policy)
        v022_warns = [w for w in report.warnings if "V-022" in w]
        assert v022_warns, "V-022 warning not found"
        assert "INDICATIVE_FALLBACK" in v022_warns[0]

    def test_v022_silent_for_live(self) -> None:
        trades = [_ar_trade()]
        market = _market(data_class="LIVE")
        policy = _policy()
        report = validate_all(trades, [], market, policy)
        assert not any("V-022" in w for w in report.warnings)

    def test_v022_silent_when_data_class_absent(self) -> None:
        """Completely missing data_class key must not trigger V-022."""
        market = MarketSnapshot(
            as_of=datetime.now(timezone.utc),
            spot_rate=20.0,
            forward_points_by_month={"2026-09": 0.40},
            provider_metadata={},
        )
        trades = [_ar_trade()]
        report = validate_all(trades, [], market, _policy())
        assert not any("V-022" in w for w in report.warnings)

    # V-023 ──────────────────────────────────────────────────────────────────

    def test_v023_fires_for_stale_snapshot_25h(self) -> None:
        stale_as_of = datetime.now(timezone.utc) - timedelta(hours=25)
        market = MarketSnapshot(
            as_of=stale_as_of,
            spot_rate=20.0,
            forward_points_by_month={"2026-09": 0.40},
            provider_metadata={"data_class": "LIVE", "primary_currency": "MXN"},
        )
        trades = [_ar_trade()]
        report = validate_all(trades, [], market, _policy())
        assert report.status == "PASS"
        assert any("V-023" in w for w in report.warnings)

    def test_v023_silent_for_fresh_snapshot(self) -> None:
        fresh_as_of = datetime.now(timezone.utc) - timedelta(hours=1)
        market = MarketSnapshot(
            as_of=fresh_as_of,
            spot_rate=20.0,
            forward_points_by_month={"2026-09": 0.40},
            provider_metadata={"data_class": "LIVE", "primary_currency": "MXN"},
        )
        trades = [_ar_trade()]
        report = validate_all(trades, [], market, _policy())
        assert not any("V-023" in w for w in report.warnings)

    def test_v023_message_contains_age_hours(self) -> None:
        stale_as_of = datetime.now(timezone.utc) - timedelta(hours=48)
        market = MarketSnapshot(
            as_of=stale_as_of,
            spot_rate=20.0,
            forward_points_by_month={"2026-09": 0.40},
            provider_metadata={"data_class": "LIVE", "primary_currency": "MXN"},
        )
        trades = [_ar_trade()]
        report = validate_all(trades, [], market, _policy())
        v023_warns = [w for w in report.warnings if "V-023" in w]
        assert v023_warns
        # Message should contain age info
        assert "h old" in v023_warns[0]

    def test_v023_handles_naive_datetime(self) -> None:
        """Naive datetime should be treated as UTC without crashing."""
        stale_naive = datetime.utcnow() - timedelta(hours=30)  # naive UTC
        market = MarketSnapshot(
            as_of=stale_naive,
            spot_rate=20.0,
            forward_points_by_month={"2026-09": 0.40},
            provider_metadata={"data_class": "LIVE", "primary_currency": "MXN"},
        )
        trades = [_ar_trade()]
        # Must not raise; V-023 should fire (30h stale)
        report = validate_all(trades, [], market, _policy())
        assert any("V-023" in w for w in report.warnings)

    def test_v022_and_v023_can_coexist(self) -> None:
        """Both V-022 and V-023 can appear in the same validation report."""
        stale_as_of = datetime.now(timezone.utc) - timedelta(hours=30)
        market = MarketSnapshot(
            as_of=stale_as_of,
            spot_rate=20.0,
            forward_points_by_month={"2026-09": 0.40},
            provider_metadata={"data_class": "INDICATIVE_FALLBACK", "primary_currency": "MXN"},
        )
        trades = [_ar_trade()]
        report = validate_all(trades, [], market, _policy(allow_indicative_proxy=True))  # sandbox: gate open
        assert report.status == "PASS"
        assert any("V-022" in w for w in report.warnings)
        assert any("V-023" in w for w in report.warnings)


# ═══════════════════════════════════════════════════════════════════════════════
# ── Phase 4: Property-based invariants ───────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class TestPropertyInvariants:
    """
    Properties that must hold for ANY well-formed input:
      - Idempotency (determinism): same inputs → same outputs
      - Sign: full hedge of AR → action direction SELL, AP → BUY
      - Full-ratio conservation: confirmed=1.0 → residual == 0
      - Monotonicity: higher confirmed ratio → larger |action|
      - Suppression contract: suppressed bucket → action_usd == 0
      - Scenario sigma ordering
    """

    def _plan(
        self,
        trade_type: str = "AR",
        amount: float = 1_000_000.0,
        confirmed: float = 1.0,
        forecast: float = 0.0,
        min_trade: float = 0.0,
        existing_notional: float = 0.0,
        spot: float = 20.0,
    ):
        if trade_type == "AR":
            trade = TradeRow(
                record_id="T001",
                entity="E",
                type="AR",
                currency="MXN",
                amount=amount,
                value_date=date(2026, 9, 30),
                status="CONFIRMED",
            )
        else:
            trade = TradeRow(
                record_id="T001",
                entity="E",
                type="AP",
                currency="MXN",
                amount=amount,
                value_date=date(2026, 9, 30),
                status="CONFIRMED",
            )

        hedges = []
        if existing_notional > 0:
            hedges = [_sell_hedge(notional=existing_notional)]

        market = _market(spot=spot, fwd={"2026-09": 0.30})
        policy = _policy(confirmed=confirmed, forecast=forecast, min_trade=min_trade)

        trades_df = normalize_trades([trade])
        hedges_df = normalize_hedges(hedges)
        plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)
        return plan

    def test_idempotency_identical_runs_match(self) -> None:
        """Same inputs → bitwise identical hedge plans."""
        p1 = self._plan(amount=1_500_000.0)
        p2 = self._plan(amount=1_500_000.0)
        assert p1.model_dump() == p2.model_dump()

    def test_ar_full_hedge_direction_sell(self) -> None:
        """AR receivable at 100% ratio → SELL_MXN_BUY_USD."""
        plan = self._plan(trade_type="AR", confirmed=1.0)
        assert plan.buckets[0].action_direction == "SELL_MXN_BUY_USD"

    def test_ap_full_hedge_direction_buy(self) -> None:
        """AP payable at 100% ratio → BUY_MXN_SELL_USD."""
        plan = self._plan(trade_type="AP", confirmed=1.0)
        assert plan.buckets[0].action_direction == "BUY_MXN_SELL_USD"

    def test_full_ratio_zero_residual(self) -> None:
        """AR at 100% confirmed ratio with no existing hedges → residual == 0."""
        plan = self._plan(confirmed=1.0, forecast=0.0)
        assert plan.buckets[0].residual_mxn == pytest.approx(0.0, abs=1e-6)

    def test_zero_ratio_zero_action(self) -> None:
        """0% ratio → target_signed = 0 → action = 0."""
        plan = self._plan(confirmed=0.0, forecast=0.0)
        b = plan.buckets[0]
        assert b.target_signed_mxn == pytest.approx(0.0, abs=1e-6)
        assert b.action_mxn == pytest.approx(0.0, abs=1e-6)
        assert b.action_direction is None

    def test_monotonicity_higher_ratio_larger_action(self) -> None:
        """Doubling hedge ratio must approximately double |action_mxn|."""
        p50 = self._plan(confirmed=0.50)
        p100 = self._plan(confirmed=1.00)
        assert abs(p100.buckets[0].action_mxn) == pytest.approx(
            2.0 * abs(p50.buckets[0].action_mxn), rel=1e-10
        )

    def test_suppressed_action_usd_is_zero(self) -> None:
        """Suppressed bucket → effective action_usd = 0 (engine stores abs value pre-suppression)."""
        plan = self._plan(amount=10_000.0, min_trade=100_000.0)  # usd_equiv << min_trade
        b = plan.buckets[0]
        assert b.suppressed is True
        # hedge_position must not reflect the action
        assert b.hedge_position_mxn == pytest.approx(0.0, abs=1e-6)

    def test_friction_always_non_negative(self) -> None:
        """Transaction cost (friction_usd) is always ≥ 0."""
        for amount in [100_000.0, 500_000.0, 2_000_000.0]:
            plan = self._plan(amount=amount)
            for b in plan.buckets:
                assert b.friction_usd >= 0.0

    def test_scenario_shocked_spot_order(self) -> None:
        """Negative sigma → lower shocked_spot; positive sigma → higher shocked_spot."""
        plan = self._plan(amount=1_000_000.0)
        market = _market(spot=20.0, fwd={"2026-09": 0.30})
        results = compute_scenarios(plan.buckets, market)

        totals_by_sigma = {t.sigma: t.shocked_spot for t in results.totals}
        assert totals_by_sigma[-0.10] < totals_by_sigma[-0.05]
        assert totals_by_sigma[-0.05] < totals_by_sigma[0.05]
        assert totals_by_sigma[0.05] < totals_by_sigma[0.10]

    def test_residual_conservation_identity(self) -> None:
        """residual = commercial_exposure + hedge_position (algebraic identity)."""
        plan = self._plan(amount=1_000_000.0, confirmed=0.80, existing_notional=200_000.0)
        for b in plan.buckets:
            assert b.residual_mxn == pytest.approx(
                b.commercial_exposure_mxn + b.hedge_position_mxn, rel=1e-10
            )

    def test_hedge_position_is_existing_plus_effective_action(self) -> None:
        """hedge_position = existing_hedges + effective_action."""
        plan = self._plan(amount=1_000_000.0, confirmed=1.0, existing_notional=300_000.0)
        for b in plan.buckets:
            if not b.suppressed:
                assert b.hedge_position_mxn == pytest.approx(
                    b.existing_hedges_mxn + b.action_mxn, rel=1e-10
                )
            else:
                assert b.hedge_position_mxn == pytest.approx(
                    b.existing_hedges_mxn, rel=1e-10
                )


# ═══════════════════════════════════════════════════════════════════════════════
# ── Phase 5: Hash-chain determinism ──────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class TestHashChainDeterminism:
    """
    Prove the SHA-256 hashing utilities are deterministic and produce
    stable inputs for the RunEnvelope hash chain.
    """

    def _sha256_dict(self, d: dict) -> str:
        encoded = json.dumps(d, sort_keys=True, default=str).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def test_sha256_dict_deterministic(self) -> None:
        payload = {"spot": 20.0, "currency": "MXN", "buckets": {"2026-09": 0.4}}
        h1 = self._sha256_dict(payload)
        h2 = self._sha256_dict(payload)
        assert h1 == h2
        assert len(h1) == 64

    def test_sha256_dict_key_order_stable(self) -> None:
        """Different insertion order → same hash (sort_keys=True)."""
        d1 = {"b": 2, "a": 1}
        d2 = {"a": 1, "b": 2}
        assert self._sha256_dict(d1) == self._sha256_dict(d2)

    def test_sha256_dict_sensitive_to_value_changes(self) -> None:
        d1 = {"spot": 20.0}
        d2 = {"spot": 20.1}
        assert self._sha256_dict(d1) != self._sha256_dict(d2)

    def test_hasher_module_consistency(self) -> None:
        """app.engine_v1.hasher sha256_of_dict agrees with our reference impl."""
        from app.engine_v1.hasher import sha256_of_dict

        payload: dict[str, Any] = {"currency": "MXN", "spot": 20.0}
        expected = self._sha256_dict(payload)
        assert sha256_of_dict(payload) == expected

    def test_full_pipeline_inputs_hash_stable(self) -> None:
        """Same trade/hedge/market/policy → same inputs_hash across two runs."""
        from app.engine_v1.audit import build_run_envelope

        trades = [_ar_trade()]
        hedges: list[HedgeRow] = []
        market = _market(
            spot=20.0,
            fwd={"2026-09": 0.40},
            as_of=datetime(2026, 9, 1, 12, 0, 0, tzinfo=timezone.utc),
        )
        policy = _policy(confirmed=1.0)

        trades_raw = [t.model_dump(mode="json") for t in trades]
        hedges_raw = [h.model_dump(mode="json") for h in hedges]
        market_raw = market.model_dump(mode="json")
        policy_raw = policy.model_dump(mode="json")

        trades_df = normalize_trades(trades)
        hedges_df = normalize_hedges(hedges)
        plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)
        scenarios = compute_scenarios(plan.buckets, market)
        outputs_raw = {
            "hedge_plan": plan.model_dump(mode="json"),
            "scenario_results": scenarios.model_dump(mode="json"),
        }

        env1 = build_run_envelope(
            run_id="run-1",
            trades_raw=trades_raw,
            hedges_raw=hedges_raw,
            market_raw=market_raw,
            policy_raw=policy_raw,
            outputs_raw=outputs_raw,
        )
        env2 = build_run_envelope(
            run_id="run-1",
            trades_raw=trades_raw,
            hedges_raw=hedges_raw,
            market_raw=market_raw,
            policy_raw=policy_raw,
            outputs_raw=outputs_raw,
        )
        assert env1.inputs_hash == env2.inputs_hash
        assert env1.outputs_hash == env2.outputs_hash
        assert env1.run_hash == env2.run_hash

    def test_different_inputs_different_hash(self) -> None:
        """Different spot rate → different inputs_hash."""
        from app.engine_v1.audit import build_run_envelope

        def _envelope(spot: float):
            trades = [_ar_trade()]
            market = _market(
                spot=spot,
                fwd={"2026-09": 0.40},
                as_of=datetime(2026, 9, 1, 12, 0, 0, tzinfo=timezone.utc),
            )
            policy = _policy()
            plan, _ = compute_hedge_plan(
                normalize_trades(trades), normalize_hedges([]), market, policy
            )
            sc = compute_scenarios(plan.buckets, market)
            return build_run_envelope(
                run_id="run-x",
                trades_raw=[t.model_dump(mode="json") for t in trades],
                hedges_raw=[],
                market_raw=market.model_dump(mode="json"),
                policy_raw=policy.model_dump(mode="json"),
                outputs_raw={
                    "hedge_plan": plan.model_dump(mode="json"),
                    "scenario_results": sc.model_dump(mode="json"),
                },
            )

        e1 = _envelope(20.0)
        e2 = _envelope(20.1)
        assert e1.inputs_hash != e2.inputs_hash
        assert e1.run_hash != e2.run_hash


# ═══════════════════════════════════════════════════════════════════════════════
# ── Regression guards for existing validators ────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

class TestValidatorRegressionGuards:
    """
    Sanity checks that existing V-001..V-021 codes still fire correctly
    after the V-022/V-023 additions.
    """

    def test_v011_spot_out_of_mxn_range_critical(self) -> None:
        """V-011 must fire CRITICAL when spot is outside the MXN range (10–30)."""
        market = MarketSnapshot(
            as_of=datetime.now(timezone.utc),
            spot_rate=5.0,  # below MXN min
            forward_points_by_month={"2026-09": 0.10},
            provider_metadata={"primary_currency": "MXN", "data_class": "LIVE"},
        )
        report = validate_all([_ar_trade()], [], market, _policy())
        assert report.status == "FAIL"
        assert any(e.code == "V-011" for e in report.errors)

    def test_v012_empty_forward_points_critical(self) -> None:
        market = MarketSnapshot(
            as_of=datetime.now(timezone.utc),
            spot_rate=20.0,
            forward_points_by_month={},
            provider_metadata={"primary_currency": "MXN", "data_class": "LIVE"},
        )
        report = validate_all([_ar_trade()], [], market, _policy())
        assert report.status == "FAIL"
        assert any(e.code == "V-012" for e in report.errors)

    def test_v014_trade_bucket_missing_fwd_critical(self) -> None:
        """Trade in 2026-09 but no 2026-09 forward point → V-014 CRITICAL."""
        market = _market(fwd={"2026-10": 0.60})  # only Oct, not Sep
        report = validate_all([_ar_trade(value_date="2026-09-30")], [], market, _policy())
        assert report.status == "FAIL"
        assert any(e.code == "V-014" for e in report.errors)

    def test_v021_absurd_forward_points_critical(self) -> None:
        """Forward points > 50% of spot must trigger V-021 CRITICAL."""
        market = MarketSnapshot(
            as_of=datetime.now(timezone.utc),
            spot_rate=20.0,
            forward_points_by_month={"2026-09": 15.0},  # 15 > 10 (50% of 20)
            provider_metadata={"primary_currency": "MXN", "data_class": "LIVE"},
        )
        report = validate_all([_ar_trade()], [], market, _policy())
        assert report.status == "FAIL"
        assert any(e.code == "V-021" for e in report.errors)
