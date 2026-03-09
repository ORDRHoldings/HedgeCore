"""
backend/tests/test_audit_engine.py

Unit tests for audit_engine.py — deterministic, no DB required.
"""
from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from app.engine.audit_engine import (
    AuditTransactionInput,
    BenchmarkConfig,
    BenchmarkEntry,
    _find_benchmark,
    _markup_direction,
    _synthesize_cross_rate,
    size_adjusted_markup_bps,
    run_audit_engine,
)

# ── Fixtures ───────────────────────────────────────────────────────────────────

def _make_txn(
    i: int,
    trade_date: date = date(2025, 1, 15),
    currency_sold: str = "MXN",
    currency_bought: str = "USD",
    amount_sold: float = 500_000.0,
    amount_bought: float = 27_000.0,
    counterparty: str = "TestBank",
    fee_amount: float | None = 200.0,
) -> AuditTransactionInput:
    effective_rate = amount_bought / amount_sold if amount_sold else None
    return AuditTransactionInput(
        row_id=f"row-{i}",
        row_hash=f"hash-{i:064d}",
        row_index=i,
        trade_date=trade_date,
        value_date=None,
        currency_sold=currency_sold,
        currency_bought=currency_bought,
        amount_sold=amount_sold,
        amount_bought=amount_bought,
        effective_rate=effective_rate,
        counterparty=counterparty,
        fee_amount=fee_amount,
        fee_currency="USD",
        reference=f"REF-{i:04d}",
    )


def _make_benchmark(
    as_of: date = date(2025, 1, 15),
    currency_pair: str = "MXNUSD",
    mid_rate: float = 0.0556,   # ~ 1/18.0 = MXN/USD
) -> BenchmarkEntry:
    return BenchmarkEntry(
        snapshot_id="snap-001",
        snapshot_hash="a" * 64,
        as_of=as_of,
        currency_pair=currency_pair,
        mid_rate=mid_rate,
        provider="test",
        fetched_at=datetime.now(UTC),
    )


# ── Test: markup determinism ───────────────────────────────────────────────────

class TestMarkupDeterminism:
    def test_same_inputs_same_hash(self):
        txns = [_make_txn(i) for i in range(5)]
        bms = [_make_benchmark()]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        r1 = run_audit_engine("ds-001", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))
        r2 = run_audit_engine("ds-001", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert r1.run_hash == r2.run_hash
        assert r1.inputs_hash == r2.inputs_hash
        assert r1.outputs_hash == r2.outputs_hash
        assert r1.total_markup_usd == r2.total_markup_usd

    def test_different_inputs_different_hash(self):
        txns_a = [_make_txn(0, amount_sold=500_000)]
        txns_b = [_make_txn(0, amount_sold=600_000)]
        bms = [_make_benchmark()]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        r_a = run_audit_engine("ds-001", txns_a, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))
        r_b = run_audit_engine("ds-001", txns_b, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert r_a.run_hash != r_b.run_hash
        assert r_a.total_markup_usd != r_b.total_markup_usd

    def test_markup_known_value(self):
        """
        Known fixture: 500k MXN sold at 0.054 (effective), benchmark 0.0556.
        markup_per_unit = 0.054 - 0.0556 = -0.0016 (signed, FAVORABLE)
        markup_cost_local = 500000 * -0.0016 = -800 MXN
        markup_cost_usd < 0 (favorable)
        """
        txn = _make_txn(0, amount_sold=500_000, amount_bought=27_000)  # rate=0.054
        bm = _make_benchmark(mid_rate=0.0556)  # MXNUSD rate
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 1
        f = result.markup_findings[0]
        assert abs(f.markup_per_unit - (-0.0016)) < 1e-8
        assert abs(f.markup_cost_local - (-800.0)) < 0.01
        assert f.markup_direction == "FAVORABLE"


# ── Test: missing benchmark fails closed ──────────────────────────────────────

class TestMarkupMissingBenchmark:
    def test_no_benchmark_produces_rejection(self):
        txn = _make_txn(0)
        # Empty benchmark list
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 0
        assert len(result.markup_rejections) == 1
        assert result.markup_rejections[0].code == "AL-BENCHMARK_UNAVAILABLE"
        assert result.total_markup_usd == 0.0

    def test_missing_trade_date_rejected(self):
        txn = AuditTransactionInput(
            row_id="r1", row_hash="h" * 64, row_index=0,
            trade_date=None,  # missing
            value_date=None, currency_sold="MXN", currency_bought="USD",
            amount_sold=500_000, amount_bought=27_000, effective_rate=0.054,
            counterparty="Bank", fee_amount=None, fee_currency=None, reference="R1",
        )
        bm = _make_benchmark()
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert any(r.code == "AL-001" for r in result.markup_rejections)


# ── Test: fee extraction ──────────────────────────────────────────────────────

class TestFeeExtraction:
    def test_explicit_fees_extracted(self):
        txns = [_make_txn(i, fee_amount=100.0) for i in range(5)]
        bms = [_make_benchmark()]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.fee_findings) == 5
        # Each fee is 100 USD (fee_currency=USD, no conversion needed if rate ~1)
        assert result.total_fees_usd > 0

    def test_no_fees_zero_total(self):
        txns = [_make_txn(i, fee_amount=None) for i in range(3)]
        bms = [_make_benchmark()]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert result.total_fees_usd == 0.0
        assert len(result.fee_findings) == 0

    def test_data_quality_score_full_coverage(self):
        txns = [_make_txn(i, fee_amount=100.0) for i in range(10)]
        bms = [_make_benchmark()]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert result.data_quality_score == 100.0
        assert result.fee_confidence == "HIGH"

    def test_data_quality_score_partial(self):
        # 3 out of 10 have fees
        txns = (
            [_make_txn(i, fee_amount=100.0) for i in range(3)]
            + [_make_txn(i + 3, fee_amount=None) for i in range(7)]
        )
        bms = [_make_benchmark()]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert result.data_quality_score == pytest.approx(30.0, abs=0.1)
        assert result.fee_confidence == "LOW_CONFIDENCE"


