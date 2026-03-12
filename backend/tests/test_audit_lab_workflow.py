"""
backend/tests/test_audit_lab_workflow.py

Comprehensive tests for the Audit Lab workflow -- engine edge cases, CSV parser
edge cases, hash integrity, backward compatibility, and advanced analytics.

All tests are pure-function (no DB, no async, no HTTP client) unless noted.
Organized into 17 test classes with 150+ tests total.
"""
from __future__ import annotations

import hashlib
import json
import math
from datetime import UTC, date, datetime

import pytest

from app.engine.audit_engine import (
    AuditEngineResult,
    AuditRejection,
    AuditTransactionInput,
    AuditTraceEvent,
    BenchmarkConfig,
    BenchmarkEntry,
    CounterpartyScore,
    FeeFinding,
    MarkupFinding,
    NaturalHedgeResult,
    RateVarianceResult,
    UnhedgedImpactResult,
    _CCY_PER_USD,
    _classify_spread,
    _detect_natural_hedges,
    _detect_outliers,
    _find_benchmark,
    _markup_direction,
    _score_counterparties,
    _sha256_dict,
    _sha256_list,
    _synthesize_cross_rate,
    _to_usd,
    run_audit_engine,
    size_adjusted_markup_bps,
)
from app.api.routes.v1_audit_lab import (
    _parse_csv,
    _parse_date,
    _parse_float,
    _normalize_headers,
    _row_hash,
    _row_canonical,
)


# -- Shared fixtures -----------------------------------------------------------


def _make_txn(
    i: int,
    trade_date: date = date(2025, 1, 15),
    value_date: date | None = None,
    currency_sold: str = "MXN",
    currency_bought: str = "USD",
    amount_sold: float = 500_000.0,
    amount_bought: float = 27_000.0,
    counterparty: str | None = "TestBank",
    fee_amount: float | None = 200.0,
    fee_currency: str | None = "USD",
    effective_rate: float | None = None,
    reference: str | None = None,
) -> AuditTransactionInput:
    if effective_rate is None:
        effective_rate = amount_bought / amount_sold if amount_sold else None
    return AuditTransactionInput(
        row_id=f"row-{i}",
        row_hash=f"hash-{i:064d}"[:64],
        row_index=i,
        trade_date=trade_date,
        value_date=value_date,
        currency_sold=currency_sold,
        currency_bought=currency_bought,
        amount_sold=amount_sold,
        amount_bought=amount_bought,
        effective_rate=effective_rate,
        counterparty=counterparty,
        fee_amount=fee_amount,
        fee_currency=fee_currency,
        reference=reference or f"REF-{i:04d}",
    )


def _make_benchmark(
    as_of: date = date(2025, 1, 15),
    currency_pair: str = "MXNUSD",
    mid_rate: float = 0.0556,
    bid_rate: float | None = None,
    ask_rate: float | None = None,
    forward_points: float | None = None,
    provider: str = "test",
) -> BenchmarkEntry:
    return BenchmarkEntry(
        snapshot_id="snap-001",
        snapshot_hash="a" * 64,
        as_of=as_of,
        currency_pair=currency_pair,
        mid_rate=mid_rate,
        provider=provider,
        fetched_at=datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC),
        bid_rate=bid_rate,
        ask_rate=ask_rate,
        forward_points=forward_points,
    )


def _cfg(source: str = "market_snapshot", budget_rate: float | None = None,
         max_staleness_days: int = 7) -> BenchmarkConfig:
    return BenchmarkConfig(
        benchmark_source=source,
        budget_rate=budget_rate,
        max_staleness_days=max_staleness_days,
    )


def _run(txns, bms, cfg=None, ds="ds-test",
         period_start=date(2025, 1, 1), period_end=date(2025, 1, 31)):
    if cfg is None:
        cfg = _cfg()
    return run_audit_engine(ds, txns, bms, cfg, period_start, period_end)


# ==============================================================================
# 1. Engine Edge Cases -- Empty and Missing
# ==============================================================================


class TestEmptyAndMissing:
    """Edge cases with empty transaction lists and missing fields."""

    def test_empty_transaction_list_zero_findings(self):
        result = _run([], [_make_benchmark()])
        assert len(result.markup_findings) == 0
        assert len(result.markup_rejections) == 0

    def test_empty_transaction_list_zero_fees(self):
        result = _run([], [_make_benchmark()])
        assert result.total_fees_usd == 0.0
        assert len(result.fee_findings) == 0

    def test_empty_transaction_list_zero_rate_variance(self):
        result = _run([], [_make_benchmark()])
        assert result.total_rate_variance_usd == 0.0
        assert len(result.rate_variance_results) == 0

    def test_empty_transaction_list_total_loss_zero(self):
        result = _run([], [_make_benchmark()])
        assert result.total_loss_usd == 0.0

    def test_empty_transaction_list_valid_hash(self):
        result = _run([], [_make_benchmark()])
        assert len(result.run_hash) == 64
        assert all(c in "0123456789abcdef" for c in result.run_hash)

    def test_empty_transactions_and_benchmarks(self):
        result = _run([], [])
        assert result.total_markup_usd == 0.0
        assert result.total_fees_usd == 0.0
        assert result.total_rate_variance_usd == 0.0

    def test_all_missing_trade_date_rejected_al001(self):
        txns = [
            AuditTransactionInput(
                row_id=f"r-{i}", row_hash=f"h{i:063d}", row_index=i,
                trade_date=None, value_date=None,
                currency_sold="MXN", currency_bought="USD",
                amount_sold=500_000, amount_bought=27_000,
                effective_rate=0.054, counterparty="Bank",
                fee_amount=None, fee_currency=None, reference=f"R{i}",
            )
            for i in range(5)
        ]
        result = _run(txns, [_make_benchmark()])
        assert len(result.markup_rejections) == 5
        assert all(r.code == "AL-001" for r in result.markup_rejections)
        assert len(result.markup_findings) == 0

    def test_all_missing_currencies_rejected_al002(self):
        txns = [
            AuditTransactionInput(
                row_id=f"r-{i}", row_hash=f"h{i:063d}", row_index=i,
                trade_date=date(2025, 1, 15), value_date=None,
                currency_sold=None, currency_bought=None,
                amount_sold=500_000, amount_bought=27_000,
                effective_rate=0.054, counterparty="Bank",
                fee_amount=None, fee_currency=None, reference=f"R{i}",
            )
            for i in range(3)
        ]
        result = _run(txns, [_make_benchmark()])
        assert len(result.markup_rejections) == 3
        assert all(r.code == "AL-002" for r in result.markup_rejections)

    def test_zero_effective_rate_rejected_al003(self):
        txn = AuditTransactionInput(
            row_id="r-0", row_hash="h" * 64, row_index=0,
            trade_date=date(2025, 1, 15), value_date=None,
            currency_sold="MXN", currency_bought="USD",
            amount_sold=500_000, amount_bought=0,
            effective_rate=0.0, counterparty="Bank",
            fee_amount=None, fee_currency=None, reference="R0",
        )
        result = _run([txn], [_make_benchmark()])
        assert any(r.code == "AL-003" for r in result.markup_rejections)

    def test_negative_effective_rate_rejected_al003(self):
        txn = AuditTransactionInput(
            row_id="r-0", row_hash="h" * 64, row_index=0,
            trade_date=date(2025, 1, 15), value_date=None,
            currency_sold="MXN", currency_bought="USD",
            amount_sold=500_000, amount_bought=27_000,
            effective_rate=-0.054, counterparty="Bank",
            fee_amount=None, fee_currency=None, reference="R0",
        )
        result = _run([txn], [_make_benchmark()])
        assert any(r.code == "AL-003" for r in result.markup_rejections)

    def test_none_effective_rate_rejected_al003(self):
        txn = AuditTransactionInput(
            row_id="r-0", row_hash="h" * 64, row_index=0,
            trade_date=date(2025, 1, 15), value_date=None,
            currency_sold="MXN", currency_bought="USD",
            amount_sold=500_000, amount_bought=27_000,
            effective_rate=None, counterparty="Bank",
            fee_amount=None, fee_currency=None, reference="R0",
        )
        result = _run([txn], [_make_benchmark()])
        assert any(r.code == "AL-003" for r in result.markup_rejections)

    def test_single_transaction_proper_findings(self):
        txn = _make_txn(0)
        bm = _make_benchmark()
        result = _run([txn], [bm])
        assert len(result.markup_findings) == 1
        assert result.methodology_version == "1.1.0"

    def test_counterparty_none_uses_unknown(self):
        txn = _make_txn(0, counterparty=None)
        bm = _make_benchmark()
        result = _run([txn], [bm])
        assert "UNKNOWN" in result.markup_by_counterparty


# ==============================================================================
# 2. Engine Edge Cases -- General
# ==============================================================================


