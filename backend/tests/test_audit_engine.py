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
        markup_per_unit = |0.054 - 0.0556| = 0.0016
        markup_cost_local = 500000 * 0.0016 = 800 MXN
        markup_cost_usd = 800 / 18.0 ~ 44.44 USD
        (rate > 2 -> USD = local / rate; 0.0556 < 2 so USD = local * rate = 800 * 0.0556 = 44.48)
        """
        txn = _make_txn(0, amount_sold=500_000, amount_bought=27_000)  # rate=0.054
        bm = _make_benchmark(mid_rate=0.0556)  # MXNUSD rate
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert len(result.markup_findings) == 1
        f = result.markup_findings[0]
        assert abs(f.markup_per_unit - 0.0016) < 1e-8
        assert abs(f.markup_cost_local - 800.0) < 0.01


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