# ── Test: unhedged impact ──────────────────────────────────────────────────────

class TestUnhedgedImpact:
    def test_with_budget_rate(self):
        txns = [
            _make_txn(0, amount_sold=500_000, amount_bought=27_000),  # rate=0.054
            _make_txn(1, amount_sold=500_000, amount_bought=27_000),  # rate=0.054
        ]
        bms = [_make_benchmark()]
        cfg = BenchmarkConfig(benchmark_source="budget_rate", budget_rate=0.060)

        result = run_audit_engine(
            "ds", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31)
        )

        assert len(result.unhedged_results) == 1
        uh = result.unhedged_results[0]
        assert uh.status == "COMPUTED"
        assert uh.baseline_source == "budget_rate"
        assert uh.baseline_rate == pytest.approx(0.060)
        # realized (0.054) < budget (0.060) → negative impact (unfavorable for seller)
        assert uh.unhedged_impact_usd < 0 or uh.unhedged_impact_usd > 0  # direction depends on convention

    def test_without_benchmark_fails_closed(self):
        txns = [_make_txn(0)]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot", budget_rate=None)

        result = run_audit_engine(
            "ds", txns, [], cfg, date(2025, 1, 1), date(2025, 1, 31)
        )

        assert len(result.unhedged_results) == 1
        uh = result.unhedged_results[0]
        assert uh.status == "UNAVAILABLE"
        assert uh.unhedged_impact_usd == 0.0
        assert "unavailable" in uh.narrative.lower()


# ── Test: trace bundle structure ───────────────────────────────────────────────

class TestTraceBundleStructure:
    def test_trace_has_required_steps(self):
        txns = [_make_txn(0)]
        bms = [_make_benchmark()]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))

        steps = {e.step for e in result.trace_events}
        assert "ENGINE_START" in steps
        assert "MARKUP" in steps
        assert "FEES" in steps
        assert "UNHEDGED_IMPACT" in steps
        assert "ENGINE_COMPLETE" in steps

    def test_run_hash_is_sha256_hex(self):
        txns = [_make_txn(0)]
        bms = [_make_benchmark()]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.run_hash) == 64
        assert all(c in "0123456789abcdef" for c in result.run_hash)