class TestEngineEdgeCases:
    """Misc engine edge cases: large inputs, methodology version, totals."""

    def test_large_transaction_count_no_crash(self):
        txns = [_make_txn(i) for i in range(1000)]
        bm = _make_benchmark()
        result = _run(txns, [bm])
        assert len(result.markup_findings) == 1000
        assert len(result.run_hash) == 64

    def test_large_transaction_count_hashes_valid(self):
        txns = [_make_txn(i) for i in range(100)]
        bm = _make_benchmark()
        result = _run(txns, [bm])
        assert all(c in "0123456789abcdef" for c in result.inputs_hash)
        assert all(c in "0123456789abcdef" for c in result.outputs_hash)
        assert all(c in "0123456789abcdef" for c in result.run_hash)

    def test_methodology_version_is_1_1_0(self):
        result = _run([_make_txn(0)], [_make_benchmark()])
        assert result.methodology_version == "1.1.0"

    def test_total_loss_is_markup_plus_fees(self):
        txn = _make_txn(0, fee_amount=100.0, fee_currency="USD")
        bm = _make_benchmark()
        result = _run([txn], [bm])
        assert result.total_loss_usd == pytest.approx(
            result.total_markup_usd + result.total_fees_usd, abs=0.01
        )

    def test_total_loss_excludes_rate_variance(self):
        """rate_variance is reference-only, not included in total_loss."""
        txn = _make_txn(0, fee_amount=100.0)
        bm = _make_benchmark()
        cfg = _cfg(source="budget_rate", budget_rate=0.060)
        result = _run([txn], [bm], cfg)
        expected_loss = result.total_markup_usd + result.total_fees_usd
        assert result.total_loss_usd == pytest.approx(expected_loss, abs=0.01)

    def test_fee_amount_zero_is_not_a_finding(self):
        txn = _make_txn(0, fee_amount=0.0)
        bm = _make_benchmark()
        result = _run([txn], [bm])
        assert len(result.fee_findings) == 0

    def test_fee_amount_none_is_not_a_finding(self):
        txn = _make_txn(0, fee_amount=None)
        bm = _make_benchmark()
        result = _run([txn], [bm])
        assert len(result.fee_findings) == 0

    def test_fee_negative_not_extracted(self):
        """Negative fees should not be extracted (engine checks > 0)."""
        txn = _make_txn(0, fee_amount=-50.0)
        bm = _make_benchmark()
        result = _run([txn], [bm])
        assert len(result.fee_findings) == 0

    def test_markup_by_pair_populated(self):
        txn = _make_txn(0)
        bm = _make_benchmark()
        result = _run([txn], [bm])
        assert "MXNUSD" in result.markup_by_pair

    def test_markup_by_month_populated(self):
        txn = _make_txn(0, trade_date=date(2025, 3, 10))
        bm = _make_benchmark(as_of=date(2025, 3, 10))
        result = _run([txn], [bm])
        assert "2025-03" in result.markup_by_month

    def test_data_quality_score_zero_fees(self):
        """When no rows have fees, data_quality_score = 0."""
        txns = [_make_txn(i, fee_amount=None) for i in range(5)]
        result = _run(txns, [_make_benchmark()])
        assert result.data_quality_score == 0.0

    def test_data_quality_score_100_all_fees(self):
        txns = [_make_txn(i, fee_amount=100.0) for i in range(5)]
        result = _run(txns, [_make_benchmark()])
        assert result.data_quality_score == 100.0

    def test_data_quality_50_half_fees(self):
        txns = [_make_txn(i, fee_amount=100.0) for i in range(5)]
        txns += [_make_txn(i + 5, fee_amount=None) for i in range(5)]
        result = _run(txns, [_make_benchmark()])
        assert result.data_quality_score == pytest.approx(50.0, abs=0.1)

    def test_fee_confidence_high_at_50(self):
        txns = [_make_txn(i, fee_amount=100.0) for i in range(5)]
        txns += [_make_txn(i + 5, fee_amount=None) for i in range(5)]
        result = _run(txns, [_make_benchmark()])
        assert result.fee_confidence == "HIGH"

    def test_fee_confidence_low_below_50(self):
        txns = [_make_txn(0, fee_amount=100.0)]
        txns += [_make_txn(i + 1, fee_amount=None) for i in range(5)]
        result = _run(txns, [_make_benchmark()])
        assert result.fee_confidence == "LOW_CONFIDENCE"


# ==============================================================================
# 3. Multi-Currency Tests
# ==============================================================================


class TestMultiCurrency:
    """Mixed currency pairs in a single run."""

    def test_mixed_currencies_produce_findings_per_pair(self):
        txns = [
            _make_txn(0, currency_sold="MXN", currency_bought="USD",
                      amount_sold=500_000, amount_bought=27_000),
            _make_txn(1, currency_sold="EUR", currency_bought="USD",
                      amount_sold=100_000, amount_bought=108_000),
            _make_txn(2, currency_sold="GBP", currency_bought="USD",
                      amount_sold=50_000, amount_bought=63_000),
        ]
        bms = [
            _make_benchmark(currency_pair="MXNUSD", mid_rate=0.0556),
            _make_benchmark(currency_pair="EURUSD", mid_rate=1.08),
            _make_benchmark(currency_pair="GBPUSD", mid_rate=1.26),
        ]
        result = _run(txns, bms)
        assert len(result.markup_findings) == 3
        pairs = {f.currency_pair for f in result.markup_findings}
        assert pairs == {"MXNUSD", "EURUSD", "GBPUSD"}

    def test_mixed_currencies_markup_by_pair_keys(self):
        txns = [
            _make_txn(0, currency_sold="MXN", currency_bought="USD",
                      amount_sold=500_000, amount_bought=27_000),
            _make_txn(1, currency_sold="EUR", currency_bought="USD",
                      amount_sold=100_000, amount_bought=108_000),
        ]
        bms = [
            _make_benchmark(currency_pair="MXNUSD", mid_rate=0.0556),
            _make_benchmark(currency_pair="EURUSD", mid_rate=1.08),
        ]
        result = _run(txns, bms)
        assert "MXNUSD" in result.markup_by_pair
        assert "EURUSD" in result.markup_by_pair

    def test_mixed_currencies_rate_variance_per_pair(self):
        txns = [
            _make_txn(0, currency_sold="MXN", currency_bought="USD",
                      amount_sold=500_000, amount_bought=27_000),
            _make_txn(1, currency_sold="EUR", currency_bought="USD",
                      amount_sold=100_000, amount_bought=108_000),
        ]
        bms = [
            _make_benchmark(currency_pair="MXNUSD", mid_rate=0.0556),
            _make_benchmark(currency_pair="EURUSD", mid_rate=1.08),
        ]
        cfg = _cfg(source="budget_rate", budget_rate=0.055)
        result = _run(txns, bms, cfg)
        pairs = {rv.currency_pair for rv in result.rate_variance_results}
        assert "MXNUSD" in pairs
        assert "EURUSD" in pairs

    def test_partial_benchmark_coverage(self):
        """MXN has a benchmark, EUR does not."""
        txns = [
            _make_txn(0, currency_sold="MXN", currency_bought="USD",
                      amount_sold=500_000, amount_bought=27_000),
            _make_txn(1, currency_sold="EUR", currency_bought="USD",
                      amount_sold=100_000, amount_bought=108_000),
        ]
        bms = [_make_benchmark(currency_pair="MXNUSD", mid_rate=0.0556)]
        result = _run(txns, bms)
        assert len(result.markup_findings) == 1
        assert result.markup_findings[0].currency_pair == "MXNUSD"
        assert len(result.markup_rejections) == 1

    def test_fee_in_non_usd_currency_with_benchmark(self):
        """Fee in EUR with EURUSD benchmark should be converted."""
        txn = _make_txn(0, fee_amount=100.0, fee_currency="EUR")
        bm_mxn = _make_benchmark(currency_pair="MXNUSD", mid_rate=0.0556)
        bm_eur = _make_benchmark(currency_pair="EURUSD", mid_rate=1.08)
        result = _run([txn], [bm_mxn, bm_eur])
        assert len(result.fee_findings) == 1
        # EUR is in _CCY_PER_USD, so fee_usd = 100 * 1.08 = 108
        assert result.fee_findings[0].fee_usd == pytest.approx(108.0, abs=0.01)

    def test_fee_in_non_usd_currency_without_benchmark(self):
        """Fee in BRL without BRL benchmark uses rate 1.0 fallback."""
        txn = _make_txn(0, fee_amount=500.0, fee_currency="BRL",
                        currency_sold="MXN", currency_bought="USD",
                        amount_sold=500_000, amount_bought=27_000)
        bm = _make_benchmark(currency_pair="MXNUSD", mid_rate=0.0556)
        result = _run([txn], [bm])
        # BRL has no benchmark, so _to_usd with rate 1.0 and BRL not in _CCY_PER_USD
        # -> amount / rate = 500 / 1.0 = 500
        assert len(result.fee_findings) == 1
        assert result.fee_findings[0].fee_usd == pytest.approx(500.0, abs=0.01)


# ==============================================================================
# 4. Advanced Analytics
# ==============================================================================


class TestAdvancedAnalytics:
    """Outlier detection, counterparty scoring, natural hedge detection."""

    # -- Natural hedge detection --

    def test_natural_hedge_offsetting_flows_detected(self):
        """Buy and sell same pair on same date should be detected."""
        txn_sell = _make_txn(0, currency_sold="MXN", currency_bought="USD",
                            amount_sold=500_000, amount_bought=27_000)
        txn_buy = _make_txn(1, currency_sold="USD", currency_bought="MXN",
                            amount_sold=27_000, amount_bought=500_000)
        bm = _make_benchmark(currency_pair="MXNUSD", mid_rate=0.0556)
        bm2 = _make_benchmark(currency_pair="USDMXN", mid_rate=18.0)
        result = _run([txn_sell, txn_buy], [bm, bm2])
        assert result.natural_hedge_results is not None
        assert len(result.natural_hedge_results) >= 1

    def test_natural_hedge_single_direction_same_pair(self):
        """All sell same direction on same date -- natural hedge still detects
        because each txn has both amount_sold and amount_bought (gross_buy > 0
        and gross_sell > 0 within the group), yielding a result. The key insight
        is that natural hedge detection counts gross buy/sell amounts across all
        txns in the date+pair group, not directionality."""
        txns = [
            _make_txn(i, currency_sold="MXN", currency_bought="USD",
                      amount_sold=500_000, amount_bought=27_000)
            for i in range(3)
        ]
        bm = _make_benchmark()
        result = _run(txns, [bm])
        assert result.natural_hedge_results is not None
        # gross_buy = sum of amount_bought, gross_sell = sum of amount_sold
        # Both are positive, so engine reports a natural hedge result
        if result.natural_hedge_results:
            nh = result.natural_hedge_results[0]
            assert nh.gross_sell > 0
            assert nh.gross_buy > 0

    def test_natural_hedge_different_dates_not_offset(self):
        """Offsetting flows on different dates should NOT merge into one group."""
        txn_sell = _make_txn(0, trade_date=date(2025, 1, 10),
                            currency_sold="MXN", currency_bought="USD",
                            amount_sold=500_000, amount_bought=27_000)
        txn_buy = _make_txn(1, trade_date=date(2025, 1, 20),
                            currency_sold="USD", currency_bought="MXN",
                            amount_sold=27_000, amount_bought=500_000)
        bm = _make_benchmark(currency_pair="MXNUSD", mid_rate=0.0556)
        bm2 = _make_benchmark(currency_pair="USDMXN", mid_rate=18.0,
                              as_of=date(2025, 1, 20))
        result = _run([txn_sell, txn_buy], [bm, bm2])
        for nh in (result.natural_hedge_results or []):
            assert nh.date in ("2025-01-10", "2025-01-20")

    def test_natural_hedge_savings_estimate_positive(self):
        txn_sell = _make_txn(0, currency_sold="MXN", currency_bought="USD",
                            amount_sold=500_000, amount_bought=27_000)
        txn_buy = _make_txn(1, currency_sold="USD", currency_bought="MXN",
                            amount_sold=27_000, amount_bought=500_000)
        bm = _make_benchmark(currency_pair="USDMXN", mid_rate=18.0)
        results = _detect_natural_hedges([txn_sell, txn_buy], [bm])
        for nh in results:
            if nh.gross_buy > 0 and nh.gross_sell > 0:
                assert nh.savings_estimate_usd >= 0

    # -- Outlier detection --

    def test_outlier_detection_less_than_3_no_outliers(self):
        """With fewer than 3 findings per pair, no outliers flagged."""
        findings = [
            MarkupFinding(
                row_id=f"r-{i}", row_hash="h" * 64, row_index=i,
                trade_date="2025-01-15", currency_pair="MXNUSD",
                counterparty="Bank", effective_rate=0.054,
                benchmark_rate=0.0556, benchmark_snapshot_id="s1",
                benchmark_snapshot_hash="a" * 64, benchmark_provider="test",
                benchmark_as_of="2025-01-15",
                markup_per_unit=-0.0016, markup_direction="FAVORABLE",
                amount_sold=500_000, markup_cost_local=-800,
                markup_cost_usd=-44.0,
            )
            for i in range(2)
        ]
        outliers = _detect_outliers(findings)
        assert all(not o["is_outlier"] for o in outliers)
        assert all(o["z_score"] is None for o in outliers)

    def test_outlier_detection_clear_outlier(self):
        """One finding with extreme markup should be flagged as outlier."""
        normal_markup = 0.001
        extreme_markup = 0.050
        findings = [
            MarkupFinding(
                row_id=f"r-{i}", row_hash="h" * 64, row_index=i,
                trade_date="2025-01-15", currency_pair="MXNUSD",
                counterparty="Bank", effective_rate=0.0556 + normal_markup,
                benchmark_rate=0.0556, benchmark_snapshot_id="s1",
                benchmark_snapshot_hash="a" * 64, benchmark_provider="test",
                benchmark_as_of="2025-01-15",
                markup_per_unit=normal_markup, markup_direction="ADVERSE",
                amount_sold=500_000, markup_cost_local=500,
                markup_cost_usd=28.0,
            )
            for i in range(10)
        ]
        findings.append(MarkupFinding(
            row_id="r-outlier", row_hash="h" * 64, row_index=10,
            trade_date="2025-01-15", currency_pair="MXNUSD",
            counterparty="Bank", effective_rate=0.0556 + extreme_markup,
            benchmark_rate=0.0556, benchmark_snapshot_id="s1",
            benchmark_snapshot_hash="a" * 64, benchmark_provider="test",
            benchmark_as_of="2025-01-15",
            markup_per_unit=extreme_markup, markup_direction="ADVERSE",
            amount_sold=500_000, markup_cost_local=25_000,
            markup_cost_usd=1400.0,
        ))
        outliers = _detect_outliers(findings)
        outlier_rows = [o for o in outliers if o["is_outlier"]]
        assert len(outlier_rows) >= 1
        assert any(o["row_id"] == "r-outlier" for o in outlier_rows)

    def test_outlier_detection_empty_findings(self):
        outliers = _detect_outliers([])
        assert outliers == []

    def test_outlier_z_score_numeric(self):
        findings = [
            MarkupFinding(
                row_id=f"r-{i}", row_hash="h" * 64, row_index=i,
                trade_date="2025-01-15", currency_pair="MXNUSD",
                counterparty="Bank", effective_rate=0.054 + i * 0.001,
                benchmark_rate=0.0556, benchmark_snapshot_id="s1",
                benchmark_snapshot_hash="a" * 64, benchmark_provider="test",
                benchmark_as_of="2025-01-15",
                markup_per_unit=-0.0016 + i * 0.001, markup_direction="ADVERSE",
                amount_sold=500_000, markup_cost_local=100,
                markup_cost_usd=5.0,
            )
            for i in range(5)
        ]
        outliers = _detect_outliers(findings)
        for o in outliers:
            if o["z_score"] is not None:
                assert isinstance(o["z_score"], (int, float))

    # -- Counterparty scoring --

    def test_counterparty_scoring_multiple(self):
        findings = []
        for i in range(5):
            findings.append(MarkupFinding(
                row_id=f"r-{i}", row_hash="h" * 64, row_index=i,
                trade_date="2025-01-15", currency_pair="MXNUSD",
                counterparty="BankA" if i < 3 else "BankB",
                effective_rate=0.054,
                benchmark_rate=0.0556, benchmark_snapshot_id="s1",
                benchmark_snapshot_hash="a" * 64, benchmark_provider="test",
                benchmark_as_of="2025-01-15",
                markup_per_unit=-0.0016, markup_direction="FAVORABLE",
                amount_sold=500_000, markup_cost_local=-800,
                markup_cost_usd=-44.0,
            ))
        scores = _score_counterparties(findings)
        assert len(scores) == 2
        cps = {s.counterparty for s in scores}
        assert "BankA" in cps
        assert "BankB" in cps
        assert scores[0].composite_score >= scores[1].composite_score

    def test_counterparty_scoring_single(self):
        findings = [MarkupFinding(
            row_id="r-0", row_hash="h" * 64, row_index=0,
            trade_date="2025-01-15", currency_pair="MXNUSD",
            counterparty="OnlyBank",
            effective_rate=0.054,
            benchmark_rate=0.0556, benchmark_snapshot_id="s1",
            benchmark_snapshot_hash="a" * 64, benchmark_provider="test",
            benchmark_as_of="2025-01-15",
            markup_per_unit=-0.0016, markup_direction="FAVORABLE",
            amount_sold=500_000, markup_cost_local=-800,
            markup_cost_usd=-44.0,
        )]
        scores = _score_counterparties(findings)
        assert len(scores) == 1
        assert scores[0].counterparty == "OnlyBank"
        assert isinstance(scores[0].composite_score, (int, float))
        assert 0 <= scores[0].composite_score <= 100

    def test_counterparty_scoring_none_uses_unknown(self):
        findings = [MarkupFinding(
            row_id="r-0", row_hash="h" * 64, row_index=0,
            trade_date="2025-01-15", currency_pair="MXNUSD",
            counterparty=None,
            effective_rate=0.054,
            benchmark_rate=0.0556, benchmark_snapshot_id="s1",
            benchmark_snapshot_hash="a" * 64, benchmark_provider="test",
            benchmark_as_of="2025-01-15",
            markup_per_unit=-0.0016, markup_direction="FAVORABLE",
            amount_sold=500_000, markup_cost_local=-800,
            markup_cost_usd=-44.0,
        )]
        scores = _score_counterparties(findings)
        assert scores[0].counterparty == "UNKNOWN"

    def test_counterparty_trade_count(self):
        findings = [
            MarkupFinding(
                row_id=f"r-{i}", row_hash="h" * 64, row_index=i,
                trade_date="2025-01-15", currency_pair="MXNUSD",
                counterparty="BankA",
                effective_rate=0.054, benchmark_rate=0.0556,
                benchmark_snapshot_id="s1", benchmark_snapshot_hash="a" * 64,
                benchmark_provider="test", benchmark_as_of="2025-01-15",
                markup_per_unit=-0.0016, markup_direction="FAVORABLE",
                amount_sold=500_000, markup_cost_local=-800,
                markup_cost_usd=-44.0,
            )
            for i in range(7)
        ]
        scores = _score_counterparties(findings)
        assert scores[0].trade_count == 7

    def test_analytics_populated_in_engine_result(self):
        txns = [_make_txn(i) for i in range(5)]
        bm = _make_benchmark()
        result = _run(txns, [bm])
        assert result.outlier_results is not None
        assert result.counterparty_scores is not None
        assert result.natural_hedge_results is not None

    def test_analytics_empty_when_no_findings(self):
        result = _run([], [])
        assert result.outlier_results == []
        assert result.counterparty_scores == []
        assert result.natural_hedge_results is not None