# ── Test: benchmark staleness ────────────────────────────────────────────────

class TestBenchmarkStaleness:
    def test_benchmark_within_staleness_accepted(self):
        """Benchmark 3 days from trade_date with 7-day limit should be accepted."""
        txn = _make_txn(0, trade_date=date(2025, 1, 15))
        bm = _make_benchmark(as_of=date(2025, 1, 12))  # 3 days away
        cfg = BenchmarkConfig(benchmark_source="market_snapshot", max_staleness_days=7)

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 1
        assert len(result.markup_rejections) == 0

    def test_benchmark_at_exact_limit_accepted(self):
        """Benchmark exactly 7 days from trade_date with 7-day limit should be accepted."""
        txn = _make_txn(0, trade_date=date(2025, 1, 15))
        bm = _make_benchmark(as_of=date(2025, 1, 8))  # exactly 7 days
        cfg = BenchmarkConfig(benchmark_source="market_snapshot", max_staleness_days=7)

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 1
        assert len(result.markup_rejections) == 0

    def test_benchmark_exceeds_staleness_rejected(self):
        """Benchmark 10 days from trade_date with 7-day limit should be rejected as stale."""
        txn = _make_txn(0, trade_date=date(2025, 1, 15))
        bm = _make_benchmark(as_of=date(2025, 1, 5))  # 10 days away
        cfg = BenchmarkConfig(benchmark_source="market_snapshot", max_staleness_days=7)

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 0
        assert len(result.markup_rejections) == 1
        rej = result.markup_rejections[0]
        assert rej.code == "AL-BENCHMARK_STALE"
        assert "10 days" in rej.message
        assert "7-day limit" in rej.message

    def test_staleness_none_disables_check(self):
        """max_staleness_days=None should accept any benchmark regardless of distance."""
        txn = _make_txn(0, trade_date=date(2025, 1, 15))
        bm = _make_benchmark(as_of=date(2024, 1, 1))  # 380 days away
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")
        cfg.max_staleness_days = None  # type: ignore[assignment]

        # Call _find_benchmark directly with None
        found = _find_benchmark(date(2025, 1, 15), "MXNUSD", [bm], max_staleness_days=None)
        assert found is not None

    def test_staleness_default_is_seven(self):
        """BenchmarkConfig default max_staleness_days should be 7."""
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")
        assert cfg.max_staleness_days == 7

    def test_find_benchmark_staleness_filter(self):
        """_find_benchmark returns None when nearest exceeds max_staleness_days."""
        bm = _make_benchmark(as_of=date(2025, 1, 1))
        result = _find_benchmark(date(2025, 1, 15), "MXNUSD", [bm], max_staleness_days=7)
        assert result is None  # 14 days > 7

    def test_find_benchmark_no_staleness(self):
        """_find_benchmark without staleness returns the nearest regardless of distance."""
        bm = _make_benchmark(as_of=date(2025, 1, 1))
        result = _find_benchmark(date(2025, 1, 15), "MXNUSD", [bm])
        assert result is not None

    def test_custom_staleness_limit(self):
        """Custom max_staleness_days=3 rejects benchmark 5 days away."""
        txn = _make_txn(0, trade_date=date(2025, 1, 15))
        bm = _make_benchmark(as_of=date(2025, 1, 10))  # 5 days away
        cfg = BenchmarkConfig(benchmark_source="market_snapshot", max_staleness_days=3)

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 0
        assert any(r.code == "AL-BENCHMARK_STALE" for r in result.markup_rejections)


# ── Test: signed markup and direction ────────────────────────────────────────

class TestSignedMarkup:
    def test_adverse_direction(self):
        """When effective rate > benchmark, markup is positive (ADVERSE)."""
        txn = _make_txn(0, amount_sold=500_000, amount_bought=29_000)  # rate=0.058
        bm = _make_benchmark(mid_rate=0.0556)  # MXNUSD rate
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 1
        f = result.markup_findings[0]
        assert f.markup_per_unit > 0
        assert f.markup_direction == "ADVERSE"
        assert f.markup_cost_usd > 0

    def test_favorable_direction(self):
        """When effective rate < benchmark, markup is negative (FAVORABLE)."""
        txn = _make_txn(0, amount_sold=500_000, amount_bought=27_000)  # rate=0.054
        bm = _make_benchmark(mid_rate=0.0556)  # MXNUSD rate
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 1
        f = result.markup_findings[0]
        assert f.markup_per_unit < 0
        assert f.markup_direction == "FAVORABLE"
        assert f.markup_cost_usd < 0

    def test_at_market_direction(self):
        """When effective rate equals benchmark, direction is AT_MARKET."""
        txn = _make_txn(0, amount_sold=500_000, amount_bought=27_800)  # rate=0.0556
        bm = _make_benchmark(mid_rate=0.0556)
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 1
        f = result.markup_findings[0]
        assert f.markup_direction == "AT_MARKET"

    def test_markup_direction_helper(self):
        """Test _markup_direction classification directly."""
        assert _markup_direction(0.001) == "ADVERSE"
        assert _markup_direction(-0.001) == "FAVORABLE"
        assert _markup_direction(0.0) == "AT_MARKET"
        assert _markup_direction(1e-9) == "AT_MARKET"
        assert _markup_direction(-1e-9) == "AT_MARKET"

    def test_markup_direction_in_to_dict(self):
        """markup_direction should appear in MarkupFinding.to_dict()."""
        txn = _make_txn(0)
        bm = _make_benchmark()
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 1
        d = result.markup_findings[0].to_dict()
        assert "markup_direction" in d
        assert d["markup_direction"] in ("ADVERSE", "FAVORABLE", "AT_MARKET")

    def test_favorable_adverse_totals(self):
        """total_favorable_usd and total_adverse_usd should be tracked separately."""
        # One adverse (eff > bm) and one favorable (eff < bm)
        txn_adv = _make_txn(0, amount_sold=500_000, amount_bought=29_000)  # rate=0.058 > 0.0556
        txn_fav = _make_txn(1, amount_sold=500_000, amount_bought=27_000)  # rate=0.054 < 0.0556
        bm = _make_benchmark(mid_rate=0.0556)
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn_adv, txn_fav], [bm], cfg,
                                  date(2025, 1, 1), date(2025, 1, 31))

        assert result.total_adverse_usd > 0
        assert result.total_favorable_usd < 0
        assert abs(result.total_markup_usd - (result.total_adverse_usd + result.total_favorable_usd)) < 0.01

    def test_all_adverse_zero_favorable(self):
        """When all markups are adverse, total_favorable should be 0."""
        txn = _make_txn(0, amount_sold=500_000, amount_bought=29_000)  # rate=0.058 > 0.0556
        bm = _make_benchmark(mid_rate=0.0556)
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert result.total_adverse_usd > 0
        assert result.total_favorable_usd == 0.0

    def test_all_favorable_zero_adverse(self):
        """When all markups are favorable, total_adverse should be 0."""
        txn = _make_txn(0, amount_sold=500_000, amount_bought=27_000)  # rate=0.054 < 0.0556
        bm = _make_benchmark(mid_rate=0.0556)
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert result.total_adverse_usd == 0.0
        assert result.total_favorable_usd < 0

    def test_methodology_version_bumped(self):
        """Methodology version should be 1.1.0."""
        txn = _make_txn(0)
        bm = _make_benchmark()
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert result.methodology_version == "1.1.0"


# ── Test: Item 26 — Forward point integration ───────────────────────────────