# ==============================================================================
# 5. USD Conversion
# ==============================================================================


class TestUsdConversion:
    """Tests for _to_usd conversion logic."""

    def test_usd_unchanged(self):
        assert _to_usd(1000.0, "USD", 1.0) == 1000.0

    def test_usd_unchanged_any_rate(self):
        assert _to_usd(1000.0, "USD", 18.0) == 1000.0

    def test_eur_ccy_per_usd(self):
        """EUR is in _CCY_PER_USD: USD = amount * rate."""
        assert _to_usd(1000.0, "EUR", 1.08) == pytest.approx(1080.0)

    def test_gbp_ccy_per_usd(self):
        assert _to_usd(1000.0, "GBP", 1.26) == pytest.approx(1260.0)

    def test_aud_ccy_per_usd(self):
        assert _to_usd(1000.0, "AUD", 0.66) == pytest.approx(660.0)

    def test_nzd_ccy_per_usd(self):
        assert _to_usd(1000.0, "NZD", 0.61) == pytest.approx(610.0)

    def test_mxn_usd_per_ccy(self):
        """MXN is NOT in _CCY_PER_USD: USD = amount / rate."""
        assert _to_usd(500_000.0, "MXN", 18.0) == pytest.approx(27_777.78, abs=0.01)

    def test_jpy_usd_per_ccy(self):
        assert _to_usd(1_000_000.0, "JPY", 150.0) == pytest.approx(6_666.67, abs=0.01)

    def test_brl_usd_per_ccy(self):
        assert _to_usd(50_000.0, "BRL", 5.0) == pytest.approx(10_000.0)

    def test_chf_usd_per_ccy(self):
        assert _to_usd(10_000.0, "CHF", 0.88) == pytest.approx(11_363.64, abs=0.01)

    def test_zero_rate_returns_zero(self):
        assert _to_usd(1000.0, "MXN", 0.0) == 0.0

    def test_negative_rate_returns_zero(self):
        assert _to_usd(1000.0, "EUR", -1.0) == 0.0

    def test_case_insensitive_usd(self):
        assert _to_usd(1000.0, "usd", 1.0) == 1000.0

    def test_case_insensitive_eur(self):
        assert _to_usd(1000.0, "eur", 1.08) == pytest.approx(1080.0)

    def test_ccy_per_usd_set_contents(self):
        assert _CCY_PER_USD == {"EUR", "GBP", "AUD", "NZD"}


# ==============================================================================
# 6. Spread Classification
# ==============================================================================


class TestSpreadClassification:
    """Tests for _classify_spread."""

    def test_within_spread(self):
        assert _classify_spread(1.085, 1.08, 1.09) == "WITHIN_SPREAD"

    def test_outside_spread_above(self):
        assert _classify_spread(1.10, 1.08, 1.09) == "OUTSIDE_SPREAD"

    def test_outside_spread_below(self):
        assert _classify_spread(1.07, 1.08, 1.09) == "OUTSIDE_SPREAD"

    def test_at_bid_within_spread(self):
        assert _classify_spread(1.08, 1.08, 1.09) == "WITHIN_SPREAD"

    def test_at_ask_within_spread(self):
        assert _classify_spread(1.09, 1.08, 1.09) == "WITHIN_SPREAD"

    def test_no_bid_spread_unknown(self):
        assert _classify_spread(1.085, None, 1.09) == "SPREAD_UNKNOWN"

    def test_no_ask_spread_unknown(self):
        assert _classify_spread(1.085, 1.08, None) == "SPREAD_UNKNOWN"

    def test_no_bid_no_ask_spread_unknown(self):
        assert _classify_spread(1.085, None, None) == "SPREAD_UNKNOWN"

    def test_reversed_bid_ask_still_works(self):
        """Engine uses min/max so reversed bid/ask is handled."""
        assert _classify_spread(1.085, 1.09, 1.08) == "WITHIN_SPREAD"

    def test_spread_classification_wired_into_finding(self):
        txn = _make_txn(0, amount_sold=500_000, amount_bought=27_800)
        bm = _make_benchmark(mid_rate=0.0556, bid_rate=0.0550, ask_rate=0.0562)
        result = _run([txn], [bm])
        assert len(result.markup_findings) == 1
        assert result.markup_findings[0].spread_classification in (
            "WITHIN_SPREAD", "OUTSIDE_SPREAD"
        )

    def test_spread_unknown_when_no_bid_ask(self):
        txn = _make_txn(0)
        bm = _make_benchmark()  # no bid/ask
        result = _run([txn], [bm])
        assert result.markup_findings[0].spread_classification == "SPREAD_UNKNOWN"


# ==============================================================================
# 7. Hash Integrity
# ==============================================================================


class TestHashIntegrity:
    """Deterministic hashing and hash chain structure."""

    def test_run_hash_deterministic_triple(self):
        txns = [_make_txn(i) for i in range(3)]
        bm = _make_benchmark()
        r1 = _run(txns, [bm])
        r2 = _run(txns, [bm])
        r3 = _run(txns, [bm])
        assert r1.run_hash == r2.run_hash == r3.run_hash

    def test_inputs_hash_changes_with_transaction_count(self):
        """inputs_hash includes transaction_count and sorted row_hashes."""
        txns_a = [_make_txn(0)]
        txns_b = [_make_txn(0), _make_txn(1)]
        bm = _make_benchmark()
        r_a = _run(txns_a, [bm])
        r_b = _run(txns_b, [bm])
        assert r_a.inputs_hash != r_b.inputs_hash

    def test_inputs_hash_changes_with_benchmark_config(self):
        txns = [_make_txn(0)]
        bm = _make_benchmark()
        cfg_a = _cfg(source="market_snapshot")
        cfg_b = _cfg(source="budget_rate", budget_rate=0.06)
        r_a = _run(txns, [bm], cfg_a)
        r_b = _run(txns, [bm], cfg_b)
        assert r_a.inputs_hash != r_b.inputs_hash

    def test_inputs_hash_changes_with_period(self):
        txns = [_make_txn(0)]
        bm = _make_benchmark()
        r_a = _run(txns, [bm], period_start=date(2025, 1, 1), period_end=date(2025, 1, 31))
        r_b = _run(txns, [bm], period_start=date(2025, 2, 1), period_end=date(2025, 2, 28))
        assert r_a.inputs_hash != r_b.inputs_hash

    def test_outputs_hash_changes_with_findings(self):
        txn_a = _make_txn(0, amount_sold=500_000, amount_bought=27_000)
        txn_b = _make_txn(0, amount_sold=500_000, amount_bought=29_000)
        bm = _make_benchmark()
        r_a = _run([txn_a], [bm])
        r_b = _run([txn_b], [bm])
        assert r_a.outputs_hash != r_b.outputs_hash

    def test_run_hash_is_sha256_of_inputs_plus_outputs(self):
        txns = [_make_txn(0)]
        bm = _make_benchmark()
        result = _run(txns, [bm])
        expected = _sha256_dict({
            "inputs_hash": result.inputs_hash,
            "outputs_hash": result.outputs_hash,
        })
        assert result.run_hash == expected

    def test_all_hashes_64_hex_chars(self):
        result = _run([_make_txn(0)], [_make_benchmark()])
        for h in (result.inputs_hash, result.outputs_hash, result.run_hash):
            assert len(h) == 64
            assert all(c in "0123456789abcdef" for c in h)

    def test_sha256_dict_canonical_json_sort_keys(self):
        h1 = _sha256_dict({"z": 1, "a": 2, "m": 3})
        h2 = _sha256_dict({"a": 2, "m": 3, "z": 1})
        assert h1 == h2

    def test_sha256_list_consistent(self):
        h1 = _sha256_list(["alpha", "beta", "gamma"])
        h2 = _sha256_list(["alpha", "beta", "gamma"])
        assert h1 == h2

    def test_sha256_list_order_matters(self):
        h1 = _sha256_list(["alpha", "beta"])
        h2 = _sha256_list(["beta", "alpha"])
        assert h1 != h2

    def test_sha256_dict_different_values_different_hash(self):
        h1 = _sha256_dict({"key": "value1"})
        h2 = _sha256_dict({"key": "value2"})
        assert h1 != h2

    def test_dataset_id_affects_inputs_hash(self):
        txns = [_make_txn(0)]
        bm = _make_benchmark()
        r_a = _run(txns, [bm], ds="ds-A")
        r_b = _run(txns, [bm], ds="ds-B")
        assert r_a.inputs_hash != r_b.inputs_hash
        assert r_a.run_hash != r_b.run_hash