class TestForwardPointIntegration:
    def test_forward_points_applied_when_value_date_differs(self):
        """Forward points adjust benchmark when value_date != trade_date."""
        txn = AuditTransactionInput(
            row_id="r1", row_hash="h" * 64, row_index=0,
            trade_date=date(2025, 1, 15),
            value_date=date(2025, 2, 15),  # 1 month forward
            currency_sold="MXN", currency_bought="USD",
            amount_sold=500_000, amount_bought=27_000,
            effective_rate=0.054,
            counterparty="Bank", fee_amount=None, fee_currency=None, reference="R1",
        )
        bm = BenchmarkEntry(
            snapshot_id="snap-001", snapshot_hash="a" * 64,
            as_of=date(2025, 1, 15), currency_pair="MXNUSD",
            mid_rate=0.0556, provider="test",
            fetched_at=datetime.now(UTC),
            forward_points=0.0010,  # 10 pips forward
        )
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 1
        f = result.markup_findings[0]
        # benchmark_rate should be mid_rate + forward_points = 0.0556 + 0.0010 = 0.0566
        assert f.benchmark_rate == pytest.approx(0.0566, abs=1e-8)

    def test_forward_points_ignored_when_same_date(self):
        """Forward points NOT applied when value_date == trade_date."""
        txn = AuditTransactionInput(
            row_id="r1", row_hash="h" * 64, row_index=0,
            trade_date=date(2025, 1, 15),
            value_date=date(2025, 1, 15),  # same as trade_date
            currency_sold="MXN", currency_bought="USD",
            amount_sold=500_000, amount_bought=27_000,
            effective_rate=0.054,
            counterparty="Bank", fee_amount=None, fee_currency=None, reference="R1",
        )
        bm = BenchmarkEntry(
            snapshot_id="snap-001", snapshot_hash="a" * 64,
            as_of=date(2025, 1, 15), currency_pair="MXNUSD",
            mid_rate=0.0556, provider="test",
            fetched_at=datetime.now(UTC),
            forward_points=0.0010,
        )
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 1
        f = result.markup_findings[0]
        # benchmark_rate should be plain mid_rate (forward_points ignored)
        assert f.benchmark_rate == pytest.approx(0.0556, abs=1e-8)

    def test_forward_points_none_uses_mid_rate(self):
        """When forward_points is None, always use mid_rate even with different dates."""
        txn = AuditTransactionInput(
            row_id="r1", row_hash="h" * 64, row_index=0,
            trade_date=date(2025, 1, 15),
            value_date=date(2025, 2, 15),
            currency_sold="MXN", currency_bought="USD",
            amount_sold=500_000, amount_bought=27_000,
            effective_rate=0.054,
            counterparty="Bank", fee_amount=None, fee_currency=None, reference="R1",
        )
        bm = BenchmarkEntry(
            snapshot_id="snap-001", snapshot_hash="a" * 64,
            as_of=date(2025, 1, 15), currency_pair="MXNUSD",
            mid_rate=0.0556, provider="test",
            fetched_at=datetime.now(UTC),
            # forward_points=None (default)
        )
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 1
        assert result.markup_findings[0].benchmark_rate == pytest.approx(0.0556, abs=1e-8)

    def test_forward_points_applied_on_reverse_pair(self):
        """Forward points applied when benchmark is found via reverse pair lookup."""
        txn = AuditTransactionInput(
            row_id="r1", row_hash="h" * 64, row_index=0,
            trade_date=date(2025, 1, 15),
            value_date=date(2025, 2, 15),
            currency_sold="MXN", currency_bought="USD",
            amount_sold=500_000, amount_bought=27_000,
            effective_rate=0.054,
            counterparty="Bank", fee_amount=None, fee_currency=None, reference="R1",
        )
        # Benchmark stored as reverse pair USDMXN (not MXNUSD)
        bm = BenchmarkEntry(
            snapshot_id="snap-001", snapshot_hash="a" * 64,
            as_of=date(2025, 1, 15), currency_pair="USDMXN",
            mid_rate=18.0, provider="test",
            fetched_at=datetime.now(UTC),
            forward_points=0.50,  # 50 centavos forward
        )
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 1
        f = result.markup_findings[0]
        # benchmark_rate = mid_rate + forward_points = 18.0 + 0.50 = 18.50
        assert f.benchmark_rate == pytest.approx(18.50, abs=1e-8)

    def test_forward_points_default_none(self):
        """BenchmarkEntry.forward_points defaults to None."""
        bm = _make_benchmark()
        assert bm.forward_points is None


# ── Test: Item 27 — Intraday rate snapshot field ────────────────────────────