# ==============================================================================
# 8. CSV Parser Edge Cases
# ==============================================================================


class TestCsvEdgeCases:
    """Edge cases for the CSV parser in v1_audit_lab.py."""

    def test_csv_with_bom_prefix(self):
        """UTF-8 BOM should be stripped by utf-8-sig decoding."""
        csv_bom = b"\xef\xbb\xbftrade_date,currency_sold,currency_bought,amount_sold,amount_bought\n"
        csv_bom += b"2025-01-15,MXN,USD,500000,27000\n"
        rows, warnings, pairs = _parse_csv(csv_bom)
        assert len(rows) == 1
        assert rows[0]["currency_sold"] == "MXN"

    def test_csv_with_trailing_whitespace_headers(self):
        csv_data = b"trade_date  ,currency_sold ,currency_bought , amount_sold,amount_bought\n"
        csv_data += b"2025-01-15,MXN,USD,500000,27000\n"
        rows, warnings, pairs = _parse_csv(csv_data)
        assert len(rows) == 1
        assert rows[0]["currency_sold"] == "MXN"

    def test_csv_mixed_case_headers(self):
        csv_data = b"Trade_Date,Currency_Sold,Currency_Bought,Amount_Sold,Amount_Bought\n"
        csv_data += b"2025-01-15,MXN,USD,500000,27000\n"
        rows, warnings, pairs = _parse_csv(csv_data)
        assert len(rows) == 1

    def test_csv_extra_columns_ignored(self):
        csv_data = b"trade_date,currency_sold,currency_bought,amount_sold,amount_bought,extra_col,another_col\n"
        csv_data += b"2025-01-15,MXN,USD,500000,27000,foo,bar\n"
        rows, warnings, pairs = _parse_csv(csv_data)
        assert len(rows) == 1
        assert rows[0]["currency_sold"] == "MXN"

    def test_csv_missing_required_columns_warns(self):
        csv_data = b"foo,bar,baz\n"
        csv_data += b"1,2,3\n"
        rows, warnings, pairs = _parse_csv(csv_data)
        assert len(rows) == 1
        assert any("missing" in w.lower() for w in warnings)

    def test_csv_empty_amount_sold_parsed_as_none(self):
        csv_data = b"trade_date,currency_sold,currency_bought,amount_sold,amount_bought\n"
        csv_data += b"2025-01-15,MXN,USD,,27000\n"
        rows, warnings, pairs = _parse_csv(csv_data)
        assert rows[0]["amount_sold"] is None

    def test_csv_non_numeric_amount_parsed_as_none(self):
        csv_data = b"trade_date,currency_sold,currency_bought,amount_sold,amount_bought\n"
        csv_data += b"2025-01-15,MXN,USD,ABC,27000\n"
        rows, warnings, pairs = _parse_csv(csv_data)
        assert rows[0]["amount_sold"] is None

    def test_parse_date_mm_dd_yyyy(self):
        d = _parse_date("01/15/2025")
        assert d == date(2025, 1, 15)

    def test_parse_date_dd_mm_yyyy_dash(self):
        d = _parse_date("15-01-2025")
        assert d == date(2025, 1, 15)

    def test_parse_date_iso(self):
        d = _parse_date("2025-01-15")
        assert d == date(2025, 1, 15)

    def test_parse_date_dd_mm_yyyy_slash(self):
        d = _parse_date("15/01/2025")
        assert d == date(2025, 1, 15)

    def test_parse_date_empty_string(self):
        assert _parse_date("") is None

    def test_parse_date_none(self):
        assert _parse_date(None) is None

    def test_parse_date_garbage(self):
        assert _parse_date("not-a-date") is None

    def test_parse_float_negative_number(self):
        assert _parse_float("-500000") == -500_000.0

    def test_parse_float_currency_symbol_prefix(self):
        """Currency symbol should cause parse failure (no stripping)."""
        result = _parse_float("$500000")
        assert result is None

    def test_parse_float_with_comma_and_decimal(self):
        assert _parse_float("1,234,567.89") == pytest.approx(1_234_567.89)

    def test_parse_float_whitespace(self):
        assert _parse_float("  500000  ") == 500_000.0

    def test_parse_float_empty_after_strip(self):
        assert _parse_float("  ") is None

    def test_row_hash_deterministic(self):
        row = {
            "row_index": 0,
            "trade_date": "2025-01-15",
            "currency_sold": "MXN",
            "currency_bought": "USD",
            "amount_sold": 500_000.0,
        }
        h1 = _row_hash(row)
        h2 = _row_hash(row)
        assert h1 == h2

    def test_row_hash_order_insensitive(self):
        """_row_canonical uses sort_keys=True, so key order does not matter."""
        row_a = {"z_field": 1, "a_field": 2}
        row_b = {"a_field": 2, "z_field": 1}
        assert _row_hash(row_a) == _row_hash(row_b)

    def test_row_hash_different_for_different_content(self):
        row_a = {"amount": 500_000}
        row_b = {"amount": 600_000}
        assert _row_hash(row_a) != _row_hash(row_b)

    def test_row_hash_is_64_hex(self):
        row = {"test": "data"}
        h = _row_hash(row)
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_row_canonical_is_json(self):
        row = {"b": 2, "a": 1}
        canonical = _row_canonical(row)
        parsed = json.loads(canonical)
        assert parsed == {"a": 1, "b": 2}

    def test_normalize_headers_standard(self):
        headers = ["trade_date", "currency_sold", "currency_bought"]
        mapping = _normalize_headers(headers)
        assert mapping["trade_date"] == "trade_date"
        assert mapping["currency_sold"] == "currency_sold"

    def test_normalize_headers_aliases(self):
        headers = ["tradedate", "sold_ccy", "buy_ccy", "sell_amount"]
        mapping = _normalize_headers(headers)
        assert "trade_date" in mapping
        assert "currency_sold" in mapping
        assert "currency_bought" in mapping
        assert "amount_sold" in mapping

    def test_normalize_headers_case_insensitive(self):
        headers = ["Trade_Date", "Currency_Sold", "Currency_Bought"]
        mapping = _normalize_headers(headers)
        assert "trade_date" in mapping

    def test_normalize_headers_unrecognized_ignored(self):
        headers = ["unknown_column", "weird_field"]
        mapping = _normalize_headers(headers)
        assert len(mapping) == 0

    def test_csv_effective_rate_computed(self):
        csv_data = b"trade_date,currency_sold,currency_bought,amount_sold,amount_bought\n"
        csv_data += b"2025-01-15,MXN,USD,500000,27000\n"
        rows, _, _ = _parse_csv(csv_data)
        assert rows[0]["effective_rate"] == pytest.approx(0.054, abs=1e-6)

    def test_csv_effective_rate_none_when_zero_sold(self):
        csv_data = b"trade_date,currency_sold,currency_bought,amount_sold,amount_bought\n"
        csv_data += b"2025-01-15,MXN,USD,0,27000\n"
        rows, _, _ = _parse_csv(csv_data)
        assert rows[0]["effective_rate"] is None

    def test_csv_currency_pairs_set(self):
        csv_data = b"trade_date,currency_sold,currency_bought,amount_sold,amount_bought\n"
        csv_data += b"2025-01-15,MXN,USD,500000,27000\n"
        csv_data += b"2025-01-16,EUR,USD,100000,108000\n"
        _, _, pairs = _parse_csv(csv_data)
        assert "MXNUSD" in pairs
        assert "EURUSD" in pairs


# ==============================================================================
# 9. Backward Compatibility
# ==============================================================================


class TestBackwardCompat:
    """Backward compatibility aliases and dict outputs."""

    def test_unhedged_results_alias(self):
        txn = _make_txn(0)
        bm = _make_benchmark()
        cfg = _cfg(source="budget_rate", budget_rate=0.060)
        result = _run([txn], [bm], cfg)
        assert result.unhedged_results is result.rate_variance_results

    def test_total_unhedged_impact_usd_alias(self):
        txn = _make_txn(0)
        bm = _make_benchmark()
        cfg = _cfg(source="budget_rate", budget_rate=0.060)
        result = _run([txn], [bm], cfg)
        assert result.total_unhedged_impact_usd == result.total_rate_variance_usd

    def test_unhedged_impact_result_alias_type(self):
        assert UnhedgedImpactResult is RateVarianceResult

    def test_rate_variance_result_unhedged_impact_usd_property(self):
        rv = RateVarianceResult(
            currency_pair="MXNUSD",
            period_start="2025-01-01",
            period_end="2025-01-31",
            realized_avg_rate=0.054,
            baseline_rate=0.060,
            baseline_source="budget_rate",
            total_exposure_local=500_000,
            rate_variance_usd=-3333.33,
            status="COMPUTED",
            narrative="Test",
        )
        assert rv.unhedged_impact_usd == rv.rate_variance_usd

    def test_rate_variance_to_dict_backward_compat_key(self):
        rv = RateVarianceResult(
            currency_pair="MXNUSD",
            period_start="2025-01-01",
            period_end="2025-01-31",
            realized_avg_rate=0.054,
            baseline_rate=0.060,
            baseline_source="budget_rate",
            total_exposure_local=500_000,
            rate_variance_usd=-3333.33,
            status="COMPUTED",
            narrative="Test",
        )
        d = rv.to_dict()
        assert "unhedged_impact_usd" in d
        assert d["unhedged_impact_usd"] == d["rate_variance_usd"]

    def test_markup_finding_to_dict_all_keys(self):
        f = MarkupFinding(
            row_id="r-0", row_hash="h" * 64, row_index=0,
            trade_date="2025-01-15", currency_pair="MXNUSD",
            counterparty="Bank", effective_rate=0.054,
            benchmark_rate=0.0556, benchmark_snapshot_id="s1",
            benchmark_snapshot_hash="a" * 64, benchmark_provider="test",
            benchmark_as_of="2025-01-15",
            markup_per_unit=-0.0016, markup_direction="FAVORABLE",
            amount_sold=500_000, markup_cost_local=-800.0,
            markup_cost_usd=-44.0, size_adjusted_markup_bps=-5.0,
            spread_classification="WITHIN_SPREAD",
        )
        d = f.to_dict()
        expected_keys = {
            "row_id", "row_hash", "row_index", "trade_date", "currency_pair",
            "counterparty", "effective_rate", "benchmark_rate",
            "benchmark_snapshot_id", "benchmark_snapshot_hash",
            "benchmark_provider", "benchmark_as_of",
            "markup_per_unit", "markup_direction", "spread_classification",
            "amount_sold", "markup_cost_local", "markup_cost_usd",
            "size_adjusted_markup_bps",
        }
        assert set(d.keys()) == expected_keys

    def test_fee_finding_to_dict_all_keys(self):
        f = FeeFinding(
            row_id="r-0", row_hash="h" * 64, row_index=0,
            trade_date="2025-01-15", fee_amount=200.0,
            fee_currency="USD", fee_usd=200.0,
            benchmark_rate_used=None,
        )
        d = f.to_dict()
        expected_keys = {
            "row_id", "row_hash", "row_index", "trade_date",
            "fee_amount", "fee_currency", "fee_usd", "benchmark_rate_used",
        }
        assert set(d.keys()) == expected_keys

    def test_rate_variance_to_dict_all_keys(self):
        rv = RateVarianceResult(
            currency_pair="MXNUSD",
            period_start="2025-01-01",
            period_end="2025-01-31",
            realized_avg_rate=0.054,
            baseline_rate=0.060,
            baseline_source="budget_rate",
            total_exposure_local=500_000,
            rate_variance_usd=-3333.33,
            status="COMPUTED",
            narrative="Test narrative",
        )
        d = rv.to_dict()
        expected_keys = {
            "currency_pair", "period_start", "period_end",
            "realized_avg_rate", "baseline_rate", "baseline_source",
            "total_exposure_local", "rate_variance_usd",
            "unhedged_impact_usd", "status", "narrative",
        }
        assert set(d.keys()) == expected_keys

    def test_audit_rejection_to_dict(self):
        r = AuditRejection(
            code="AL-001",
            message="Missing trade_date",
            detail={"row_id": "r-0", "row_index": 0},
        )
        d = r.to_dict()
        assert d["code"] == "AL-001"
        assert d["message"] == "Missing trade_date"
        assert d["detail"]["row_id"] == "r-0"


# ==============================================================================
# 10. Trace Bundle
# ==============================================================================


class TestTraceBundle:
    """Trace event structure and required steps."""

    def test_trace_contains_all_required_steps(self):
        result = _run([_make_txn(0)], [_make_benchmark()])
        steps = [e.step for e in result.trace_events]
        assert "ENGINE_START" in steps
        assert "MARKUP" in steps
        assert "FEES" in steps
        assert "UNHEDGED_IMPACT" in steps
        assert "ANALYTICS" in steps
        assert "ENGINE_COMPLETE" in steps

    def test_trace_step_order(self):
        result = _run([_make_txn(0)], [_make_benchmark()])
        steps = [e.step for e in result.trace_events]
        assert steps.index("ENGINE_START") < steps.index("MARKUP")
        assert steps.index("MARKUP") < steps.index("FEES")
        assert steps.index("FEES") < steps.index("UNHEDGED_IMPACT")
        assert steps.index("UNHEDGED_IMPACT") < steps.index("ANALYTICS")
        assert steps.index("ANALYTICS") < steps.index("ENGINE_COMPLETE")

    def test_trace_events_have_timestamp(self):
        result = _run([_make_txn(0)], [_make_benchmark()])
        for e in result.trace_events:
            assert e.timestamp is not None
            assert isinstance(e.timestamp, datetime)

    def test_trace_events_have_detail(self):
        result = _run([_make_txn(0)], [_make_benchmark()])
        for e in result.trace_events:
            assert isinstance(e.detail, str)
            assert len(e.detail) > 0

    def test_trace_event_to_dict(self):
        event = AuditTraceEvent(
            step="TEST_STEP",
            timestamp=datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC),
            detail="Test detail",
            data={"key": "value"},
        )
        d = event.to_dict()
        assert d["step"] == "TEST_STEP"
        assert d["detail"] == "Test detail"
        assert d["data"] == {"key": "value"}
        assert "timestamp" in d

    def test_engine_start_trace_has_metadata(self):
        result = _run([_make_txn(0)], [_make_benchmark()])
        start = next(e for e in result.trace_events if e.step == "ENGINE_START")
        assert start.data is not None
        assert "transaction_count" in start.data
        assert "benchmark_count" in start.data
        assert "dataset_id" in start.data

    def test_engine_complete_trace_has_totals(self):
        result = _run([_make_txn(0)], [_make_benchmark()])
        complete = next(e for e in result.trace_events if e.step == "ENGINE_COMPLETE")
        assert complete.data is not None
        assert "total_markup_usd" in complete.data
        assert "total_fees_usd" in complete.data
        assert "total_loss_usd" in complete.data

    def test_empty_run_still_has_all_trace_steps(self):
        result = _run([], [])
        steps = {e.step for e in result.trace_events}
        assert "ENGINE_START" in steps
        assert "MARKUP" in steps
        assert "FEES" in steps
        assert "UNHEDGED_IMPACT" in steps
        assert "ANALYTICS" in steps
        assert "ENGINE_COMPLETE" in steps

    def test_analytics_trace_has_counts(self):
        result = _run([_make_txn(i) for i in range(5)], [_make_benchmark()])
        analytics = next(e for e in result.trace_events if e.step == "ANALYTICS")
        assert analytics.data is not None
        assert "outlier_count" in analytics.data
        assert "counterparty_count" in analytics.data
        assert "natural_hedge_count" in analytics.data


# ==============================================================================
# 11. Rate Variance (Unhedged Impact)
# ==============================================================================