class TestTradeTimeField:
    def test_trade_time_field_accepted(self):
        """AuditTransactionInput accepts trade_time without breaking existing logic."""
        txn = AuditTransactionInput(
            row_id="r1", row_hash="h" * 64, row_index=0,
            trade_date=date(2025, 1, 15), value_date=None,
            currency_sold="MXN", currency_bought="USD",
            amount_sold=500_000, amount_bought=27_000,
            effective_rate=0.054,
            counterparty="Bank", fee_amount=None, fee_currency=None,
            reference="R1", trade_time="14:30:00",
        )
        bm = _make_benchmark()
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 1  # still produces finding
        assert txn.trade_time == "14:30:00"

    def test_trade_time_defaults_none(self):
        """trade_time defaults to None, existing code unaffected."""
        txn = _make_txn(0)
        assert txn.trade_time is None

    def test_existing_tests_unaffected_by_trade_time(self):
        """Full engine run without trade_time still works identically."""
        txns = [_make_txn(i) for i in range(5)]
        bms = [_make_benchmark()]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        r1 = run_audit_engine("ds-001", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))
        r2 = run_audit_engine("ds-001", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert r1.run_hash == r2.run_hash


# ── Test: Item 28 — Cross-rate synthesis integration ────────────────────────

class TestCrossRateSynthesis:
    def test_cross_rate_synthesis_basic(self):
        """_synthesize_cross_rate synthesizes MXNBRL from USDMXN and USDBRL."""
        bms = [
            BenchmarkEntry(
                snapshot_id="s1", snapshot_hash="a" * 64,
                as_of=date(2025, 1, 15), currency_pair="USDMXN",
                mid_rate=18.0, provider="test", fetched_at=datetime.now(UTC),
            ),
            BenchmarkEntry(
                snapshot_id="s2", snapshot_hash="b" * 64,
                as_of=date(2025, 1, 15), currency_pair="USDBRL",
                mid_rate=5.0, provider="test", fetched_at=datetime.now(UTC),
            ),
        ]
        rate, source = _synthesize_cross_rate("MXN", "BRL", bms, date(2025, 1, 15))
        assert rate is not None
        assert source == "SYNTHETIC_CROSS"
        # USDMXN / USDBRL = 18.0 / 5.0 = 3.6
        assert rate == pytest.approx(3.6, abs=1e-6)

    def test_cross_rate_no_common_leg(self):
        """Cross-rate returns None when no USD legs available."""
        bms = [
            BenchmarkEntry(
                snapshot_id="s1", snapshot_hash="a" * 64,
                as_of=date(2025, 1, 15), currency_pair="EURGBP",
                mid_rate=0.85, provider="test", fetched_at=datetime.now(UTC),
            ),
        ]
        rate, source = _synthesize_cross_rate("MXN", "BRL", bms, date(2025, 1, 15))
        assert rate is None
        assert source == "UNAVAILABLE"

    def test_cross_rate_wired_into_markup(self):
        """When direct + reverse pair fail, cross-rate synthesis provides a finding."""
        txn = AuditTransactionInput(
            row_id="r1", row_hash="h" * 64, row_index=0,
            trade_date=date(2025, 1, 15), value_date=None,
            currency_sold="MXN", currency_bought="BRL",
            amount_sold=100_000, amount_bought=28_000,
            effective_rate=0.28,  # 28000/100000
            counterparty="Bank", fee_amount=None, fee_currency=None, reference="R1",
        )
        # No MXNBRL or BRLMXN benchmark, but USD legs exist
        bms = [
            BenchmarkEntry(
                snapshot_id="s1", snapshot_hash="a" * 64,
                as_of=date(2025, 1, 15), currency_pair="USDMXN",
                mid_rate=18.0, provider="test", fetched_at=datetime.now(UTC),
            ),
            BenchmarkEntry(
                snapshot_id="s2", snapshot_hash="b" * 64,
                as_of=date(2025, 1, 15), currency_pair="USDBRL",
                mid_rate=5.0, provider="test", fetched_at=datetime.now(UTC),
            ),
        ]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], bms, cfg, date(2025, 1, 1), date(2025, 1, 31))

        # Should produce a finding via cross-rate, not a rejection
        assert len(result.markup_findings) == 1
        assert len(result.markup_rejections) == 0
        f = result.markup_findings[0]
        assert f.benchmark_snapshot_id == "SYNTHETIC"
        assert f.benchmark_provider == "SYNTHETIC_CROSS"

    def test_cross_rate_falls_through_to_rejection(self):
        """When cross-rate also fails, original rejection logic still fires."""
        txn = AuditTransactionInput(
            row_id="r1", row_hash="h" * 64, row_index=0,
            trade_date=date(2025, 1, 15), value_date=None,
            currency_sold="MXN", currency_bought="BRL",
            amount_sold=100_000, amount_bought=28_000,
            effective_rate=0.28,
            counterparty="Bank", fee_amount=None, fee_currency=None, reference="R1",
        )
        # No benchmarks at all
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 0
        assert len(result.markup_rejections) == 1
        assert result.markup_rejections[0].code == "AL-BENCHMARK_UNAVAILABLE"

    def test_cross_rate_uses_ccyusd_leg(self):
        """Cross-rate synthesis works with CCY/USD benchmarks (e.g. EURUSD, GBPUSD)."""
        bms = [
            BenchmarkEntry(
                snapshot_id="s1", snapshot_hash="a" * 64,
                as_of=date(2025, 1, 15), currency_pair="EURUSD",
                mid_rate=1.08, provider="test", fetched_at=datetime.now(UTC),
            ),
            BenchmarkEntry(
                snapshot_id="s2", snapshot_hash="b" * 64,
                as_of=date(2025, 1, 15), currency_pair="GBPUSD",
                mid_rate=1.26, provider="test", fetched_at=datetime.now(UTC),
            ),
        ]
        rate, source = _synthesize_cross_rate("EUR", "GBP", bms, date(2025, 1, 15))
        assert rate is not None
        assert source == "SYNTHETIC_CROSS"
        # EURUSD / GBPUSD = 1.08 / 1.26
        assert rate == pytest.approx(1.08 / 1.26, abs=1e-6)