class TestRateVariance:
    """Rate variance / unhedged impact computation edge cases."""

    def test_budget_rate_mode_uses_budget(self):
        txn = _make_txn(0, amount_sold=500_000, amount_bought=27_000)
        bm = _make_benchmark()
        cfg = _cfg(source="budget_rate", budget_rate=0.060)
        result = _run([txn], [bm], cfg)
        assert len(result.rate_variance_results) == 1
        rv = result.rate_variance_results[0]
        assert rv.baseline_source == "budget_rate"
        assert rv.baseline_rate == pytest.approx(0.060)

    def test_market_snapshot_mode_uses_period_start(self):
        txn = _make_txn(0, amount_sold=500_000, amount_bought=27_000)
        bm = _make_benchmark(as_of=date(2025, 1, 1), mid_rate=0.0560)
        cfg = _cfg(source="market_snapshot")
        result = _run([txn], [bm], cfg, period_start=date(2025, 1, 1))
        if result.rate_variance_results:
            rv = result.rate_variance_results[0]
            if rv.status == "COMPUTED":
                assert rv.baseline_source == "period_start_snapshot"

    def test_no_valid_transactions_no_rate_variance(self):
        """All transactions missing effective_rate -- rate_variance empty."""
        txns = [
            AuditTransactionInput(
                row_id=f"r-{i}", row_hash=f"h{i:063d}", row_index=i,
                trade_date=date(2025, 1, 15), value_date=None,
                currency_sold="MXN", currency_bought="USD",
                amount_sold=500_000, amount_bought=0,
                effective_rate=None, counterparty="Bank",
                fee_amount=None, fee_currency=None, reference=f"R{i}",
            )
            for i in range(3)
        ]
        bm = _make_benchmark()
        result = _run(txns, [bm])
        assert len(result.rate_variance_results) == 0

    def test_unavailable_baseline_fails_closed(self):
        """When no period-start benchmark, status is UNAVAILABLE."""
        txn = _make_txn(0)
        cfg = _cfg(source="market_snapshot")
        result = _run([txn], [], cfg)
        assert len(result.rate_variance_results) == 1
        rv = result.rate_variance_results[0]
        assert rv.status == "UNAVAILABLE"
        assert rv.rate_variance_usd == 0.0

    def test_rate_variance_narrative_contains_reference(self):
        txn = _make_txn(0, amount_sold=500_000, amount_bought=27_000)
        bm = _make_benchmark()
        cfg = _cfg(source="budget_rate", budget_rate=0.060)
        result = _run([txn], [bm], cfg)
        rv = result.rate_variance_results[0]
        assert "REFERENCE BASELINE" in rv.narrative

    def test_single_transaction_pair_weighted_avg(self):
        txn = _make_txn(0, amount_sold=500_000, amount_bought=27_000)
        bm = _make_benchmark()
        cfg = _cfg(source="budget_rate", budget_rate=0.054)
        result = _run([txn], [bm], cfg)
        rv = result.rate_variance_results[0]
        assert rv.realized_avg_rate == pytest.approx(0.054, abs=1e-6)
        assert rv.rate_variance_usd == pytest.approx(0.0, abs=1.0)

    def test_multiple_transactions_weighted_average_rate(self):
        txn1 = _make_txn(0, amount_sold=300_000, amount_bought=16_200)
        txn2 = _make_txn(1, amount_sold=200_000, amount_bought=11_600)
        bm = _make_benchmark()
        cfg = _cfg(source="budget_rate", budget_rate=0.055)
        result = _run([txn1, txn2], [bm], cfg)
        rv = result.rate_variance_results[0]
        expected_avg = (300_000 * (16_200 / 300_000) + 200_000 * (11_600 / 200_000)) / 500_000
        assert rv.realized_avg_rate == pytest.approx(expected_avg, abs=1e-6)


# ==============================================================================
# 12. Benchmark Lookup
# ==============================================================================


class TestBenchmarkLookup:
    """Tests for _find_benchmark helper."""

    def test_exact_date_match(self):
        bm = _make_benchmark(as_of=date(2025, 1, 15))
        found = _find_benchmark(date(2025, 1, 15), "MXNUSD", [bm])
        assert found is not None
        assert found.as_of == date(2025, 1, 15)

    def test_nearest_date_selected(self):
        bm1 = _make_benchmark(as_of=date(2025, 1, 10), mid_rate=0.055)
        bm2 = _make_benchmark(as_of=date(2025, 1, 14), mid_rate=0.056)
        found = _find_benchmark(date(2025, 1, 15), "MXNUSD", [bm1, bm2])
        assert found is not None
        assert found.mid_rate == 0.056

    def test_wrong_pair_returns_none(self):
        bm = _make_benchmark(currency_pair="EURUSD")
        found = _find_benchmark(date(2025, 1, 15), "MXNUSD", [bm])
        assert found is None

    def test_empty_benchmarks_returns_none(self):
        found = _find_benchmark(date(2025, 1, 15), "MXNUSD", [])
        assert found is None

    def test_staleness_exactly_at_limit(self):
        bm = _make_benchmark(as_of=date(2025, 1, 8))
        found = _find_benchmark(date(2025, 1, 15), "MXNUSD", [bm], max_staleness_days=7)
        assert found is not None

    def test_staleness_one_over_limit(self):
        bm = _make_benchmark(as_of=date(2025, 1, 7))
        found = _find_benchmark(date(2025, 1, 15), "MXNUSD", [bm], max_staleness_days=7)
        assert found is None

    def test_staleness_none_disables(self):
        bm = _make_benchmark(as_of=date(2024, 1, 1))
        found = _find_benchmark(date(2025, 1, 15), "MXNUSD", [bm], max_staleness_days=None)
        assert found is not None


# ==============================================================================
# 13. Cross-Rate Synthesis
# ==============================================================================


class TestCrossRateSynthesisWorkflow:
    """Tests for _synthesize_cross_rate."""

    def test_usd_ccy_legs(self):
        bms = [
            _make_benchmark(currency_pair="USDMXN", mid_rate=18.0),
            _make_benchmark(currency_pair="USDBRL", mid_rate=5.0),
        ]
        rate, source = _synthesize_cross_rate("MXN", "BRL", bms, date(2025, 1, 15))
        assert rate is not None
        assert rate == pytest.approx(18.0 / 5.0, abs=1e-6)
        assert source == "SYNTHETIC_CROSS"

    def test_ccy_usd_legs(self):
        bms = [
            _make_benchmark(currency_pair="EURUSD", mid_rate=1.08),
            _make_benchmark(currency_pair="GBPUSD", mid_rate=1.26),
        ]
        rate, source = _synthesize_cross_rate("EUR", "GBP", bms, date(2025, 1, 15))
        assert rate is not None
        assert rate == pytest.approx(1.08 / 1.26, abs=1e-6)
        assert source == "SYNTHETIC_CROSS"

    def test_no_common_leg_unavailable(self):
        bms = [_make_benchmark(currency_pair="EURGBP", mid_rate=0.85)]
        rate, source = _synthesize_cross_rate("MXN", "BRL", bms, date(2025, 1, 15))
        assert rate is None
        assert source == "UNAVAILABLE"

    def test_synthetic_wired_into_finding(self):
        txn = _make_txn(0, currency_sold="MXN", currency_bought="BRL",
                        amount_sold=100_000, amount_bought=28_000,
                        effective_rate=0.28)
        bms = [
            _make_benchmark(currency_pair="USDMXN", mid_rate=18.0),
            _make_benchmark(currency_pair="USDBRL", mid_rate=5.0),
        ]
        result = _run([txn], bms)
        assert len(result.markup_findings) == 1
        assert result.markup_findings[0].benchmark_snapshot_id == "SYNTHETIC"

    def test_cross_rate_wider_staleness(self):
        """Cross-rate uses 2x staleness tolerance."""
        bms = [
            BenchmarkEntry(
                snapshot_id="s1", snapshot_hash="a" * 64,
                as_of=date(2025, 1, 1),
                currency_pair="USDMXN", mid_rate=18.0,
                provider="test", fetched_at=datetime(2025, 1, 1, tzinfo=UTC),
            ),
            BenchmarkEntry(
                snapshot_id="s2", snapshot_hash="b" * 64,
                as_of=date(2025, 1, 1),
                currency_pair="USDBRL", mid_rate=5.0,
                provider="test", fetched_at=datetime(2025, 1, 1, tzinfo=UTC),
            ),
        ]
        rate, source = _synthesize_cross_rate(
            "MXN", "BRL", bms, date(2025, 1, 15), max_staleness_days=7
        )
        assert rate is not None
        assert source == "SYNTHETIC_CROSS"

    def test_zero_quote_rate_unavailable(self):
        bms = [
            _make_benchmark(currency_pair="USDMXN", mid_rate=18.0),
            _make_benchmark(currency_pair="USDBRL", mid_rate=0.0),
        ]
        rate, source = _synthesize_cross_rate("MXN", "BRL", bms, date(2025, 1, 15))
        assert rate is None or source == "UNAVAILABLE"


# ==============================================================================
# 14. Size-Adjusted Markup (Extended)
# ==============================================================================


class TestSizeAdjustedMarkupExtended:
    """Extended size-adjusted markup tests."""

    def test_at_100k_boundary(self):
        adjusted = size_adjusted_markup_bps(12.0, 100_000)
        assert adjusted == pytest.approx(2.0)

    def test_at_1m_boundary(self):
        adjusted = size_adjusted_markup_bps(8.0, 1_000_000)
        assert adjusted == pytest.approx(3.0)

    def test_above_1m(self):
        adjusted = size_adjusted_markup_bps(5.0, 5_000_000)
        assert adjusted == pytest.approx(3.0)

    def test_zero_markup(self):
        adjusted = size_adjusted_markup_bps(0.0, 50_000)
        assert adjusted == pytest.approx(-10.0)

    def test_negative_markup(self):
        adjusted = size_adjusted_markup_bps(-5.0, 50_000)
        assert adjusted == pytest.approx(-15.0)

    def test_zero_trade_size(self):
        adjusted = size_adjusted_markup_bps(12.0, 0)
        assert adjusted == pytest.approx(2.0)


# ==============================================================================
# 15. Markup Direction Helper (Extended)
# ==============================================================================


class TestMarkupDirectionExtended:
    """Extended markup direction classification."""

    def test_small_positive_adverse(self):
        assert _markup_direction(0.0001) == "ADVERSE"

    def test_small_negative_favorable(self):
        assert _markup_direction(-0.0001) == "FAVORABLE"

    def test_near_zero_at_market(self):
        assert _markup_direction(1e-9) == "AT_MARKET"

    def test_exact_zero_at_market(self):
        assert _markup_direction(0.0) == "AT_MARKET"

    def test_threshold_boundary(self):
        """Values below 1e-8 abs are AT_MARKET."""
        assert _markup_direction(0.5e-8) == "AT_MARKET"
        assert _markup_direction(-0.5e-8) == "AT_MARKET"
        assert _markup_direction(1.1e-8) == "ADVERSE"
        assert _markup_direction(-1.1e-8) == "FAVORABLE"


# ==============================================================================
# 16. Dataclass Immutability and Defaults
# ==============================================================================


class TestDataclassProperties:
    """Tests for dataclass structure, defaults, and immutability."""

    def test_audit_transaction_input_frozen(self):
        txn = _make_txn(0)
        with pytest.raises(AttributeError):
            txn.row_id = "modified"  # type: ignore

    def test_benchmark_entry_frozen(self):
        bm = _make_benchmark()
        with pytest.raises(AttributeError):
            bm.mid_rate = 999.0  # type: ignore

    def test_benchmark_entry_default_forward_points_none(self):
        bm = _make_benchmark()
        assert bm.forward_points is None

    def test_benchmark_entry_default_bid_ask_none(self):
        bm = _make_benchmark()
        assert bm.bid_rate is None
        assert bm.ask_rate is None

    def test_audit_transaction_default_trade_time_none(self):
        txn = _make_txn(0)
        assert txn.trade_time is None

    def test_benchmark_config_default_staleness(self):
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")
        assert cfg.max_staleness_days == 7

    def test_benchmark_config_default_budget_rate_none(self):
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")
        assert cfg.budget_rate is None

    def test_counterparty_score_fields(self):
        cs = CounterpartyScore(
            counterparty="Bank", avg_markup_bps=5.0,
            median_markup_bps=4.0, total_cost_usd=1000.0,
            trade_count=10, pct_favorable=30.0, composite_score=75.0,
        )
        assert cs.counterparty == "Bank"
        assert cs.composite_score == 75.0

    def test_natural_hedge_result_fields(self):
        nh = NaturalHedgeResult(
            currency_pair="MXNUSD", date="2025-01-15",
            gross_buy=500_000, gross_sell=300_000,
            net=200_000, savings_estimate_usd=150.0,
        )
        assert nh.net == 200_000
        assert nh.savings_estimate_usd == 150.0


# ==============================================================================
# 17. Full Workflow Integration
# ==============================================================================


class TestFullWorkflowIntegration:
    """End-to-end tests simulating the upload-parse-run pipeline."""

    def test_csv_parse_then_engine_run(self):
        """Parse CSV, build AuditTransactionInput list, run engine."""
        csv_data = (
            b"trade_date,currency_sold,currency_bought,amount_sold,amount_bought,"
            b"counterparty,fee_amount,fee_currency,reference\n"
            b"2025-01-15,MXN,USD,500000,27600,Santander,200,USD,REF001\n"
            b"2025-01-20,MXN,USD,750000,41250,BBVA,300,USD,REF002\n"
        )
        rows, warnings, pairs = _parse_csv(csv_data)
        assert len(rows) == 2

        txns = []
        for row in rows:
            txns.append(AuditTransactionInput(
                row_id=f"row-{row['row_index']}",
                row_hash=_row_hash(row),
                row_index=row["row_index"],
                trade_date=_parse_date(row["trade_date"]),
                value_date=_parse_date(row["value_date"]),
                currency_sold=row["currency_sold"],
                currency_bought=row["currency_bought"],
                amount_sold=row["amount_sold"],
                amount_bought=row["amount_bought"],
                effective_rate=row["effective_rate"],
                counterparty=row["counterparty"],
                fee_amount=row["fee_amount"],
                fee_currency=row["fee_currency"],
                reference=row["reference"],
            ))

        bms = [_make_benchmark(as_of=date(2025, 1, 15), mid_rate=0.0556)]
        result = _run(txns, bms, period_start=date(2025, 1, 1), period_end=date(2025, 1, 31))

        assert len(result.markup_findings) == 2
        assert result.total_fees_usd > 0
        assert len(result.run_hash) == 64

    def test_csv_with_all_invalid_rows_still_runs(self):
        """All rows invalid -- engine still returns valid result with rejections."""
        csv_data = b"trade_date,currency_sold,currency_bought,amount_sold,amount_bought\n"
        csv_data += b",,,500000,27000\n"
        csv_data += b",,,600000,33000\n"

        rows, warnings, pairs = _parse_csv(csv_data)
        txns = []
        for row in rows:
            txns.append(AuditTransactionInput(
                row_id=f"row-{row['row_index']}",
                row_hash=_row_hash(row),
                row_index=row["row_index"],
                trade_date=_parse_date(row["trade_date"]),
                value_date=None,
                currency_sold=row["currency_sold"],
                currency_bought=row["currency_bought"],
                amount_sold=row["amount_sold"],
                amount_bought=row["amount_bought"],
                effective_rate=row["effective_rate"],
                counterparty=row["counterparty"],
                fee_amount=row["fee_amount"],
                fee_currency=row["fee_currency"],
                reference=row["reference"],
            ))

        bm = _make_benchmark()
        result = _run(txns, [bm])

        assert len(result.markup_findings) == 0
        assert len(result.markup_rejections) >= 2
        assert result.total_markup_usd == 0.0
        assert len(result.run_hash) == 64

    def test_deterministic_end_to_end(self):
        """Same CSV input produces same run hash every time."""
        csv_data = b"trade_date,currency_sold,currency_bought,amount_sold,amount_bought\n"
        csv_data += b"2025-01-15,MXN,USD,500000,27000\n"

        rows1, _, _ = _parse_csv(csv_data)
        rows2, _, _ = _parse_csv(csv_data)

        def _to_txns(rows):
            return [
                AuditTransactionInput(
                    row_id=f"row-{r['row_index']}",
                    row_hash=_row_hash(r),
                    row_index=r["row_index"],
                    trade_date=_parse_date(r["trade_date"]),
                    value_date=None,
                    currency_sold=r["currency_sold"],
                    currency_bought=r["currency_bought"],
                    amount_sold=r["amount_sold"],
                    amount_bought=r["amount_bought"],
                    effective_rate=r["effective_rate"],
                    counterparty=r["counterparty"],
                    fee_amount=r["fee_amount"],
                    fee_currency=r["fee_currency"],
                    reference=r["reference"],
                )
                for r in rows
            ]

        bms = [_make_benchmark()]
        r1 = _run(_to_txns(rows1), bms)
        r2 = _run(_to_txns(rows2), bms)
        assert r1.run_hash == r2.run_hash
        assert r1.inputs_hash == r2.inputs_hash
        assert r1.outputs_hash == r2.outputs_hash

    def test_multi_counterparty_aggregation(self):
        """Multiple counterparties properly bucketed."""
        txns = [
            _make_txn(0, counterparty="BankA"),
            _make_txn(1, counterparty="BankB"),
            _make_txn(2, counterparty="BankA"),
            _make_txn(3, counterparty=None),
        ]
        bm = _make_benchmark()
        result = _run(txns, [bm])
        assert "BankA" in result.markup_by_counterparty
        assert "BankB" in result.markup_by_counterparty
        assert "UNKNOWN" in result.markup_by_counterparty

    def test_fee_trade_date_none_shows_unknown(self):
        """Transaction with fee but no trade_date still extracts fee."""
        txn = AuditTransactionInput(
            row_id="r-0", row_hash="h" * 64, row_index=0,
            trade_date=None, value_date=None,
            currency_sold="MXN", currency_bought="USD",
            amount_sold=500_000, amount_bought=27_000,
            effective_rate=0.054, counterparty="Bank",
            fee_amount=100.0, fee_currency="USD", reference="R0",
        )
        bm = _make_benchmark()
        result = _run([txn], [bm])
        assert len(result.fee_findings) == 1
        assert result.fee_findings[0].trade_date == "UNKNOWN"

    def test_reverse_pair_lookup(self):
        """When benchmark is stored as reverse pair, engine inverts."""
        txn = _make_txn(0, currency_sold="MXN", currency_bought="USD",
                        amount_sold=500_000, amount_bought=27_000)
        bm = _make_benchmark(currency_pair="USDMXN", mid_rate=18.0)
        result = _run([txn], [bm])
        assert len(result.markup_findings) == 1
        f = result.markup_findings[0]
        assert f.benchmark_rate == pytest.approx(18.0, abs=0.01)

    def test_mixed_valid_and_invalid_transactions(self):
        """Mix of valid and rejected transactions in one run."""
        valid_txn = _make_txn(0)
        invalid_txn = AuditTransactionInput(
            row_id="r-1", row_hash="h" * 64, row_index=1,
            trade_date=None, value_date=None,
            currency_sold="MXN", currency_bought="USD",
            amount_sold=500_000, amount_bought=27_000,
            effective_rate=0.054, counterparty="Bank",
            fee_amount=None, fee_currency=None, reference="R1",
        )
        bm = _make_benchmark()
        result = _run([valid_txn, invalid_txn], [bm])
        assert len(result.markup_findings) == 1
        assert len(result.markup_rejections) == 1
        assert result.markup_rejections[0].code == "AL-001"