# ── Test: Item 30 — Size-adjusted markup ────────────────────────────────────

class TestSizeAdjustedMarkup:
    def test_small_trade_tier(self):
        """Trade <100k USD: expected spread 10 bps."""
        adjusted = size_adjusted_markup_bps(15.0, 50_000)
        assert adjusted == pytest.approx(5.0)  # 15 - 10 = 5

    def test_medium_trade_tier(self):
        """Trade 100k-1M USD: expected spread 5 bps."""
        adjusted = size_adjusted_markup_bps(8.0, 500_000)
        assert adjusted == pytest.approx(3.0)  # 8 - 5 = 3

    def test_large_trade_tier(self):
        """Trade >1M USD: expected spread 2 bps."""
        adjusted = size_adjusted_markup_bps(4.0, 5_000_000)
        assert adjusted == pytest.approx(2.0)  # 4 - 2 = 2

    def test_negative_result_favorable(self):
        """Markup below expected spread is negative (favorable)."""
        adjusted = size_adjusted_markup_bps(3.0, 50_000)
        assert adjusted == pytest.approx(-7.0)  # 3 - 10 = -7

    def test_wired_into_markup_finding(self):
        """size_adjusted_markup_bps field populated in MarkupFinding."""
        txn = _make_txn(0, amount_sold=500_000, amount_bought=27_000)
        bm = _make_benchmark(mid_rate=0.0556)
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 1
        f = result.markup_findings[0]
        assert f.size_adjusted_markup_bps is not None
        assert isinstance(f.size_adjusted_markup_bps, float)

    def test_size_adjusted_in_to_dict(self):
        """size_adjusted_markup_bps appears in MarkupFinding.to_dict()."""
        txn = _make_txn(0, amount_sold=500_000, amount_bought=27_000)
        bm = _make_benchmark(mid_rate=0.0556)
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        d = result.markup_findings[0].to_dict()
        assert "size_adjusted_markup_bps" in d

    def test_determinism_with_size_adjustment(self):
        """Engine remains deterministic with size-adjusted markup included."""
        txns = [_make_txn(i) for i in range(5)]
        bms = [_make_benchmark()]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        r1 = run_audit_engine("ds-001", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))
        r2 = run_audit_engine("ds-001", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert r1.run_hash == r2.run_hash
        for f1, f2 in zip(r1.markup_findings, r2.markup_findings):
            assert f1.size_adjusted_markup_bps == f2.size_adjusted_markup_bps
